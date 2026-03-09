import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { verifyPassword } from "@/lib/battle/password";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ roomId: string }> }) {
  let userId: number;
  try {
    userId = await requireUserId();
  } catch (error) {
    console.error("[JOIN] Auth failed:", error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { roomId } = await ctx.params;

  const body = await req.json().catch(() => ({}));
  const providedPwRaw = body?.password != null ? String(body.password) : null;
  const providedPw = providedPwRaw && providedPwRaw.trim() !== "" ? providedPwRaw : null;

  console.log("[JOIN] Request:", { roomId, userId, hasPassword: !!providedPw });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `SELECT pg_advisory_xact_lock(
        ('x' || substr(md5($1::text), 1, 16))::bit(64)::bigint
      )`,
      [roomId]
    );

    const roomRes = await client.query(
      `SELECT id, status, max_players, password_hash
       FROM battle_rooms
       WHERE id = $1
       FOR UPDATE`,
      [roomId]
    );

    if (roomRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    const room = roomRes.rows[0] as {
      status: string;
      max_players: number;
      password_hash: string | null;
    };

    if (room.status !== "lobby") {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Room already started" }, { status: 400 });
    }

    // Check if already in room BEFORE password check.
    // Players already in the room (e.g. the host) skip password + capacity checks.
    const alreadyInRes = await client.query(
      `SELECT 1 FROM battle_room_players WHERE room_id = $1 AND user_id = $2`,
      [roomId, userId]
    );
    const alreadyIn = alreadyInRes.rows.length > 0;

    if (alreadyIn) {
      await client.query("COMMIT");
      return NextResponse.json({ roomId, player: { id: userId } });
    }

    // Password check only for new players
    if (room.password_hash) {
      if (!providedPw) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Password required" }, { status: 401 });
      }

      const ok = await verifyPassword(providedPw, room.password_hash);
      if (!ok) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Wrong password" }, { status: 401 });
      }
    }

    // Capacity check for new players
    const cntRes = await client.query(
      `SELECT COUNT(*)::int AS cnt FROM battle_room_players WHERE room_id = $1`,
      [roomId]
    );
    const count = cntRes.rows[0].cnt as number;

    if (count >= room.max_players) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Room is full" }, { status: 400 });
    }

    await client.query(
      `INSERT INTO battle_room_players (room_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [roomId, userId]
    );

    await client.query("COMMIT");
    return NextResponse.json({ roomId, player: { id: userId } });
  } catch (e: any) {
    await client.query("ROLLBACK");
    console.error("[JOIN] Error:", e);
    return NextResponse.json({ error: e?.message ?? "Failed to join" }, { status: 500 });
  } finally {
    client.release();
  }
}
