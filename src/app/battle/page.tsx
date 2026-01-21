'use client';

import React, { useEffect, useMemo, useState } from 'react';

type Room = {
  id: string;
  name: string;
  difficulty: number;        // exact rating bucket (1..10 etc)
  secondsPerProblem: number; // time limit
  maxPlayers: number;
  playerCount: number;
  hasPassword: boolean;
  status: 'lobby' | 'in_game' | 'finished';
  hostName: string;
  createdAt: string;
};

function clampInt(v: string, min: number, max: number, fallback: number) {
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export default function BattleLobbyPage() {
  // --- Create Room Form ---
  const [name, setName] = useState('Integral Duel');
  const [difficulty, setDifficulty] = useState(3);
  const [secondsPerProblem, setSecondsPerProblem] = useState(60);
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [password, setPassword] = useState('');

  // --- Room List ---
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [roomsError, setRoomsError] = useState<string | null>(null);

  // --- Search/Filter ---
  const [search, setSearch] = useState('');
  const [showOpenOnly, setShowOpenOnly] = useState(true);

  // --- Create/Join feedback ---
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function fetchRooms() {
    setLoadingRooms(true);
    setRoomsError(null);
    try {
      const r = await fetch('/api/battle/rooms', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? 'Failed to load rooms');
      setRooms(j.rooms ?? []);
    } catch (e: any) {
      setRoomsError(e?.message ?? 'Failed to load rooms');
    } finally {
      setLoadingRooms(false);
    }
  }

  useEffect(() => {
    fetchRooms();
    const t = setInterval(fetchRooms, 2500); // MVP polling (swap to websocket later)
    return () => clearInterval(t);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rooms
      .filter((room) => {
        if (!q) return true;
        return (
          room.id.toLowerCase().includes(q) ||
          room.name.toLowerCase().includes(q) ||
          room.hostName.toLowerCase().includes(q)
        );
      })
      .filter((room) => {
        if (!showOpenOnly) return true;
        return room.status === 'lobby' && room.playerCount < room.maxPlayers;
      })
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [rooms, search, showOpenOnly]);

  async function createRoom() {
    setActionMsg(null);
    setActionErr(null);
    setCreating(true);
    try {
      const payload = {
        name: name.trim() || 'Integral Duel',
        difficulty,
        secondsPerProblem,
        maxPlayers,
        password: password.trim() || null,
      };

      const r = await fetch('/api/battle/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? 'Failed to create room');

      // redirect to room page
      window.location.href = `/battle/room/${j.room.id}`;
    } catch (e: any) {
      setActionErr(e?.message ?? 'Failed to create room');
    } finally {
      setCreating(false);
    }
  }

  async function joinRoom(roomId: string, needsPassword: boolean) {
    setActionMsg(null);
    setActionErr(null);

    let pwd: string | null = null;
    if (needsPassword) {
      const entered = window.prompt('Enter room password:');
      if (entered === null) return; // cancel
      pwd = entered.trim();
    }

    try {
      const r = await fetch(`/api/battle/rooms/${roomId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd || null }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? 'Failed to join room');

      window.location.href = `/battle/room/${roomId}`;
    } catch (e: any) {
      setActionErr(e?.message ?? 'Failed to join room');
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Top Bar */}
      <div className="sticky top-0 z-20 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xl font-semibold tracking-tight">Integral Battles</div>
            <div className="text-sm text-zinc-400">
              Create a room, invite friends, first to 3 correct wins.
            </div>
          </div>

          <div className="grid w-full gap-2 md:w-auto md:grid-cols-6">
            <input
              className="md:col-span-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-zinc-600"
              placeholder="Room name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm">
              <div className="text-[11px] text-zinc-400">Difficulty</div>
              <input
                className="w-full bg-transparent outline-none"
                inputMode="numeric"
                value={difficulty}
                onChange={(e) => setDifficulty(clampInt(e.target.value, 1, 10, 3))}
              />
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm">
              <div className="text-[11px] text-zinc-400">Seconds/problem</div>
              <input
                className="w-full bg-transparent outline-none"
                inputMode="numeric"
                value={secondsPerProblem}
                onChange={(e) => setSecondsPerProblem(clampInt(e.target.value, 10, 600, 60))}
              />
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm">
              <div className="text-[11px] text-zinc-400">Max players</div>
              <input
                className="w-full bg-transparent outline-none"
                inputMode="numeric"
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(clampInt(e.target.value, 2, 50, 2))}
              />
            </div>

            <input
              className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-zinc-600"
              placeholder="Password (optional)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <button
              className="rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              onClick={createRoom}
              disabled={creating}
            >
              {creating ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>

        {/* Search + toggles */}
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 pb-4 md:flex-row md:items-center md:justify-between">
          <input
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-zinc-600 md:max-w-md"
            placeholder="Search rooms by name, host, or ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                className="accent-zinc-100"
                checked={showOpenOnly}
                onChange={(e) => setShowOpenOnly(e.target.checked)}
              />
              Open rooms only
            </label>

            <button
              className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm hover:border-zinc-700"
              onClick={fetchRooms}
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-6xl px-4 py-6">
        {(actionErr || roomsError) && (
          <div className="mb-4 rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">
            {actionErr || roomsError}
          </div>
        )}
        {actionMsg && (
          <div className="mb-4 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-200">
            {actionMsg}
          </div>
        )}

        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm text-zinc-400">
            {loadingRooms ? 'Loading rooms…' : `${filtered.length} room(s)`}
          </div>
        </div>

        <div className="grid gap-3">
          {filtered.map((room) => (
            <div
              key={room.id}
              className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4"
            >
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="text-base font-semibold">{room.name}</div>
                    <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300">
                      {room.status}
                    </span>
                    {room.hasPassword && (
                      <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300">
                        🔒
                      </span>
                    )}
                  </div>

                  <div className="mt-1 text-xs text-zinc-400">
                    Host: <span className="text-zinc-300">{room.hostName}</span> · Room ID:{' '}
                    <span className="font-mono text-zinc-300">{room.id}</span>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-2 py-1 text-zinc-300">
                      Difficulty: {room.difficulty}
                    </span>
                    <span className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-2 py-1 text-zinc-300">
                      Time: {room.secondsPerProblem}s
                    </span>
                    <span className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-2 py-1 text-zinc-300">
                      Players: {room.playerCount}/{room.maxPlayers}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    className="rounded-lg border border-zinc-700 bg-zinc-950/30 px-3 py-2 text-sm hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => joinRoom(room.id, room.hasPassword)}
                    disabled={room.status !== 'lobby' || room.playerCount >= room.maxPlayers}
                  >
                    Join
                  </button>
                </div>
              </div>
            </div>
          ))}

          {!loadingRooms && filtered.length === 0 && (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-8 text-center text-sm text-zinc-400">
              No rooms found. Create one above.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
