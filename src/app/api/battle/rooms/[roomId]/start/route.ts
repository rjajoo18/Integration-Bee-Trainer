import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireUserId } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(_: Request, ctx: { params: Promise<{ roomId: string }> }) {
  let userId: number;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { roomId } = await ctx.params;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const roomRes = await client.query(
      `
      SELECT id, host_user_id, status
      FROM battle_rooms
      WHERE id = $1
      FOR UPDATE
      `,
      [roomId]
    );

    if (roomRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    const room = roomRes.rows[0] as { host_user_id: number; status: string };

    if (room.host_user_id !== userId) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Only host can start" }, { status: 403 });
    }
    if (room.status !== "lobby") {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Room already started" }, { status: 400 });
    }

    const playersRes = await client.query(
      `SELECT user_id FROM battle_room_players WHERE room_id=$1`,
      [roomId]
    );

    if (playersRes.rows.length < 2) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Need at least 2 players" }, { status: 400 });
    }

    const matchRes = await client.query(
      `INSERT INTO battle_matches (room_id, status) VALUES ($1,'in_game') RETURNING id`,
      [roomId]
    );
    const matchId = matchRes.rows[0].id as string;

    for (const p of playersRes.rows as Array<{ user_id: number }>) {
      await client.query(
        `INSERT INTO battle_match_players (match_id, user_id, score) VALUES ($1,$2,0) ON CONFLICT DO NOTHING`,
        [matchId, p.user_id]
      );
    }

    await client.query(`UPDATE battle_rooms SET status='in_game' WHERE id=$1`, [roomId]);

    await client.query("COMMIT");
    return NextResponse.json({ matchId });
  } catch (e: any) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: e?.message ?? "Failed to start" }, { status: 500 });
  } finally {
    client.release();
  }
}
