import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { deleteRoom } from "@/lib/battle/room-cleanup";

export const runtime = "nodejs";

async function finishIfBattleEmpty(client: any, roomId: string): Promise<void> {
  const roomRes = await client.query(
    `SELECT current_match_id, status
     FROM battle_rooms
     WHERE id = $1
     FOR UPDATE`,
    [roomId]
  );

  if (roomRes.rows.length === 0) return;
  const room = roomRes.rows[0] as { current_match_id: string | null; status: string };
  if (room.status !== "in_game" || !room.current_match_id) return;

  const remainingRes = await client.query(
    `SELECT COUNT(*)::int AS cnt
     FROM battle_room_players
     WHERE room_id = $1`,
    [roomId]
  );

  if (Number(remainingRes.rows[0].cnt) > 0) return;

  await client.query(
    `UPDATE battle_matches
     SET status = 'finished',
         current_phase = 'finished',
         winner_user_id = NULL,
         loser_user_id = NULL,
         ended_at = now(),
         cooldown_starts_at = NULL,
         cooldown_ends_at = NULL
     WHERE id = $1 AND status = 'in_game'`,
    [room.current_match_id]
  );

  await client.query(
    `UPDATE battle_rooms
     SET status = 'finished'
     WHERE id = $1`,
    [roomId]
  );
}

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
      return NextResponse.json({ ok: true });
    }

    const room = roomRes.rows[0] as { host_user_id: number; status: string };

    if (room.host_user_id === userId) {
      await deleteRoom(client, roomId);
      await client.query("COMMIT");
      return NextResponse.json({ ok: true, closed: true });
    }

    await client.query(
      `DELETE FROM battle_room_players WHERE room_id=$1 AND user_id=$2`,
      [roomId, userId]
    );

    if (room.status === "in_game") {
      await finishIfBattleEmpty(client, roomId);
    }

    await client.query("COMMIT");
    return NextResponse.json({ ok: true, rejoinable: room.status === "in_game" });
  } catch (e: any) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: e?.message ?? "Failed to leave" }, { status: 500 });
  } finally {
    client.release();
  }
}
