'use client';

import React, { useEffect, useState } from 'react';

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
  players: { userId: number; joinedAt: string }[];
};

export default function RoomClient({ roomId }: { roomId: string }) {
  const [state, setState] = useState<RoomState | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [joining, setJoining] = useState(true);
  const [starting, setStarting] = useState(false);

  async function load() {
    const r = await fetch(`/api/battle/rooms/${roomId}`, { cache: 'no-store' });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error ?? 'Failed to load room');
    setState(j);
  }

  useEffect(() => {
    let alive = true;

    async function joinThenPoll() {
      setErr(null);
      try {
        await fetch(`/api/battle/rooms/${roomId}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: null }),
        });

        if (!alive) return;
        setJoining(false);

        await load();
        const t = setInterval(() => {
          load().catch(() => {});
        }, 1500);

        return () => clearInterval(t);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message ?? 'Failed to join room');
        setJoining(false);
      }
    }

    joinThenPoll();

    return () => {
      alive = false;
      fetch(`/api/battle/rooms/${roomId}/leave`, { method: 'POST' }).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const playerCount = state?.players?.length ?? 0;

  async function startMatch() {
    setStarting(true);
    setErr(null);
    try {
      const r = await fetch(`/api/battle/rooms/${roomId}/start`, { method: 'POST' });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? 'Failed to start');
      window.location.href = `/battle/match/${j.matchId}`;
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to start match');
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-4xl px-4 py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xl font-semibold">{state?.room?.name ?? 'Room'}</div>
            <div className="mt-1 text-sm text-zinc-400">
              Room ID: <span className="font-mono text-zinc-300">{roomId}</span>
            </div>
          </div>
          <button
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm hover:border-zinc-700"
            onClick={() => (window.location.href = '/battle')}
          >
            Back to Lobby
          </button>
        </div>

        {err && (
          <div className="mt-4 rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">
            {err}
          </div>
        )}

        <div className="mt-6 grid gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-2 py-1 text-zinc-300">
              Difficulty: {state?.room?.difficulty ?? '—'}
            </span>
            <span className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-2 py-1 text-zinc-300">
              Time: {state?.room?.secondsPerProblem ?? '—'}s
            </span>
            <span className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-2 py-1 text-zinc-300">
              Players: {playerCount}/{state?.room?.maxPlayers ?? '—'}
            </span>
            <span className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-2 py-1 text-zinc-300">
              Status: {state?.room?.status ?? '—'}
            </span>
          </div>

          <div className="mt-2">
            <div className="text-sm font-medium">Players</div>
            <div className="mt-2 grid gap-2">
              {(state?.players ?? []).map((p) => (
                <div key={p.userId} className="rounded-xl border border-zinc-800 bg-zinc-950/30 px-3 py-2">
                  <div className="text-sm text-zinc-200">{p.userId}</div>
                  <div className="text-xs text-zinc-500">
                    Joined: {new Date(p.joinedAt).toLocaleString()}
                  </div>
                </div>
              ))}
              {state && state.players.length === 0 && (
                <div className="text-sm text-zinc-400">No players yet.</div>
              )}
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between gap-3">
            <button
              className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm hover:border-zinc-700"
              onClick={async () => {
                await fetch(`/api/battle/rooms/${roomId}/leave`, { method: 'POST' }).catch(() => {});
                window.location.href = '/battle';
              }}
            >
              Leave Room
            </button>

            <button
              className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={joining || starting || !state || state.room.status !== 'lobby' || playerCount < 2}
              onClick={startMatch}
            >
              {starting ? 'Starting…' : 'Start Match'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
