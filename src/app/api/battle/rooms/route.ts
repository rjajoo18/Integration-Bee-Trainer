import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { hashPassword } from "@/lib/battle/password";
import { cleanupStaleRooms } from "@/lib/battle/room-cleanup";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireUserId();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = await pool.connect();
  try {
    // Opportunistic cleanup of idle/orphaned lobby rooms — non-fatal if it errors
    try {
      await client.query("BEGIN");
      await cleanupStaleRooms(client);
      await client.query("COMMIT");
    } catch (cleanupErr) {
      await client.query("ROLLBACK");
      console.error("[ROOMS_LIST] Stale room cleanup error (non-fatal):", cleanupErr);
    }

    // Only return rooms where the host is still an active member (INNER JOIN)
    const result = await client.query(`
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
        COALESCE(u.username, split_part(u.email, '@', 1), 'Unknown') AS host_name,
        u.elo_rating AS host_elo,
        COALESCE(p.cnt, 0) AS player_count
      FROM battle_rooms r
      LEFT JOIN users u ON u.id = r.host_user_id
      LEFT JOIN (
        SELECT room_id, COUNT(*)::int AS cnt
        FROM battle_room_players
        GROUP BY room_id
      ) p ON p.room_id = r.id
      INNER JOIN battle_room_players host_check
        ON host_check.room_id = r.id AND host_check.user_id = r.host_user_id
      WHERE r.status = 'lobby'
      ORDER BY r.created_at DESC
      LIMIT 200
    `);

    const rooms = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      difficulty: row.difficulty,
      secondsPerProblem: row.seconds_per_problem,
      maxPlayers: row.max_players,
      playerCount: row.player_count,
      hasPassword: row.has_password,
      status: row.status,
      hostUserId: row.host_user_id,
      hostName: row.host_name,
      hostElo: row.host_elo != null ? Number(row.host_elo) : null,
      createdAt: row.created_at,
    }));

    return NextResponse.json({ rooms });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function POST(req: Request) {
  let userId: number;
  try {
    userId = await requireUserId();
  } catch (error) {
    console.error('[CREATE_ROOM] Auth failed:', error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));

    const name = String(body.name ?? "Integral Duel").slice(0, 80);

    // difficulty: 1-5 or "all"/"All"/null
    let difficultyRaw = body.difficulty;
    let difficulty: number | null = null;

    if (
      difficultyRaw === null ||
      difficultyRaw === undefined ||
      difficultyRaw === "all" ||
      difficultyRaw === "All"
    ) {
      difficulty = null;
    } else {
      const d = Number(difficultyRaw);
      if (!Number.isFinite(d) || d < 1 || d > 5) {
        return NextResponse.json(
          { error: "Invalid difficulty (1-5 or 'All')" },
          { status: 400 }
        );
      }
      difficulty = d;
    }

    const secondsPerProblem = Number(body.secondsPerProblem);
    const maxPlayers = Number(body.maxPlayers);
    const password = body.password ? String(body.password) : null;

    if (!Number.isFinite(secondsPerProblem) || secondsPerProblem < 10 || secondsPerProblem > 600) {
      return NextResponse.json(
        { error: "Invalid secondsPerProblem (10-600)" },
        { status: 400 }
      );
    }

    if (!Number.isFinite(maxPlayers) || maxPlayers < 2 || maxPlayers > 20) {
      return NextResponse.json({ error: "Invalid maxPlayers (2-20)" }, { status: 400 });
    }

    const passwordHash = password ? await hashPassword(password) : null;

    console.log('[CREATE_ROOM] Creating room:', {
      userId,
      name,
      difficulty,
      hasPassword: !!passwordHash
    });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const ins = await client.query(
        `
        INSERT INTO battle_rooms (
          host_user_id,
          name,
          difficulty,
          seconds_per_problem,
          max_players,
          password_hash,
          status
        )
        VALUES ($1,$2,$3,$4,$5,$6,'lobby')
        RETURNING
          id,
          name,
          difficulty,
          seconds_per_problem,
          max_players,
          (password_hash IS NOT NULL) AS has_password,
          status,
          created_at,
          host_user_id
        `,
        [userId, name, difficulty, secondsPerProblem, maxPlayers, passwordHash]
      );

      const room = ins.rows[0];

      // CRITICAL FIX: Host is auto-added as ready, but this is OK because:
      // 1. Host created the room, so they "know" the password
      // 2. Host can't join their own room via /join (they're already in it)
      // 3. This doesn't bypass password for OTHER users
      await client.query(
        `
        INSERT INTO battle_room_players (room_id, user_id, is_ready)
        VALUES ($1,$2,true)
        ON CONFLICT DO NOTHING
        `,
        [room.id, userId]
      );

      await client.query("COMMIT");

      console.log('[CREATE_ROOM] Room created successfully:', room.id);

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
          hostUserId: room.host_user_id,
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
    console.error('[CREATE_ROOM] Error:', e);
    return NextResponse.json({ error: e?.message ?? "Failed to create room" }, { status: 500 });
  }
}