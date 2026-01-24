import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireUserId } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ roomId: string }> }) {
  let userId: number;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { roomId } = await ctx.params;

  try {
    const body = await req.json();
    const isReady = body.isReady === true;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const roomRes = await client.query(
        `SELECT status FROM battle_rooms WHERE id = $1 FOR UPDATE`,
        [roomId]
      );

      if (roomRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Room not found" }, { status: 404 });
      }

      if (roomRes.rows[0].status !== "lobby") {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Room already started" }, { status: 400 });
      }

      const playerRes = await client.query(
        `SELECT user_id FROM battle_room_players WHERE room_id = $1 AND user_id = $2`,
        [roomId, userId]
      );

      if (playerRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Not in this room" }, { status: 403 });
      }

      await client.query(
        `UPDATE battle_room_players SET is_ready = $1 WHERE room_id = $2 AND user_id = $3`,
        [isReady, roomId, userId]
      );

      await client.query("COMMIT");

      return NextResponse.json({ success: true, isReady });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (e: any) {
    console.error("Ready toggle error:", e);
    return NextResponse.json({ error: e?.message ?? "Failed to toggle ready" }, { status: 500 });
  }
}