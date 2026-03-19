import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { hashPassword } from "@/lib/battle/password";
import { deleteRoom, isRoomExpired } from "@/lib/battle/room-cleanup";

export const runtime = "nodejs";

export async function GET(_: Request, ctx: { params: Promise<{ roomId: string }> }) {
  let userId: number;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { roomId } = await ctx.params;

  try {
    const roomRes = await pool.query(
      `
      SELECT
        id,
        host_user_id,
        name,
        difficulty,
        seconds_per_problem,
        max_players,
        (password_hash IS NOT NULL) AS has_password,
        status,
        current_match_id,
        created_at
      FROM battle_rooms
      WHERE id = $1
      `,
      [roomId]
    );

    if (roomRes.rows.length === 0) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    const room = roomRes.rows[0];

    const playersRes = await pool.query(
      `
      SELECT
        brp.user_id,
        brp.is_ready,
        brp.joined_at,
        COALESCE(u.username, split_part(u.email, '@', 1)) AS username,
        u.elo_rating
      FROM battle_room_players brp
      LEFT JOIN users u ON u.id = brp.user_id
      WHERE brp.room_id = $1
      ORDER BY brp.joined_at ASC
      `,
      [roomId]
    );

    // Lifecycle checks — only apply to pre-game lobby rooms, never interrupt active matches
    if (room.status === 'lobby') {
      const hostInRoom = playersRes.rows.some(
        (p: any) => Number(p.user_id) === Number(room.host_user_id)
      );
      const expired = isRoomExpired(room.created_at);

      if (!hostInRoom || expired) {
        const reason = !hostInRoom ? 'host_left' : 'timeout';
        // Delete the orphaned/expired room in its own transaction
        const deleteClient = await pool.connect();
        try {
          await deleteClient.query("BEGIN");
          await deleteRoom(deleteClient, roomId);
          await deleteClient.query("COMMIT");
        } catch (e) {
          await deleteClient.query("ROLLBACK");
          console.error(`[ROOM_GET] Auto-delete failed for ${roomId}:`, e);
        } finally {
          deleteClient.release();
        }
        return NextResponse.json({ error: "Room not found", reason }, { status: 404 });
      }
    }

    const isPlayer = playersRes.rows.some((p: any) => Number(p.user_id) === Number(userId));

    return NextResponse.json({
      room: {
        id: room.id,
        hostUserId: room.host_user_id,
        name: room.name,
        difficulty: room.difficulty,
        secondsPerProblem: room.seconds_per_problem,
        maxPlayers: room.max_players,
        hasPassword: room.has_password,
        status: room.status,
        currentMatchId: room.current_match_id,
        createdAt: room.created_at?.toISOString() || null,
      },
      players: playersRes.rows.map((p: any) => ({
        userId: p.user_id,
        username: p.username || null,
        isReady: p.is_ready,
        joinedAt: p.joined_at?.toISOString() || null,
        eloRating: p.elo_rating != null ? Number(p.elo_rating) : null,
      })),
      isPlayer,
      isHost: room.host_user_id === userId,
    });
  } catch (e: any) {
    console.error("Get room error:", e);
    return NextResponse.json({ error: e?.message ?? "Failed to load room" }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ roomId: string }> }) {
  let userId: number;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { roomId } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const roomRes = await client.query(
      `SELECT host_user_id, status FROM battle_rooms WHERE id = $1 FOR UPDATE`,
      [roomId]
    );

    if (roomRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    const room = roomRes.rows[0] as { host_user_id: number; status: string };

    if (room.host_user_id !== userId) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Only host can update settings" }, { status: 403 });
    }

    if (room.status !== "lobby") {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Cannot update settings after game starts" }, { status: 400 });
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (body.name !== undefined) {
      const name = String(body.name ?? "").slice(0, 80).trim();
      if (!name) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Room name cannot be empty" }, { status: 400 });
      }
      updates.push(`name = $${paramCount}`);
      values.push(name);
      paramCount++;
    }

    if (body.difficulty !== undefined) {
      // Allow null or "all" for "All difficulties"
      if (body.difficulty === null || body.difficulty === "all" || body.difficulty === "All") {
        updates.push(`difficulty = NULL`);
      } else {
        const diff = Number(body.difficulty);
        if (!Number.isInteger(diff) || diff < 1 || diff > 5) {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: "Difficulty must be 1-5 or null" }, { status: 400 });
        }
        updates.push(`difficulty = $${paramCount}`);
        values.push(diff);
        paramCount++;
      }
    }

    if (body.secondsPerProblem !== undefined) {
      const spp = Number(body.secondsPerProblem);
      if (!Number.isInteger(spp) || spp < 10 || spp > 600) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Seconds per problem must be 10-600" }, { status: 400 });
      }
      updates.push(`seconds_per_problem = $${paramCount}`);
      values.push(spp);
      paramCount++;
    }

    if (body.maxPlayers !== undefined) {
      const mp = Number(body.maxPlayers);
      if (!Number.isInteger(mp) || mp < 2 || mp > 20) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Max players must be 2-20" }, { status: 400 });
      }
      updates.push(`max_players = $${paramCount}`);
      values.push(mp);
      paramCount++;
    }

    // Handle password update (needs hashing)
    if ("password" in body) {
      if (body.password === null || body.password === "") {
        // Clear password
        updates.push(`password_hash = NULL`);
      } else {
        const newHash = await hashPassword(String(body.password));
        updates.push(`password_hash = $${paramCount}`);
        values.push(newHash);
        paramCount++;
      }
    }

    if (updates.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "No valid updates provided" }, { status: 400 });
    }

    values.push(roomId);
    await client.query(
      `UPDATE battle_rooms SET ${updates.join(", ")} WHERE id = $${paramCount}`,
      values
    );

    await client.query("COMMIT");
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    await client.query("ROLLBACK");
    console.error("Update room settings error:", e);
    return NextResponse.json({ error: e?.message ?? "Failed to update" }, { status: 500 });
  } finally {
    client.release();
  }
}