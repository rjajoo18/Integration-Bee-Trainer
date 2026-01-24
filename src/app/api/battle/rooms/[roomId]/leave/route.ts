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
      `SELECT host_user_id, status FROM battle_rooms WHERE id=$1 FOR UPDATE`,
      [roomId]
    );
    if (roomRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }
    const room = roomRes.rows[0] as { host_user_id: number; status: string };

    await client.query(`DELETE FROM battle_room_players WHERE room_id=$1 AND user_id=$2`, [
      roomId,
      userId,
    ]);

    // Prevent deleting the room if a match already exists (race with start)
    const matchExistsRes = await client.query(
      `SELECT 1 FROM battle_matches WHERE room_id = $1 LIMIT 1`,
      [roomId]
    );
    const matchExists = matchExistsRes.rows.length > 0;

    if (room.host_user_id === userId && room.status === "lobby" && !matchExists) {
      await client.query(`DELETE FROM battle_rooms WHERE id=$1`, [roomId]);
      await client.query("COMMIT");
      return NextResponse.json({ ok: true, closed: true });
    }

    await client.query("COMMIT");
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: e?.message ?? "Failed to leave" }, { status: 500 });
  } finally {
    client.release();
  }
}
