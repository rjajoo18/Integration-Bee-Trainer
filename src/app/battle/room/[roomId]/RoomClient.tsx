'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Users, Settings, Play, LogOut, Check, X, Clock, Shield, Hash } from 'lucide-react';

type RoomState = {
  room: {
    id: string;
    name: string;
    difficulty: number;
    secondsPerProblem: number;
    maxPlayers: number;
    hasPassword: boolean;
    status: 'lobby' | 'in_game' | 'finished';
    hostUserId: number;
    createdAt: string;
  };
  players: { userId: number; joinedAt: string; isReady: boolean }[];
};

export default function RoomClient({ roomId }: { roomId: string }) {
  const { data: session, status } = useSession();
  const currentUserId = session?.user ? (session.user as any).id : null;

  const [state, setState] = useState<RoomState | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [starting, setStarting] = useState(false);
  const [toggling, setToggling] = useState(false);

  // Settings editing (host only)
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDifficulty, setEditDifficulty] = useState(3);
  const [editSeconds, setEditSeconds] = useState(60);
  const [editMaxPlayers, setEditMaxPlayers] = useState(2);
  const [saving, setSaving] = useState(false);

  // avoid leaving room when we intentionally navigate to match
  const navigatingToMatchRef = useRef(false);

  async function load() {
    const r = await fetch(`/api/battle/rooms/${roomId}`, { cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j as any)?.error ?? 'Failed to load room');
    setState(j as RoomState);
  }

  useEffect(() => {
    if (status === 'loading') return;

    // If unauthenticated, show a clean error instead of spamming join/leave
    if (status !== 'authenticated') {
      setErr('You must be signed in to join a room.');
      setState(null);
      setLoading(false);
      return;
    }

    let alive = true;
    let interval: any = null;

    async function joinThenPoll() {
      setErr(null);
      setLoading(true);

      try {
        const joinRes = await fetch(`/api/battle/rooms/${roomId}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: null }),
        });

        if (!joinRes.ok) {
          const j = await joinRes.json().catch(() => ({}));
          throw new Error((j as any)?.error ?? 'Failed to join');
        }

        if (!alive) return;

        await load();
        setLoading(false);

        interval = setInterval(() => {
          if (!alive) return;
          load().catch(() => {
            // keep last known good state; surface a soft error
          });
        }, 1500);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message ?? 'Failed to join room');
        setState(null);
        setLoading(false);
      }
    }

    joinThenPoll();

    return () => {
      alive = false;
      if (interval) clearInterval(interval);

      // IMPORTANT: your leave route deletes the room if host leaves in lobby.
      // If we’re navigating to match, do NOT call leave, or you can race-delete the room.
      if (!navigatingToMatchRef.current) {
        fetch(`/api/battle/rooms/${roomId}/leave`, { method: 'POST' }).catch(() => {});
      }
    };
  }, [roomId, status]);

  useEffect(() => {
    if (state?.room) {
      setEditName(state.room.name);
      setEditDifficulty(state.room.difficulty);
      setEditSeconds(state.room.secondsPerProblem);
      setEditMaxPlayers(state.room.maxPlayers);
    }
  }, [state?.room]);

  const isHost = currentUserId === state?.room?.hostUserId;

  const currentPlayer = useMemo(
    () => state?.players.find((p) => p.userId === currentUserId),
    [state?.players, currentUserId]
  );

  const isReady = currentPlayer?.isReady ?? false;
  const allReady = state?.players.every((p) => p.isReady) ?? false;
  const canStart =
    !!state && state.players.length >= 2 && allReady && state.room.status === 'lobby';

  async function toggleReady() {
    if (!state || toggling) return;
    setToggling(true);
    setErr(null);

    try {
      const r = await fetch(`/api/battle/rooms/${roomId}/ready`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isReady: !isReady }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j as any)?.error ?? 'Failed to toggle ready');
      await load();
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to toggle ready');
    } finally {
      setToggling(false);
    }
  }

  async function saveSettings() {
    if (!isHost || saving) return;
    setSaving(true);
    setErr(null);

    try {
      const r = await fetch(`/api/battle/rooms/${roomId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName,
          difficulty: editDifficulty,
          secondsPerProblem: editSeconds,
          maxPlayers: editMaxPlayers,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j as any)?.error ?? 'Failed to update settings');
      await load();
      setEditMode(false);
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  async function startMatch() {
    if (!canStart || starting) return;
    setStarting(true);
    setErr(null);

    try {
      const r = await fetch(`/api/battle/rooms/${roomId}/start`, { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j as any)?.error ?? 'Failed to start');

      navigatingToMatchRef.current = true;
      window.location.href = `/battle/match/${(j as any).matchId}`;
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to start match');
      setStarting(false);
    }
  }

  async function leaveRoom() {
    navigatingToMatchRef.current = false;
    await fetch(`/api/battle/rooms/${roomId}/leave`, { method: 'POST' }).catch(() => {});
    window.location.href = '/battle';
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent" />
          <p className="mt-4 text-zinc-400">Loading room...</p>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">{err || 'Room not found'}</p>
          <button
            onClick={() => (window.location.href = '/battle')}
            className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors"
          >
            Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  const { room, players } = state;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">{room.name}</h1>
            <p className="text-sm text-zinc-500 font-mono flex items-center gap-2 mt-1">
              <Hash size={14} />
              {roomId.slice(0, 12)}
            </p>
          </div>
          <button
            onClick={leaveRoom}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors text-sm font-medium"
          >
            <LogOut size={16} />
            Leave Room
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-8">
        {err && (
          <div className="mb-6 rounded-2xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300 flex items-center gap-3">
            <X size={16} />
            {err}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Settings + Controls */}
          <div className="lg:col-span-2 space-y-6">
            {/* Room Settings */}
            <div className="rounded-3xl border border-zinc-800 bg-zinc-900/40 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <Settings size={20} />
                  Room Settings
                </h2>
                {isHost && room.status === 'lobby' && (
                  <button
                    onClick={() => setEditMode(!editMode)}
                    className="text-sm text-blue-400 hover:text-blue-300 font-medium"
                  >
                    {editMode ? 'Cancel' : 'Edit'}
                  </button>
                )}
              </div>

              {editMode ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-2">
                      Room Name
                    </label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-2 text-sm outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-2">
                      Difficulty (1-10): {editDifficulty}
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="10"
                      value={editDifficulty}
                      onChange={(e) => setEditDifficulty(parseInt(e.target.value, 10))}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-2">
                      Seconds per Problem: {editSeconds}s
                    </label>
                    <input
                      type="range"
                      min="10"
                      max="600"
                      step="10"
                      value={editSeconds}
                      onChange={(e) => setEditSeconds(parseInt(e.target.value, 10))}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-2">
                      Max Players: {editMaxPlayers}
                    </label>
                    <input
                      type="range"
                      min="2"
                      max="50"
                      value={editMaxPlayers}
                      onChange={(e) => setEditMaxPlayers(parseInt(e.target.value, 10))}
                      className="w-full"
                    />
                  </div>

                  <button
                    onClick={saveSettings}
                    disabled={saving}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white px-4 py-3 rounded-xl font-bold disabled:opacity-50 transition-colors"
                  >
                    {saving ? 'Saving...' : 'Save Settings'}
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-zinc-950/50 rounded-xl p-4 border border-zinc-800">
                    <div className="flex items-center gap-2 text-zinc-400 text-xs mb-1">
                      <Shield size={14} />
                      Difficulty
                    </div>
                    <div className="text-2xl font-bold text-white">{room.difficulty}</div>
                  </div>

                  <div className="bg-zinc-950/50 rounded-xl p-4 border border-zinc-800">
                    <div className="flex items-center gap-2 text-zinc-400 text-xs mb-1">
                      <Clock size={14} />
                      Time Limit
                    </div>
                    <div className="text-2xl font-bold text-white">{room.secondsPerProblem}s</div>
                  </div>

                  <div className="bg-zinc-950/50 rounded-xl p-4 border border-zinc-800">
                    <div className="flex items-center gap-2 text-zinc-400 text-xs mb-1">
                      <Users size={14} />
                      Max Players
                    </div>
                    <div className="text-2xl font-bold text-white">{room.maxPlayers}</div>
                  </div>

                  <div className="bg-zinc-950/50 rounded-xl p-4 border border-zinc-800">
                    <div className="text-zinc-400 text-xs mb-1">Status</div>
                    <div className="text-lg font-bold text-green-400 capitalize">
                      {room.status}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Ready/Start Controls */}
            {room.status === 'lobby' && (
              <div className="rounded-3xl border border-zinc-800 bg-zinc-900/40 p-6">
                <div className="flex flex-col md:flex-row gap-4">
                  <button
                    onClick={toggleReady}
                    disabled={toggling}
                    className={`flex-1 flex items-center justify-center gap-2 px-6 py-4 rounded-2xl font-bold transition-all ${
                      isReady
                        ? 'bg-green-600 hover:bg-green-500 text-white'
                        : 'bg-zinc-700 hover:bg-zinc-600 text-white'
                    } disabled:opacity-50`}
                  >
                    {isReady ? <Check size={20} /> : <X size={20} />}
                    {isReady ? 'Ready' : 'Not Ready'}
                  </button>

                  {isHost && (
                    <button
                      onClick={startMatch}
                      disabled={!canStart || starting}
                      className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-4 rounded-2xl font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      <Play size={20} />
                      {starting ? 'Starting...' : 'Start Match'}
                    </button>
                  )}
                </div>

                {isHost && !canStart && (
                  <p className="text-xs text-zinc-500 text-center mt-3">
                    {players.length < 2
                      ? 'Need at least 2 players'
                      : !allReady
                      ? 'All players must be ready'
                      : ''}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Right: Players List */}
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/40 p-6">
            <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
              <Users size={20} />
              Players ({players.length}/{room.maxPlayers})
            </h2>

            <div className="space-y-3">
              {players.map((p) => (
                <div
                  key={p.userId}
                  className="flex items-center justify-between bg-zinc-950/50 rounded-xl p-3 border border-zinc-800"
                >
                  <div>
                    <div className="text-sm font-medium text-white flex items-center gap-2">
                      User {p.userId}
                      {p.userId === room.hostUserId && (
                        <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full font-bold">
                          HOST
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-zinc-500">
                      Joined {new Date(p.joinedAt).toLocaleTimeString()}
                    </div>
                  </div>

                  <div>
                    {p.isReady ? (
                      <div className="flex items-center gap-1 text-green-400 text-xs font-bold">
                        <Check size={14} />
                        Ready
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-zinc-500 text-xs">
                        <X size={14} />
                        Not Ready
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
