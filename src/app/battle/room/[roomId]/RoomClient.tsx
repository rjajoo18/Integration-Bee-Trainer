'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  Users, Play, LogOut, Check, X, Clock, Shield, Lock,
  Copy, CheckCheck, Settings, Globe, AlertTriangle, Swords,
} from 'lucide-react';

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

const AVATAR_COLORS = [
  'bg-violet-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500',
  'bg-rose-500', 'bg-sky-500', 'bg-indigo-500', 'bg-pink-500',
];

function getAvatarColor(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

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
  const [copied, setCopied] = useState(false);

  const [needsJoinPassword, setNeedsJoinPassword] = useState(false);
  const [joinPassword, setJoinPassword] = useState('');

  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState('');
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

    // Room was deleted (host left) — notify all players
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
      setEditName(state.room.name);
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
        name: editName,
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

  function copyCode() {
    navigator.clipboard.writeText(roomId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  // ─── Room closed by host ───────────────────────────────────────────
  if (roomClosed) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-[#080c14] text-white flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <AlertTriangle size={40} className="text-amber-400 mx-auto mb-4" />
          <h2 className="text-2xl font-black mb-2">Room Closed</h2>
          <p className="text-sm text-zinc-500 mb-6">The host left the room. It has been closed.</p>
          <button
            onClick={() => (window.location.href = '/battle')}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 rounded-xl font-bold transition-all active:scale-95"
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
          <div className="inline-block h-8 w-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin mb-4" />
          <p className="text-sm text-zinc-500">Joining room…</p>
        </div>
      </div>
    );
  }

  // ─── Password prompt ───────────────────────────────────────────────
  if (!state && needsJoinPassword) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-[#080c14] text-white flex items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-7 shadow-2xl">
          <div className="flex items-center gap-2 text-base font-bold mb-2">
            <Lock size={18} className="text-indigo-400" />
            Password Required
          </div>
          <p className="text-sm text-zinc-500 mb-5">This is a private room. Enter the password to join.</p>
          {err && (
            <div className="mb-4 rounded-xl bg-red-950/30 border border-red-900/30 px-4 py-3 text-sm text-red-300">
              {err}
            </div>
          )}
          <input
            type="password"
            value={joinPassword}
            onChange={(e) => setJoinPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitJoinPassword()}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-base text-white placeholder:text-zinc-600 outline-none focus:border-indigo-500/50 mb-4 transition-colors"
            placeholder="Enter password…"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={submitJoinPassword}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-xl text-sm font-bold transition-all active:scale-95"
            >
              Join Room
            </button>
            <button
              onClick={() => (window.location.href = '/battle')}
              className="px-4 py-3 rounded-xl text-sm text-zinc-500 hover:text-white hover:bg-white/5 transition-colors"
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
            className="px-6 py-2.5 bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 rounded-xl text-sm transition-colors"
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
      <div className="border-b border-white/[0.06] bg-[#0a0f1c]/90 backdrop-blur-sm sticky top-16 z-10">
        <div className="mx-auto max-w-5xl px-6 py-3 flex items-center gap-4">
          <button
            onClick={leaveRoom}
            className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-red-400 font-medium transition-colors"
          >
            <LogOut size={14} />
            <span className="hidden sm:inline">Leave</span>
          </button>

          <div className="flex-1 flex flex-col items-center">
            <h1 className="text-sm font-bold text-white leading-tight">{room.name}</h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              {hasPassword && <Lock size={9} className="text-zinc-600" />}
              <span className="text-[10px] text-zinc-600 font-mono">{roomId.slice(0, 8)}…</span>
            </div>
          </div>

          <button
            onClick={copyCode}
            className="flex items-center gap-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] rounded-lg px-3 py-2 text-xs font-mono transition-all"
          >
            {copied ? (
              <><CheckCheck size={12} className="text-emerald-400" /><span className="text-emerald-400">Copied!</span></>
            ) : (
              <><Copy size={12} className="text-zinc-600" /><span className="text-zinc-500">Copy ID</span></>
            )}
          </button>
        </div>
      </div>

      {/* ─── Body ────────────────────────────────────────── */}
      <div className="mx-auto max-w-5xl px-6 py-8">

        {err && (
          <div className="mb-6 rounded-xl bg-red-950/20 border border-red-900/30 px-4 py-3 text-sm text-red-300 flex items-center gap-2">
            <X size={14} /> {err}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* ── Left ── */}
          <div className="lg:col-span-2 space-y-4">

            {/* Settings Card */}
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-[10px] font-black uppercase tracking-widest text-zinc-600 flex items-center gap-1.5">
                  <Settings size={11} /> Room Settings
                </h2>
                {isHost && room.status === 'lobby' && (
                  <button
                    onClick={() => setEditMode(!editMode)}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold transition-colors"
                  >
                    {editMode ? 'Cancel' : 'Edit'}
                  </button>
                )}
              </div>

              {editMode ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-600 mb-1.5">Room Name</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-indigo-500/50 transition-colors"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-600 mb-1.5">Difficulty</label>
                      <select
                        value={String(editDifficulty)}
                        onChange={(e) => setEditDifficulty(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                        className="w-full bg-[#0d1220] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-indigo-500/50 transition-colors cursor-pointer"
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
                      <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-600 mb-1.5">
                        Time / Problem — <span className="text-amber-400 normal-case font-bold">{editSeconds}s</span>
                      </label>
                      <input
                        type="range" min="10" max="600" step="10"
                        value={editSeconds}
                        onChange={(e) => setEditSeconds(parseInt(e.target.value, 10))}
                        className="w-full mt-3 accent-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-600 mb-1.5">
                        Max Players — <span className="text-blue-400 normal-case font-bold">{editMaxPlayers}</span>
                      </label>
                      <input
                        type="range" min="2" max="20"
                        value={editMaxPlayers}
                        onChange={(e) => setEditMaxPlayers(parseInt(e.target.value, 10))}
                        className="w-full mt-3 accent-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-600 mb-1.5">New Password</label>
                      <input
                        type="password"
                        value={editPassword}
                        onChange={(e) => setEditPassword(e.target.value)}
                        className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-zinc-700 outline-none focus:border-indigo-500/50 transition-colors"
                        placeholder="Leave blank to keep current"
                        autoComplete="new-password"
                      />
                    </div>
                  </div>

                  <label className="flex items-center gap-2.5 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={clearPassword}
                      onChange={(e) => setClearPassword(e.target.checked)}
                      className="accent-indigo-500 w-3.5 h-3.5"
                    />
                    <span className="text-xs text-zinc-500 group-hover:text-zinc-300 transition-colors">
                      Remove password (make room public)
                    </span>
                  </label>

                  <button
                    onClick={saveSettings}
                    disabled={saving}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50 active:scale-95"
                  >
                    {saving ? 'Saving…' : 'Save Settings'}
                  </button>
                </div>
              ) : (
                /* Settings display */
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { icon: <Shield size={11} />, label: 'Difficulty', value: difficultyLabel, color: 'text-white' },
                    { icon: <Clock size={11} />, label: 'Time Limit', value: `${room.secondsPerProblem}s`, color: 'text-amber-400' },
                    { icon: <Users size={11} />, label: 'Max Players', value: room.maxPlayers, color: 'text-sky-400' },
                    { icon: <Lock size={11} />, label: 'Access', value: hasPassword ? 'Private' : 'Public', color: 'text-zinc-300' },
                  ].map(({ icon, label, value, color }) => (
                    <div key={label} className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.05]">
                      <div className="text-[9px] uppercase font-black tracking-widest text-zinc-700 flex items-center gap-1 mb-2">
                        {icon} {label}
                      </div>
                      <div className={`text-lg font-black ${color}`}>{value}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Controls */}
            {room.status === 'lobby' && (
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 space-y-3">
                <div className="flex flex-col sm:flex-row gap-3">
                  {/* Ready toggle */}
                  <button
                    onClick={toggleReady}
                    disabled={toggling}
                    className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm transition-all disabled:opacity-50 active:scale-95 ${
                      isReady
                        ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                        : 'bg-white/[0.04] border border-white/[0.08] text-zinc-400 hover:bg-white/[0.07] hover:text-zinc-200 hover:border-white/[0.12]'
                    }`}
                  >
                    {isReady ? <Check size={17} /> : <X size={17} />}
                    {isReady ? 'Ready!' : 'Click when ready'}
                  </button>

                  {isHost && (
                    <button
                      onClick={startMatch}
                      disabled={!canStart || starting}
                      className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm bg-indigo-600 text-white hover:bg-indigo-500 transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:shadow-[0_0_24px_rgba(99,102,241,0.3)] active:scale-95"
                    >
                      <Play size={17} />
                      {starting ? 'Starting…' : 'Start Match'}
                    </button>
                  )}
                </div>

                {isHost && !canStart && (
                  <p className="text-xs text-zinc-700 text-center">
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
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 h-fit">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-zinc-600 flex items-center gap-1.5 mb-4">
              <Users size={11} />
              Players ({players.length}/{room.maxPlayers})
            </h2>

            <div className="space-y-2">
              {players.map((p) => {
                const label = displayName(p.username, p.userId);
                const initial = label.charAt(0).toUpperCase();
                const isThisHost = p.userId === room.hostUserId;
                const avatarColor = getAvatarColor(p.username ?? String(p.userId));

                return (
                  <div
                    key={p.userId}
                    className="flex items-center gap-3 bg-white/[0.03] rounded-xl p-3 border border-white/[0.05]"
                  >
                    <div className={`w-9 h-9 rounded-full ${avatarColor} flex items-center justify-center text-white text-sm font-black shrink-0`}>
                      {initial}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-semibold text-zinc-200 truncate">{label}</span>
                        {isThisHost && (
                          <span className="shrink-0 text-[9px] bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded-md font-black uppercase tracking-wide">
                            HOST
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0">
                      {p.isReady ? (
                        <div className="flex items-center gap-1 text-emerald-400 text-xs font-bold">
                          <Check size={12} /> Ready
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-zinc-600 text-xs">
                          <X size={12} /> Waiting
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Empty slots */}
              {Array.from({ length: Math.max(0, room.maxPlayers - players.length) }).map((_, i) => (
                <div
                  key={`empty-${i}`}
                  className="flex items-center gap-3 rounded-xl p-3 border border-dashed border-white/[0.04]"
                >
                  <div className="w-9 h-9 rounded-full bg-white/[0.03] border border-dashed border-white/[0.05]" />
                  <span className="text-xs text-zinc-800 italic">Waiting for player…</span>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-white/[0.05] flex items-center gap-2 text-xs text-zinc-700">
              {hasPassword ? (
                <><Lock size={10} /> Private room</>
              ) : (
                <><Globe size={10} /> Public room — anyone can join</>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
