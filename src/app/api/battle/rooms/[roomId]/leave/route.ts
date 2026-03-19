import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { deleteRoom } from "@/lib/battle/room-cleanup";

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
      // Room already gone — desired end state achieved, return success
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: true });
    }

    const room = roomRes.rows[0] as { host_user_id: number; status: string };

    if (room.host_user_id === userId) {
      // Host left — delete the entire room including all remaining players
      await deleteRoom(client, roomId);
      await client.query("COMMIT");
      return NextResponse.json({ ok: true, closed: true });
    }

    // Non-host player leaving — remove only them
    await client.query(
      `DELETE FROM battle_room_players WHERE room_id=$1 AND user_id=$2`,
      [roomId, userId]
    );
    await client.query("COMMIT");
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: e?.message ?? "Failed to leave" }, { status: 500 });
  } finally {
    client.release();
  }
}
