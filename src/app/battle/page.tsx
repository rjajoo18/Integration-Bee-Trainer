"use client";

import React, { useEffect, useMemo, useState, useRef } from "react";
import {
  Shield,
  Users,
  Clock,
  Lock,
  Swords,
  Search,
  RefreshCw,
  Plus,
  Trophy,
  Hash,
} from "lucide-react";

type Room = {
  id: string;
  name: string;
  difficulty: number | null;
  secondsPerProblem: number;
  maxPlayers: number;
  playerCount: number;
  hasPassword: boolean;
  status: "lobby" | "in_game" | "finished";
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
  const [name, setName] = useState("Integral Duel");
  const [difficulty, setDifficulty] = useState<string | number>("all");
  const [secondsPerProblem, setSecondsPerProblem] = useState(60);
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [password, setPassword] = useState("");

  // Track if user has touched any field to prevent overwriting
  const userHasEditedRef = useRef({
    name: false,
    difficulty: false,
    secondsPerProblem: false,
    maxPlayers: false,
    password: false
  });

  // --- Room List ---
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [roomsError, setRoomsError] = useState<string | null>(null);

  // --- Search/Filter ---
  const [search, setSearch] = useState("");
  const [showOpenOnly, setShowOpenOnly] = useState(true);

  // --- Create/Join feedback ---
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function fetchRooms() {
    setLoadingRooms(true);
    setRoomsError(null);
    try {
      const r = await fetch("/api/battle/rooms", { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j as any)?.error ?? "Failed to load rooms");
      setRooms((j as any).rooms ?? []);
    } catch (e: any) {
      setRoomsError(e?.message ?? "Failed to load rooms");
    } finally {
      setLoadingRooms(false);
    }
  }

  useEffect(() => {
    fetchRooms();
    const t = setInterval(fetchRooms, 3000);
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
        return room.status === "lobby" && room.playerCount < room.maxPlayers;
      })
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [rooms, search, showOpenOnly]);

  async function createRoom() {
    setActionErr(null);
    setCreating(true);
    try {
      const payload = {
        name: name.trim() || "Integral Duel",
        difficulty,
        secondsPerProblem,
        maxPlayers,
        password: password.trim() || null,
      };

      const r = await fetch("/api/battle/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j as any)?.error ?? "Failed to create room");

      window.location.href = `/battle/room/${(j as any).room.id}`;
    } catch (e: any) {
      setActionErr(e?.message ?? "Failed to create room");
    } finally {
      setCreating(false);
    }
  }

  async function joinRoom(roomId: string, needsPassword: boolean) {
    setActionErr(null);
    let pwd: string | null = null;
    if (needsPassword) {
      const entered = window.prompt("Enter room password:");
      if (entered === null) return;
      pwd = entered.trim();
    }

    try {
      const r = await fetch(`/api/battle/rooms/${roomId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pwd || null }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j as any)?.error ?? "Failed to join room");

      window.location.href = `/battle/room/${roomId}`;
    } catch (e: any) {
      setActionErr(e?.message ?? "Failed to join room");
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 selection:bg-indigo-500/30 font-sans">
      {/* Header */}
      <div className="relative border-b border-zinc-800 bg-zinc-900/20 pt-10 pb-16">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-indigo-500/10 via-transparent to-transparent" />
        <div className="relative mx-auto max-w-6xl px-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div>
              <h1 className="flex items-center gap-3 text-4xl font-extrabold tracking-tight text-white">
                <Swords className="text-indigo-500" size={36} />
                Integral Battles
              </h1>
            </div>

            <div className="flex gap-4">
              <div className="rounded-2xl bg-zinc-900/50 border border-zinc-800 px-5 py-3 backdrop-blur-sm">
                <span className="block text-zinc-500 text-[10px] uppercase font-black tracking-widest mb-1">
                  Active Rooms
                </span>
                <span className="text-2xl font-bold">{rooms.length}</span>
              </div>
              <div className="rounded-2xl bg-zinc-900/50 border border-zinc-800 px-5 py-3 backdrop-blur-sm">
                <span className="block text-zinc-500 text-[10px] uppercase font-black tracking-widest mb-1">
                  Live Players
                </span>
                <span className="text-2xl font-bold text-green-400">
                  {rooms.reduce((acc, r) => acc + r.playerCount, 0)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 -mt-8">
        {/* Toolbar */}
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-2 shadow-2xl ring-1 ring-white/5">
          <div className="flex flex-col lg:flex-row lg:items-center gap-2">
            {/* Left: inputs + settings */}
            <div className="flex-1 min-w-0 flex flex-col lg:flex-row lg:items-center gap-2">
              <div className="flex-1 min-w-[240px] relative group">
                <input
                  className="w-full bg-transparent px-5 py-3 text-sm outline-none placeholder:text-zinc-600 border-none focus:ring-0"
                  placeholder="Room Name (e.g. Speed Integration)"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    userHasEditedRef.current.name = true;
                  }}
                />
                <div className="absolute bottom-1 left-5 right-5 h-[1px] bg-zinc-800 group-focus-within:bg-indigo-500 transition-colors" />
              </div>

              <div className="flex items-center gap-4 px-4 overflow-x-auto no-scrollbar border border-zinc-800/0">
                {/* Difficulty Dropdown */}
                <div className="flex flex-col">
                  <span className="text-[9px] uppercase text-zinc-500 font-bold mb-1">
                    Difficulty
                  </span>
                  <div className="flex items-center gap-2">
                    <Shield size={14} className="text-indigo-400" />
                    <select
                      className="bg-transparent text-sm font-bold outline-none border-none focus:ring-0 cursor-pointer"
                      value={difficulty}
                      onChange={(e) => {
                        setDifficulty(e.target.value === "all" ? "all" : Number(e.target.value));
                        userHasEditedRef.current.difficulty = true;
                      }}
                    >
                      <option value="all">All</option>
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="4">4</option>
                      <option value="5">5</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-col border-l border-zinc-800 pl-4">
                  <span className="text-[9px] uppercase text-zinc-500 font-bold mb-1">
                    Time (s)
                  </span>
                  <div className="flex items-center gap-2">
                    <Clock size={14} className="text-amber-400" />
                    <input
                      className="w-10 bg-transparent text-sm font-bold outline-none"
                      value={secondsPerProblem}
                      onChange={(e) => {
                        setSecondsPerProblem(clampInt(e.target.value, 10, 600, 60));
                        userHasEditedRef.current.secondsPerProblem = true;
                      }}
                    />
                  </div>
                </div>

                {/* Max Players: 2-20 */}
                <div className="flex flex-col border-l border-zinc-800 pl-4">
                  <span className="text-[9px] uppercase text-zinc-500 font-bold mb-1">
                    Max Players
                  </span>
                  <div className="flex items-center gap-2">
                    <Users size={14} className="text-blue-400" />
                    <input
                      className="w-8 bg-transparent text-sm font-bold outline-none"
                      value={maxPlayers}
                      onChange={(e) => {
                        setMaxPlayers(clampInt(e.target.value, 2, 20, 2));
                        userHasEditedRef.current.maxPlayers = true;
                      }}
                    />
                  </div>
                </div>

                <div className="flex flex-col border-l border-zinc-800 pl-4 min-w-[160px]">
                  <span className="text-[9px] uppercase text-zinc-500 font-bold mb-1">
                    Password (optional)
                  </span>
                  <div className="flex items-center gap-2">
                    <Lock size={14} className="text-zinc-500" />
                    <input
                      type="password"
                      className="w-full bg-transparent text-sm font-bold outline-none placeholder:text-zinc-700"
                      placeholder="leave blank"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        userHasEditedRef.current.password = true;
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Right: action button */}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={createRoom}
                disabled={creating}
                className="shrink-0 cursor-pointer flex items-center gap-2 rounded-2xl bg-indigo-600 px-8 py-3.5 text-sm font-bold text-white transition-all hover:bg-indigo-500 hover:shadow-[0_0_20px_rgba(79,70,229,0.4)] active:scale-95 disabled:opacity-50"
              >
                {creating ? <RefreshCw className="animate-spin" size={18} /> : <Plus size={18} />}
                Create Duel
              </button>
            </div>
          </div>
        </div>

        {(actionErr || roomsError) && (
          <div className="mt-6 rounded-2xl border border-red-900/50 bg-red-950/20 px-4 py-3 text-sm text-red-300 flex items-center gap-3">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            {actionErr || roomsError}
          </div>
        )}

        {/* Main content */}
        <div className="mt-10 grid grid-cols-1 lg:grid-cols-4 gap-10">
          <div className="space-y-8">
            <section>
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 mb-4">
                Find Battle
              </h3>
              <div className="relative group">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within:text-indigo-400 transition-colors"
                  size={18}
                />
                <input
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900/50 py-3 pl-10 pr-4 text-sm outline-none focus:border-indigo-500/50 transition-all focus:bg-zinc-900"
                  placeholder="ID or Host Name..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </section>

            <section className="pt-6 border-t border-zinc-900">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 mb-4">
                Filters
              </h3>
              <label className="flex cursor-pointer items-center justify-between group rounded-xl border border-zinc-800 p-3 hover:bg-zinc-900 transition-colors">
                <span className="text-sm text-zinc-400 group-hover:text-zinc-200">
                  Open Duels Only
                </span>
                <div
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    showOpenOnly ? "bg-indigo-600" : "bg-zinc-700"
                  }`}
                >
                  <div
                    className={`inline-block h-3 w-3 transform rounded-full bg-white transition-all ${
                      showOpenOnly ? "translate-x-5" : "translate-x-1"
                    }`}
                  />
                </div>
                <input
                  type="checkbox"
                  className="hidden"
                  checked={showOpenOnly}
                  onChange={(e) => setShowOpenOnly(e.target.checked)}
                />
              </label>
            </section>
          </div>

          <div className="lg:col-span-3">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-sm font-bold text-zinc-500 tracking-wide uppercase">
                Browse <span className="text-white">{filtered.length}</span> results
              </h2>
              <button
                type="button"
                onClick={fetchRooms}
                className="cursor-pointer p-2 text-zinc-500 hover:text-white transition-colors bg-zinc-900 rounded-lg border border-zinc-800"
              >
                <RefreshCw size={16} className={loadingRooms ? "animate-spin" : ""} />
              </button>
            </div>

            <div className="space-y-4">
              {filtered.map((room) => (
                <div
                  key={room.id}
                  className="group relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 transition-all hover:border-zinc-600 hover:bg-zinc-900/80 hover:shadow-xl shadow-black/40"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <span className="text-xl font-bold text-white group-hover:text-indigo-400 transition-colors">
                          {room.name}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-tighter ${
                            room.status === "lobby"
                              ? "bg-green-500/10 text-green-500 border border-green-500/20"
                              : "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                          }`}
                        >
                          {room.status === "lobby" ? "Open" : "Running"}
                        </span>
                        {room.hasPassword && <Lock size={16} className="text-zinc-600" />}
                      </div>

                      <div className="flex items-center gap-4 text-xs">
                        <div className="flex items-center gap-1.5 text-zinc-400">
                          <Trophy size={12} className="text-zinc-500" />
                          Host:{" "}
                          <span className="text-zinc-200 font-medium">{room.hostName}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-zinc-400">
                          <Hash size={12} className="text-zinc-500" />
                          <span className="font-mono text-zinc-500">{room.id.slice(0, 8)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-6">
                      <div className="grid grid-cols-3 gap-8 pr-6 border-r border-zinc-800">
                        <div className="text-center">
                          <span className="block text-[9px] uppercase text-zinc-600 font-bold mb-1">
                            Difficulty
                          </span>
                          <span className="text-sm font-mono text-indigo-300 tracking-widest">
                            {room.difficulty === null ? "All" : room.difficulty}
                          </span>
                        </div>
                        <div className="text-center">
                          <span className="block text-[9px] uppercase text-zinc-600 font-bold mb-1">
                            Limit
                          </span>
                          <span className="text-sm font-mono text-amber-300 tracking-widest">
                            {room.secondsPerProblem}s
                          </span>
                        </div>
                        <div className="text-center">
                          <span className="block text-[9px] uppercase text-zinc-600 font-bold mb-1">
                            Players
                          </span>
                          <span
                            className={`text-sm font-mono tracking-widest ${
                              room.playerCount >= room.maxPlayers ? "text-zinc-500" : "text-green-400"
                            }`}
                          >
                            {room.playerCount}/{room.maxPlayers}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => joinRoom(room.id, room.hasPassword)}
                        disabled={room.status !== "lobby" || room.playerCount >= room.maxPlayers}
                        className="cursor-pointer rounded-xl bg-zinc-100 px-8 py-3 text-sm font-black text-zinc-950 transition-all hover:bg-white hover:shadow-[0_0_20px_rgba(255,255,255,0.15)] disabled:opacity-10 disabled:grayscale active:scale-95 disabled:cursor-not-allowed"
                      >
                        JOIN
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {!loadingRooms && filtered.length === 0 && (
                <div className="rounded-3xl border border-dashed border-zinc-800 bg-zinc-900/20 p-20 text-center">
                  <Swords size={48} className="mx-auto text-zinc-800 mb-4" />
                  <p className="text-zinc-500 text-sm">No battles match your search criteria.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}