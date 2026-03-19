'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Play, LogOut, Check, X, Lock, AlertTriangle } from 'lucide-react';

type RoomState = {
  room: {
    id: string;
    name: string;
    difficulty: number | null;
    secondsPerProblem: number;
    maxPlayers: number;
    hasPassword?: boolean;
    status: 'lobby' | 'in_game' | 'finished';
    hostUserId: number;
    createdAt: string | null;
    currentMatchId: string | null;
  };
  players: Array<{
    userId: number;
    username: string | null;
    isReady: boolean;
    joinedAt: string | null;
  }>;
  isPlayer?: boolean;
  isHost?: boolean;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function displayName(username: string | null | undefined, userId: number): string {
  if (!username?.trim()) return `Player ${userId}`;
  return username;
}

export default function RoomClient({ roomId }: { roomId: string }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const currentUserId = session?.user ? (session.user as any).id : null;

  const [state, setState] = useState<RoomState | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [roomClosed, setRoomClosed] = useState(false);

  const [starting, setStarting] = useState(false);
  const [toggling, setToggling] = useState(false);

  const [needsJoinPassword, setNeedsJoinPassword] = useState(false);
  const [joinPassword, setJoinPassword] = useState('');

  const [editMode, setEditMode] = useState(false);
  const [editDifficulty, setEditDifficulty] = useState<string | number>('all');
  const [editSeconds, setEditSeconds] = useState(60);
  const [editMaxPlayers, setEditMaxPlayers] = useState(2);
  const [editPassword, setEditPassword] = useState('');
  const [clearPassword, setClearPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  const navigatingToMatchRef = useRef(false);
  const hasInitializedEditForm = useRef(false);

  async function load() {
    const r = await fetch(`/api/battle/rooms/${roomId}`, { cache: 'no-store' });

    if (r.status === 404) {
      setRoomClosed(true);
      setState(null);
      return;
    }

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
      if (typeof msg === 'string' && msg.toLowerCase().includes('password')) {
        setNeedsJoinPassword(true);
      }
      throw new Error(msg);
    }
    setNeedsJoinPassword(false);
  }

  useEffect(() => {
    if (status === 'loading') return;

    if (status !== 'authenticated') {
      router.push('/auth');
      return;
    }

    let alive = true;
    let interval: any = null;

    async function joinThenPoll() {
      setErr(null);
      setLoading(true);
      try {
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

  useEffect(() => {
    if (state?.room && !hasInitializedEditForm.current) {
      setEditDifficulty(state.room.difficulty === null ? 'all' : state.room.difficulty);
      setEditSeconds(state.room.secondsPerProblem);
      setEditMaxPlayers(state.room.maxPlayers);
      hasInitializedEditForm.current = true;
    }
  }, [state?.room]);

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

  const computedIsHost = currentUserId === state?.room?.hostUserId;
  const isHost = state?.isHost ?? computedIsHost;

  const currentPlayer = useMemo(
    () => state?.players.find((p) => p.userId === currentUserId),
    [state?.players, currentUserId]
  );

  const isReady = currentPlayer?.isReady ?? false;
  const allReady = state?.players.every((p) => p.isReady) ?? false;
  const canStart = !!state && state.players.length >= 2 && allReady && state.room.status === 'lobby';

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
        difficulty: editDifficulty,
        secondsPerProblem: editSeconds,
        maxPlayers: editMaxPlayers,
      };
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
      setEditPassword('');
      setClearPassword(false);
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

  // ─── Room closed ───────────────────────────────────────────────────
  if (roomClosed) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-[#080c14] text-white flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <AlertTriangle size={28} className="text-zinc-600 mx-auto mb-4" />
          <h2 className="text-lg font-semibold mb-2">Room Closed</h2>
          <p className="text-sm text-zinc-500 mb-6">The host left the room. It has been closed.</p>
          <button
            onClick={() => (window.location.href = '/battle')}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          >
            Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  // ─── Loading ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-[#080c14] text-white flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-7 w-7 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin mb-3" />
          <p className="text-sm text-zinc-500">Joining room…</p>
        </div>
      </div>
    );
  }

  // ─── Password prompt ───────────────────────────────────────────────
  if (!state && needsJoinPassword) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-[#080c14] text-white flex items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-xl border border-white/[0.08] bg-white/[0.03] p-7">
          <div className="flex items-center gap-2 text-sm font-semibold mb-2">
            <Lock size={14} className="text-zinc-500" />
            Password Required
          </div>
          <p className="text-sm text-zinc-500 mb-5">This is a private room. Enter the password to join.</p>
          {err && (
            <div className="mb-4 rounded-lg border border-red-900/30 bg-red-950/20 px-4 py-3 text-sm text-red-300">
              {err}
            </div>
          )}
          <input
            type="password"
            value={joinPassword}
            onChange={(e) => setJoinPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitJoinPassword()}
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-indigo-500/50 mb-4 transition-colors"
            placeholder="Enter password…"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={submitJoinPassword}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-lg text-sm font-semibold transition-colors"
            >
              Join Room
            </button>
            <button
              onClick={() => (window.location.href = '/battle')}
              className="px-4 py-2.5 rounded-lg text-sm text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05] transition-colors"
            >
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Error / not found ─────────────────────────────────────────────
  if (!state) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-[#080c14] text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-sm mb-4">{err || 'Room not found'}</p>
          <button
            onClick={() => (window.location.href = '/battle')}
            className="px-6 py-2.5 bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] rounded-lg text-sm transition-colors"
          >
            Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  const { room, players } = state;
  const hasPassword = !!(room as any).hasPassword;
  const difficultyLabel = room.difficulty === null ? 'All Levels' : `Level ${room.difficulty}`;

  return (
    <div className="min-h-screen bg-[#080c14] text-white">

      {/* ─── Header ──────────────────────────────────────── */}
      <div className="border-b border-white/[0.06] bg-[#080c14] sticky top-16 z-10">
        <div className="mx-auto max-w-5xl px-6 py-3 flex items-center">
          <button
            onClick={leaveRoom}
            className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-200 font-medium transition-colors"
          >
            <LogOut size={14} />
            Leave
          </button>

          <div className="flex-1 flex items-center justify-center gap-2">
            <span className="text-sm font-medium text-zinc-400">Room Lobby</span>
            {hasPassword && <Lock size={11} className="text-zinc-600" />}
          </div>

          <div className="w-14" />
        </div>
      </div>

      {/* ─── Body ────────────────────────────────────────── */}
      <div className="mx-auto max-w-5xl px-6 py-8">

        {err && (
          <div className="mb-6 rounded-lg border border-red-900/30 bg-red-950/20 px-4 py-3 text-sm text-red-300">
            {err}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* ── Left column ── */}
          <div className="lg:col-span-2 space-y-4">

            {/* Settings */}
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                  Room Settings
                </h2>
                {isHost && room.status === 'lobby' && (
                  <button
                    onClick={() => setEditMode(!editMode)}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                  >
                    {editMode ? 'Cancel' : 'Edit'}
                  </button>
                )}
              </div>

              {editMode ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-zinc-500 mb-1.5">Difficulty</label>
                      <select
                        value={String(editDifficulty)}
                        onChange={(e) => setEditDifficulty(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                        className="w-full bg-[#0d1220] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-white outline-none focus:border-indigo-500/50 transition-colors cursor-pointer"
                      >
                        <option value="all">All Difficulties</option>
                        <option value="1">Level 1 — Easy</option>
                        <option value="2">Level 2</option>
                        <option value="3">Level 3 — Medium</option>
                        <option value="4">Level 4</option>
                        <option value="5">Level 5 — Hard</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-zinc-500 mb-1.5">
                        Time per Problem — <span className="text-zinc-300">{editSeconds}s</span>
                      </label>
                      <input
                        type="range" min="10" max="600" step="10"
                        value={editSeconds}
                        onChange={(e) => setEditSeconds(parseInt(e.target.value, 10))}
                        className="w-full mt-3 accent-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-zinc-500 mb-1.5">
                        Max Players — <span className="text-zinc-300">{editMaxPlayers}</span>
                      </label>
                      <input
                        type="range" min="2" max="20"
                        value={editMaxPlayers}
                        onChange={(e) => setEditMaxPlayers(parseInt(e.target.value, 10))}
                        className="w-full mt-3 accent-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-zinc-500 mb-1.5">New Password</label>
                      <input
                        type="password"
                        value={editPassword}
                        onChange={(e) => setEditPassword(e.target.value)}
                        className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-zinc-700 outline-none focus:border-indigo-500/50 transition-colors"
                        placeholder="Leave blank to keep current"
                        autoComplete="new-password"
                      />
                    </div>
                  </div>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={clearPassword}
                      onChange={(e) => setClearPassword(e.target.checked)}
                      className="accent-indigo-500 w-3.5 h-3.5"
                    />
                    <span className="text-xs text-zinc-500">Remove password (make room public)</span>
                  </label>

                  <button
                    onClick={saveSettings}
                    disabled={saving}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save Settings'}
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Difficulty', value: difficultyLabel },
                    { label: 'Time Limit', value: `${room.secondsPerProblem}s` },
                    { label: 'Max Players', value: String(room.maxPlayers) },
                    { label: 'Access', value: hasPassword ? 'Private' : 'Public' },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-4">
                      <div className="text-[10px] uppercase font-semibold tracking-widest text-zinc-600 mb-2">
                        {label}
                      </div>
                      <div className="text-sm font-semibold text-white">{value}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Controls */}
            {room.status === 'lobby' && (
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-5 space-y-3">
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={toggleReady}
                    disabled={toggling}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-semibold text-sm transition-colors disabled:opacity-50 ${
                      isReady
                        ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                        : 'bg-white/[0.04] border border-white/[0.08] text-zinc-400 hover:bg-white/[0.07] hover:text-zinc-200'
                    }`}
                  >
                    {isReady ? <Check size={15} /> : <X size={15} />}
                    {isReady ? 'Ready' : 'Not Ready'}
                  </button>

                  {isHost && (
                    <button
                      onClick={startMatch}
                      disabled={!canStart || starting}
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-semibold text-sm bg-indigo-600 text-white hover:bg-indigo-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Play size={15} />
                      {starting ? 'Starting…' : 'Start Match'}
                    </button>
                  )}
                </div>

                {isHost && !canStart && (
                  <p className="text-xs text-zinc-600 text-center">
                    {players.length < 2
                      ? 'Need at least 2 players to start'
                      : !allReady
                        ? 'Waiting for all players to be ready'
                        : ''}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* ── Right: Players ── */}
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-5 h-fit">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-4">
              Players ({players.length}/{room.maxPlayers})
            </h2>

            <div className="space-y-2">
              {players.map((p) => {
                const label = displayName(p.username, p.userId);
                const initial = label.charAt(0).toUpperCase();
                const isThisHost = p.userId === room.hostUserId;

                return (
                  <div
                    key={p.userId}
                    className="flex items-center gap-3 rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2.5"
                  >
                    <div className="w-8 h-8 rounded-md bg-white/[0.06] flex items-center justify-center text-zinc-300 text-sm font-semibold shrink-0">
                      {initial}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-zinc-200 truncate">{label}</span>
                        {isThisHost && (
                          <span className="shrink-0 text-[9px] bg-white/[0.06] text-zinc-500 px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide">
                            HOST
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0">
                      {p.isReady ? (
                        <span className="text-emerald-400 text-xs font-semibold">Ready</span>
                      ) : (
                        <span className="text-zinc-600 text-xs">Waiting</span>
                      )}
                    </div>
                  </div>
                );
              })}

              {Array.from({ length: Math.max(0, room.maxPlayers - players.length) }).map((_, i) => (
                <div
                  key={`empty-${i}`}
                  className="flex items-center gap-3 rounded-lg border border-dashed border-white/[0.04] px-3 py-2.5"
                >
                  <div className="w-8 h-8 rounded-md border border-dashed border-white/[0.04]" />
                  <span className="text-xs text-zinc-700">Empty slot</span>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-white/[0.05] text-xs text-zinc-600">
              {hasPassword ? 'Private room' : 'Public room'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
