"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Lock, Search, RefreshCw,
  Plus, ChevronRight, X, Globe,
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
  hostElo: number | null;
  createdAt: string;
};

export default function BattleLobbyPage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth");
    }
  }, [status, router]);

  const [difficulty, setDifficulty] = useState<string | number>("all");
  const [secondsPerProblem, setSecondsPerProblem] = useState(60);
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [password, setPassword] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const [rooms, setRooms] = useState<Room[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [roomsError, setRoomsError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [showOpenOnly, setShowOpenOnly] = useState(true);

  const [actionErr, setActionErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [joinPasswordRoom, setJoinPasswordRoom] = useState<Room | null>(null);
  const [joinPassword, setJoinPassword] = useState("");
  const [joining, setJoining] = useState(false);

  async function fetchRooms() {
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
      .filter((room) =>
        !q ||
        room.id.toLowerCase().includes(q) ||
        room.hostName.toLowerCase().includes(q)
      )
      .filter((room) => !showOpenOnly || (room.status === "lobby" && room.playerCount < room.maxPlayers))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [rooms, search, showOpenOnly]);

  async function createRoom() {
    setActionErr(null);
    setCreating(true);
    try {
      const r = await fetch("/api/battle/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          difficulty,
          secondsPerProblem,
          maxPlayers,
          password: password.trim() || null,
        }),
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

  function openJoin(room: Room) {
    setActionErr(null);
    if (room.hasPassword) {
      setJoinPasswordRoom(room);
      setJoinPassword("");
      return;
    }
    doJoin(room.id, null);
  }

  async function doJoin(roomId: string, pwd: string | null) {
    setJoining(true);
    setActionErr(null);
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
    } finally {
      setJoining(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-[#080c14] flex items-center justify-center">
        <div className="h-7 w-7 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (status === "unauthenticated") return null;

  return (
    <div className="min-h-screen bg-[#080c14] text-white">

      {/* Password modal */}
      {joinPasswordRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm rounded-xl bg-[#0d1220] border border-white/[0.08] p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Lock size={14} className="text-zinc-500" />
                Password Required
              </div>
              <button
                onClick={() => { setJoinPasswordRoom(null); setActionErr(null); }}
                className="text-zinc-600 hover:text-zinc-300 transition-colors"
              >
                <X size={15} />
              </button>
            </div>
            <p className="text-sm text-zinc-500 mb-4">
              This is a private room. Enter the password to join.
            </p>
            <input
              type="password"
              value={joinPassword}
              onChange={(e) => setJoinPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doJoin(joinPasswordRoom.id, joinPassword)}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-indigo-500/50 mb-4 transition-colors"
              placeholder="Enter password..."
              autoFocus
            />
            {actionErr && <p className="text-xs text-red-400 mb-3">{actionErr}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => doJoin(joinPasswordRoom.id, joinPassword)}
                disabled={joining}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {joining ? "Joining..." : "Join Room"}
              </button>
              <button
                onClick={() => { setJoinPasswordRoom(null); setActionErr(null); }}
                className="px-4 py-2.5 rounded-lg text-sm text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Page header */}
      <div className="mx-auto max-w-6xl px-6 pt-10 pb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">Integral Battles</h1>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${
            showCreate
              ? "bg-white/[0.05] border border-white/[0.08] text-zinc-300 hover:bg-white/[0.08]"
              : "bg-indigo-600 hover:bg-indigo-500 text-white"
          }`}
        >
          {showCreate ? <X size={14} /> : <Plus size={14} />}
          {showCreate ? "Cancel" : "New Room"}
        </button>
      </div>

      {/* Create Room Panel */}
      <div className="mx-auto max-w-6xl px-6">
        {showCreate && (
          <div className="mb-6 rounded-xl border border-white/[0.07] bg-white/[0.02] p-6">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-5">
              Room Configuration
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1.5">
                  Difficulty
                </label>
                <select
                  className="w-full bg-[#0d1220] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-white outline-none focus:border-indigo-500/50 transition-colors cursor-pointer"
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value === "all" ? "all" : Number(e.target.value))}
                >
                  <option value="all">All Difficulties</option>
                  <option value="1">Level 1</option>
                  <option value="2">Level 2</option>
                  <option value="3">Level 3</option>
                  <option value="4">Level 4</option>
                  <option value="5">Level 5</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1.5">
                  Time per Problem — <span className="text-zinc-300">{secondsPerProblem}s</span>
                </label>
                <input
                  type="range" min="10" max="300" step="10"
                  value={secondsPerProblem}
                  onChange={(e) => setSecondsPerProblem(Number(e.target.value))}
                  className="w-full mt-2 accent-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1.5">
                  Max Players — <span className="text-zinc-300">{maxPlayers}</span>
                </label>
                <input
                  type="range" min="2" max="10"
                  value={maxPlayers}
                  onChange={(e) => setMaxPlayers(Number(e.target.value))}
                  className="w-full mt-2 accent-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1.5">
                  Password <span className="font-normal text-zinc-700">(optional)</span>
                </label>
                <input
                  type="password"
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-zinc-700 outline-none focus:border-indigo-500/50 transition-colors"
                  placeholder="Leave blank for public"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            {actionErr && (
              <div className="mt-4 rounded-lg border border-red-900/30 bg-red-950/20 px-4 py-3 text-xs text-red-300">
                {actionErr}
              </div>
            )}

            <div className="mt-5 flex justify-end">
              <button
                onClick={createRoom}
                disabled={creating}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-lg font-semibold text-sm transition-colors disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create & Enter"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Room List */}
      <div className="mx-auto max-w-6xl px-6 pb-12">
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-600" />
            <input
              className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-indigo-500/40 transition-colors"
              placeholder="Search by host or room ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <button
            onClick={() => setShowOpenOnly(!showOpenOnly)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-xs font-semibold transition-colors ${
              showOpenOnly
                ? "bg-indigo-600/15 border-indigo-500/30 text-indigo-400"
                : "bg-white/[0.03] border-white/[0.06] text-zinc-600 hover:text-zinc-300"
            }`}
          >
            <Globe size={13} />
            Open Only
          </button>

          <button
            onClick={fetchRooms}
            className="p-2.5 rounded-lg border border-white/[0.06] bg-white/[0.03] text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            <RefreshCw size={13} className={loadingRooms ? "animate-spin" : ""} />
          </button>
        </div>

        {roomsError && (
          <div className="mb-4 rounded-lg border border-red-900/30 bg-red-950/20 px-4 py-3 text-xs text-red-300">
            {roomsError}
          </div>
        )}

        {!joinPasswordRoom && actionErr && (
          <div className="mb-4 rounded-lg border border-red-900/30 bg-red-950/20 px-4 py-3 text-xs text-red-300">
            {actionErr}
          </div>
        )}

        <div className="mb-3">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-700">
            {filtered.length} {filtered.length === 1 ? "Room" : "Rooms"}
          </span>
        </div>

        <div className="space-y-2">
          {filtered.map((room) => {
            const isFull = room.playerCount >= room.maxPlayers;
            const isRunning = room.status !== "lobby";
            const disabled = isFull || isRunning;

            return (
              <div
                key={room.id}
                className={`rounded-xl border transition-colors ${
                  disabled
                    ? "border-white/[0.04] bg-white/[0.01] opacity-50"
                    : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.1] hover:bg-white/[0.035]"
                }`}
              >
                <div className="flex items-center justify-between px-5 py-4 gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-zinc-200 truncate">{room.hostName}</span>
                      {room.hostElo != null && (
                        <span className="shrink-0 font-mono text-[11px] text-indigo-400">{room.hostElo}</span>
                      )}
                      <span
                        className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide border ${
                          room.status === "lobby"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-white/[0.05] text-zinc-500 border-white/[0.08]"
                        }`}
                      >
                        {room.status === "lobby" ? "Open" : "In Game"}
                      </span>
                      {room.hasPassword && <Lock size={10} className="text-zinc-600 shrink-0" />}
                    </div>
                    <div className="text-[11px] text-zinc-600">
                      {room.difficulty === null ? "All levels" : `Level ${room.difficulty}`}
                      <span className="mx-1.5">·</span>
                      {room.secondsPerProblem}s
                      <span className="mx-1.5">·</span>
                      {room.playerCount}/{room.maxPlayers} players
                    </div>
                  </div>

                  <button
                    onClick={() => !disabled && openJoin(room)}
                    disabled={disabled}
                    className={`shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
                      disabled
                        ? "bg-white/[0.04] text-zinc-700 cursor-not-allowed"
                        : "bg-indigo-600 text-white hover:bg-indigo-500"
                    }`}
                  >
                    {disabled ? (isFull ? "Full" : "Running") : (<>Join <ChevronRight size={12} /></>)}
                  </button>
                </div>
              </div>
            );
          })}

          {!loadingRooms && filtered.length === 0 && (
            <div className="rounded-xl border border-dashed border-white/[0.05] p-16 text-center">
              <p className="text-sm text-zinc-700">No rooms found. Create one to get started.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
