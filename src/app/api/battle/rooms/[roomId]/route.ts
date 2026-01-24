import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { hashPassword } from "@/lib/battle/password";

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
      SELECT user_id, joined_at, is_ready
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
        isReady: p.is_ready,
      })),
    });
  } catch (e: any) {
    if (e?.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 });
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

  try {
    const body = await req.json();

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

      const room = roomRes.rows[0];

      if (room.host_user_id !== userId) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Only host can update settings" }, { status: 403 });
      }

      if (room.status !== "lobby") {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Cannot update settings after match starts" }, { status: 400 });
      }

      const updates: string[] = [];
      const values: any[] = [];
      let paramIdx = 1;

      if (body.name !== undefined) {
        updates.push(`name = $${paramIdx++}`);
        values.push(String(body.name).slice(0, 80));
      }

      if (body.difficulty !== undefined) {
        const diff = Number(body.difficulty);
        if (!Number.isFinite(diff) || diff < 1 || diff > 10) {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: "Invalid difficulty (1-10)" }, { status: 400 });
        }
        updates.push(`difficulty = $${paramIdx++}`);
        values.push(diff);
      }

      if (body.secondsPerProblem !== undefined) {
        const secs = Number(body.secondsPerProblem);
        if (!Number.isFinite(secs) || secs < 10 || secs > 600) {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: "Invalid secondsPerProblem (10-600)" }, { status: 400 });
        }
        updates.push(`seconds_per_problem = $${paramIdx++}`);
        values.push(secs);
      }

      if (body.maxPlayers !== undefined) {
        const max = Number(body.maxPlayers);
        if (!Number.isFinite(max) || max < 2 || max > 50) {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: "Invalid maxPlayers (2-50)" }, { status: 400 });
        }
        updates.push(`max_players = $${paramIdx++}`);
        values.push(max);
      }

      if (body.password !== undefined) {
        const pwd = body.password ? String(body.password) : null;
        const hash = pwd ? await hashPassword(pwd) : null;
        updates.push(`password_hash = $${paramIdx++}`);
        values.push(hash);
      }

      if (updates.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "No fields to update" }, { status: 400 });
      }

      values.push(roomId);
      const updateQuery = `
        UPDATE battle_rooms
        SET ${updates.join(", ")}
        WHERE id = $${paramIdx}
        RETURNING id, name, difficulty, seconds_per_problem, max_players, (password_hash IS NOT NULL) AS has_password, status, created_at, host_user_id
      `;

      const result = await client.query(updateQuery, values);
      await client.query("COMMIT");

      const updated = result.rows[0];
      return NextResponse.json({
        room: {
          id: updated.id,
          name: updated.name,
          difficulty: updated.difficulty,
          secondsPerProblem: updated.seconds_per_problem,
          maxPlayers: updated.max_players,
          hasPassword: updated.has_password,
          status: updated.status,
          createdAt: updated.created_at,
          hostUserId: updated.host_user_id,
        },
      });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (e: any) {
    console.error("Room update error:", e);
    return NextResponse.json({ error: e?.message ?? "Failed to update room" }, { status: 500 });
  }
}