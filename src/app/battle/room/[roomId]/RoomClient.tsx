'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Users, Settings, Play, LogOut, Check, X, Clock, Shield, Hash, Lock } from 'lucide-react';

type RoomState = {
  room: {
    id: string;
    name: string;
    difficulty: number | null;
    secondsPerProblem: number;
    maxPlayers: number;
    hasPassword: boolean;
    status: 'lobby' | 'in_game' | 'finished';
    hostUserId: number;
    createdAt: string;
    currentMatchId: string | null;
  };
  players: { userId: number; joinedAt: string; isReady: boolean }[];
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function RoomClient({ roomId }: { roomId: string }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const currentUserId = session?.user ? (session.user as any).id : null;

  const [state, setState] = useState<RoomState | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [starting, setStarting] = useState(false);
  const [toggling, setToggling] = useState(false);

  // Password join flow
  const [needsJoinPassword, setNeedsJoinPassword] = useState(false);
  const [joinPassword, setJoinPassword] = useState('');

  // Settings editing (host only)
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDifficulty, setEditDifficulty] = useState<string | number>('all');
  const [editSeconds, setEditSeconds] = useState(60);
  const [editMaxPlayers, setEditMaxPlayers] = useState(2);

  // Password edit flow (host only)
  const [editPassword, setEditPassword] = useState('');
  const [clearPassword, setClearPassword] = useState(false);

  const [saving, setSaving] = useState(false);

  const navigatingToMatchRef = useRef(false);

  async function load() {
    const r = await fetch(`/api/battle/rooms/${roomId}`, { cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j as any)?.error ?? 'Failed to load room');
    setState(j as RoomState);
  }

  async function attemptJoin(password: string | null) {
    const joinRes = await fetch(`/api/battle/rooms/${roomId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (!joinRes.ok) {
      const j = await joinRes.json().catch(() => ({}));
      const msg = (j as any)?.error ?? 'Failed to join';

      // These are your server messages in join route
      if (typeof msg === 'string' && msg.toLowerCase().includes('password')) {
        setNeedsJoinPassword(true);
      }

      throw new Error(msg);
    }

    // success
    setNeedsJoinPassword(false);
  }

  useEffect(() => {
    if (status === 'loading') return;

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
        // first attempt with no password
        await attemptJoin(null);
        if (!alive) return;

        await load();
        setLoading(false);

        interval = setInterval(() => {
          if (!alive) return;
          load().catch(() => {});
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

      if (!navigatingToMatchRef.current) {
        fetch(`/api/battle/rooms/${roomId}/leave`, { method: 'POST' }).catch(() => {});
      }
    };
  }, [roomId, status]);

  // Auto-redirect when match starts (guard that currentMatchId is actually a UUID)
  useEffect(() => {
    const cmid = state?.room?.currentMatchId ?? null;
    if (state?.room?.status === 'in_game' && cmid) {
      if (!UUID_RE.test(cmid)) {
        setErr(`Room currentMatchId is not a UUID: ${cmid}`);
        return;
      }
      navigatingToMatchRef.current = true;
      router.push(`/battle/match/${cmid}`);
    }
  }, [state?.room?.status, state?.room?.currentMatchId, router]);

  useEffect(() => {
    if (state?.room) {
      setEditName(state.room.name);
      setEditDifficulty(state.room.difficulty === null ? 'all' : state.room.difficulty);
      setEditSeconds(state.room.secondsPerProblem);
      setEditMaxPlayers(state.room.maxPlayers);

      // reset password edit widgets when room loads / refreshes
      setEditPassword('');
      setClearPassword(false);
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
      const payload: any = {
        name: editName,
        difficulty: editDifficulty,
        secondsPerProblem: editSeconds,
        maxPlayers: editMaxPlayers,
      };

      // password behavior:
      // - if clearPassword => send password: null
      // - else if editPassword non-empty => send password: <string>
      // - else => do not include password (leave unchanged)
      if (clearPassword) payload.password = null;
      else if (editPassword.trim()) payload.password = editPassword.trim();

      const r = await fetch(`/api/battle/rooms/${roomId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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

      // Let polling redirect
      await load();
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

  async function submitJoinPassword() {
    setErr(null);
    setLoading(true);

    try {
      await attemptJoin(joinPassword.trim() || null);
      await load();
      setNeedsJoinPassword(false);
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to join room');
    } finally {
      setLoading(false);
    }
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

  // If join failed due to password required, show a password prompt UI (instead of dumping them out)
  if (!state && needsJoinPassword) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900/40 p-6">
          <div className="flex items-center gap-2 text-lg font-bold">
            <Lock size={18} />
            Password Required
          </div>
          <p className="mt-2 text-sm text-zinc-400">
            This room is locked. Enter the password to join.
          </p>

          {err && (
            <div className="mt-4 rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">
              {err}
            </div>
          )}

          <input
            type="password"
            value={joinPassword}
            onChange={(e) => setJoinPassword(e.target.value)}
            className="mt-4 w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-2 text-sm outline-none focus:border-blue-500"
            placeholder="Enter password"
          />

          <div className="mt-4 flex gap-2">
            <button
              onClick={submitJoinPassword}
              className="flex-1 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl font-bold transition-colors"
            >
              Join
            </button>
            <button
              onClick={() => (window.location.href = '/battle')}
              className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-xl font-bold transition-colors"
            >
              Back
            </button>
          </div>
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
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              {room.name}
              {room.hasPassword && <Lock size={16} className="text-zinc-500" />}
            </h1>
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
                      Difficulty
                    </label>
                    <select
                      value={String(editDifficulty)}
                      onChange={(e) =>
                        setEditDifficulty(e.target.value === 'all' ? 'all' : Number(e.target.value))
                      }
                      className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-2 text-sm outline-none focus:border-blue-500"
                    >
                      <option value="all">All</option>
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="4">4</option>
                      <option value="5">5</option>
                    </select>
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
                      max="20"
                      value={editMaxPlayers}
                      onChange={(e) => setEditMaxPlayers(parseInt(e.target.value, 10))}
                      className="w-full"
                    />
                  </div>

                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950/30 p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Lock size={16} className="text-zinc-400" />
                      Password
                    </div>

                    <label className="block text-xs font-medium text-zinc-400 mt-3 mb-2">
                      Set new password (leave blank to keep unchanged)
                    </label>
                    <input
                      type="password"
                      value={editPassword}
                      onChange={(e) => setEditPassword(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-2 text-sm outline-none focus:border-blue-500"
                      placeholder="New password"
                      autoComplete="new-password"
                    />

                    <label className="mt-3 flex items-center gap-2 text-xs text-zinc-400">
                      <input
                        type="checkbox"
                        checked={clearPassword}
                        onChange={(e) => setClearPassword(e.target.checked)}
                      />
                      Clear password (make room public)
                    </label>

                    <div className="mt-2 text-xs text-zinc-500">
                      Current: {room.hasPassword ? 'Locked' : 'Public'}
                    </div>
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
                    <div className="text-2xl font-bold text-white">
                      {room.difficulty === null ? 'All' : room.difficulty}
                    </div>
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
                    <div className="text-lg font-bold text-green-400 capitalize">{room.status}</div>
                    <div className="mt-1 text-xs text-zinc-500 flex items-center gap-2">
                      <Lock size={12} className="text-zinc-600" />
                      {room.hasPassword ? 'Locked' : 'Public'}
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

            {!room.hasPassword && (
              <div className="mt-4 text-xs text-zinc-500">
                Room is public (no password).
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
