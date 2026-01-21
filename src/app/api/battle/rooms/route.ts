import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { hashPassword } from "@/lib/battle/password";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireUserId();

    const q = `
      SELECT
        r.id,
        r.name,
        r.difficulty,
        r.seconds_per_problem,
        r.max_players,
        (r.password_hash IS NOT NULL) AS has_password,
        r.status,
        r.created_at,
        r.host_user_id,
        COALESCE(p.cnt, 0) AS player_count
      FROM battle_rooms r
      LEFT JOIN (
        SELECT room_id, COUNT(*)::int AS cnt
        FROM battle_room_players
        GROUP BY room_id
      ) p ON p.room_id = r.id
      ORDER BY r.created_at DESC
      LIMIT 200
    `;
    const result = await pool.query(q);

    const rooms = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      difficulty: row.difficulty,
      secondsPerProblem: row.seconds_per_problem,
      maxPlayers: row.max_players,
      playerCount: row.player_count,
      hasPassword: row.has_password,
      status: row.status,
      hostName: row.host_user_id, // replace with username lookup if you have it
      createdAt: row.created_at,
    }));

    return NextResponse.json({ rooms });
  } catch (e: any) {
    if (e?.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let userId: number;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();

    const name = String(body.name ?? "Integral Duel").slice(0, 80);
    const difficulty = Number(body.difficulty);
    const secondsPerProblem = Number(body.secondsPerProblem);
    const maxPlayers = Number(body.maxPlayers);
    const password = body.password ? String(body.password) : null;

    if (!Number.isFinite(difficulty) || difficulty < 1 || difficulty > 10) {
      return NextResponse.json({ error: "Invalid difficulty" }, { status: 400 });
    }
    if (!Number.isFinite(secondsPerProblem) || secondsPerProblem < 10 || secondsPerProblem > 600) {
      return NextResponse.json({ error: "Invalid secondsPerProblem" }, { status: 400 });
    }
    if (!Number.isFinite(maxPlayers) || maxPlayers < 2 || maxPlayers > 50) {
      return NextResponse.json({ error: "Invalid maxPlayers" }, { status: 400 });
    }

    const passwordHash = password ? await hashPassword(password) : null;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const ins = await client.query(
        `
        INSERT INTO battle_rooms (host_user_id, name, difficulty, seconds_per_problem, max_players, password_hash, status)
        VALUES ($1,$2,$3,$4,$5,$6,'lobby')
        RETURNING id, name, difficulty, seconds_per_problem, max_players, (password_hash IS NOT NULL) AS has_password, status, created_at, host_user_id
        `,
        [userId, name, difficulty, secondsPerProblem, maxPlayers, passwordHash]
      );

      const room = ins.rows[0];

      // Host auto-joins room
      await client.query(
        `INSERT INTO battle_room_players (room_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [room.id, userId]
      );

      await client.query("COMMIT");

      return NextResponse.json({
        room: {
          id: room.id,
          name: room.name,
          difficulty: room.difficulty,
          secondsPerProblem: room.seconds_per_problem,
          maxPlayers: room.max_players,
          playerCount: 1,
          hasPassword: room.has_password,
          status: room.status,
          hostName: room.host_user_id,
          createdAt: room.created_at,
        },
      });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed to create room" }, { status: 500 });
  }
}
