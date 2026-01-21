import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireUserId } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(_: Request, ctx: { params: Promise<{ roomId: string }> }) {
  try {
    await requireUserId();
    const { roomId } = await ctx.params;

    const roomRes = await pool.query(
      `
      SELECT id, name, difficulty, seconds_per_problem, max_players,
             (password_hash IS NOT NULL) AS has_password, status, created_at, host_user_id
      FROM battle_rooms
      WHERE id = $1
      `,
      [roomId]
    );

    if (roomRes.rows.length === 0) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    const playersRes = await pool.query(
      `
      SELECT user_id, joined_at
      FROM battle_room_players
      WHERE room_id = $1
      ORDER BY joined_at ASC
      `,
      [roomId]
    );

    return NextResponse.json({
      room: {
        id: roomRes.rows[0].id,
        name: roomRes.rows[0].name,
        difficulty: roomRes.rows[0].difficulty,
        secondsPerProblem: roomRes.rows[0].seconds_per_problem,
        maxPlayers: roomRes.rows[0].max_players,
        hasPassword: roomRes.rows[0].has_password,
        status: roomRes.rows[0].status,
        createdAt: roomRes.rows[0].created_at,
        hostUserId: roomRes.rows[0].host_user_id,
      },
      players: playersRes.rows.map((p) => ({
        userId: p.user_id,
        joinedAt: p.joined_at,
      })),
    });
  } catch (e: any) {
    if (e?.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 });
  }
}
