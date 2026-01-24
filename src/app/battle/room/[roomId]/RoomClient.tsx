// src/app/battle/room/[roomId]/RoomClient.tsx
"use client";

import React, { useEffect, useState } from "react";
import { ArrowLeft, Lock, RefreshCw, Users } from "lucide-react";

type Room = {
  id: string;
  name: string;
  difficulty: number;
  secondsPerProblem: number;
  maxPlayers: number;
  playerCount: number;
  hasPassword: boolean;
  status: "lobby" | "in_game" | "finished";
  hostName: string;
  createdAt: string;
};

type Props = {
  roomId: string;
};

export default function RoomClient({ roomId }: Props) {
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function fetchRoom() {
    setErr(null);
    setLoading(true);
    try {
      // IMPORTANT: this endpoint must exist. If yours is different, update it here.
      const r = await fetch(`/api/battle/rooms/${roomId}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Failed to load room");
      setRoom(j.room ?? j); // supports either {room: {...}} or direct room object
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load room");
      setRoom(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRoom();
    const t = setInterval(fetchRoom, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="border-b border-zinc-800 bg-zinc-900/30">
        <div className="mx-auto max-w-4xl px-4 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => (window.location.href = "/battle")}
              className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-zinc-900 transition"
            >
              <span className="flex items-center gap-2">
                <ArrowLeft size={16} />
                Back
              </span>
            </button>

            <div>
              <div className="text-xs uppercase tracking-widest text-zinc-500 font-black">
                Room
              </div>
              <div className="text-lg font-bold text-white font-mono">
                {roomId.slice(0, 8)}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={fetchRoom}
            className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-zinc-900 transition"
          >
            <span className="flex items-center gap-2">
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              Refresh
            </span>
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-8">
        {err && (
          <div className="mb-6 rounded-2xl border border-red-900/50 bg-red-950/20 px-4 py-3 text-sm text-red-300 flex items-center gap-3">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            {err}
          </div>
        )}

        {loading && !room && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 text-zinc-400">
            Loading room…
          </div>
        )}

        {!loading && room && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
            <div className="flex items-start justify-between gap-6">
              <div>
                <div className="text-2xl font-extrabold text-white">
                  {room.name}
                </div>
                <div className="mt-2 text-sm text-zinc-400">
                  Host: <span className="text-zinc-200">{room.hostName}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {room.hasPassword && (
                  <span className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-xs text-zinc-300">
                    <Lock size={14} />
                    Protected
                  </span>
                )}
                <span className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-xs text-zinc-300">
                  <Users size={14} />
                  {room.playerCount}/{room.maxPlayers}
                </span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-4">
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/30 p-4">
                <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-black">
                  Difficulty
                </div>
                <div className="mt-1 font-mono text-lg text-indigo-300">
                  {room.difficulty}
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-950/30 p-4">
                <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-black">
                  Time Limit
                </div>
                <div className="mt-1 font-mono text-lg text-amber-300">
                  {room.secondsPerProblem}s
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-950/30 p-4">
                <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-black">
                  Status
                </div>
                <div className="mt-1 font-mono text-lg text-zinc-200">
                  {room.status}
                </div>
              </div>
            </div>

            {/* TODO: put your actual in-room lobby/game UI here */}
            <div className="mt-6 rounded-xl border border-dashed border-zinc-800 bg-zinc-950/20 p-6 text-sm text-zinc-500">
              This is the room page. Add “ready up”, player list, start match, etc.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
