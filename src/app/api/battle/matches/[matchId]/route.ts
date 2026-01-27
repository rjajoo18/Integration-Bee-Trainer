import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireUserId } from "@/lib/auth";

export const runtime = "nodejs";

function toIsoString(v: any): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  const s = String(v);
  return s.length ? s : null;
}

function toLatexString(v: any): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v;
  return null;
}

export async function GET(_: Request, ctx: { params: Promise<{ matchId: string }> }) {
  let client;
  try {
    const userId = await requireUserId();
    const { matchId } = await ctx.params;

    client = await pool.connect();
    
    // CRITICAL FIX: Use a fresh connection with READ COMMITTED isolation
    // This ensures we see ALL committed transactions from other connections
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED");

    const matchRes = await client.query(
      `
      SELECT m.id, m.room_id, m.status, m.winner_user_id, m.created_at, m.ended_at,
             r.difficulty, r.seconds_per_problem
      FROM battle_matches m
      JOIN battle_rooms r ON r.id = m.room_id
      WHERE m.id = $1
      `,
      [matchId]
    );

    if (matchRes.rows.length === 0) {
      await client.query("COMMIT");
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    const playersRes = await client.query(
      `
      SELECT 
        bmp.user_id, 
        bmp.score, 
        bmp.last_submit_at,
        u.email
      FROM battle_match_players bmp
      LEFT JOIN users u ON u.id = bmp.user_id
      WHERE bmp.match_id = $1
      ORDER BY bmp.score DESC, bmp.user_id ASC
      `,
      [matchId]
    );

    const isPlayer = playersRes.rows.some((p) => Number(p.user_id) === Number(userId));
    if (!isPlayer) {
      await client.query("COMMIT");
      return NextResponse.json({ error: "Not a match participant" }, { status: 403 });
    }

    // CRITICAL FIX: Fetch the latest round within the same READ COMMITTED transaction
    // This guarantees we see rounds committed by the /next endpoint
    const lastRoundRes = await client.query(
      `
      SELECT round_index, problem_id, starts_at, ends_at
      FROM battle_match_rounds
      WHERE match_id = $1
      ORDER BY round_index DESC
      LIMIT 1
      `,
      [matchId]
    );

    let currentProblem: any = null;
    let problemEndsAt: string | null = null;
    
    const debugInfo: any = {};

    if (lastRoundRes.rows.length > 0) {
      const lastRound = lastRoundRes.rows[0];
      problemEndsAt = toIsoString(lastRound.ends_at);
      
      if (process.env.NODE_ENV === 'development') {
        debugInfo.roundFound = true;
        debugInfo.roundIndex = lastRound.round_index;
        debugInfo.problemId = lastRound.problem_id;
      }

      const probRes = await client.query(
        `
        SELECT id, problem_text, difficulty
        FROM integration_problems
        WHERE id = $1
        `,
        [lastRound.problem_id]
      );

      if (probRes.rows.length > 0) {
        const row = probRes.rows[0];
        const latex = toLatexString(row.problem_text);

        currentProblem = {
          id: String(row.id),
          latex,
          difficulty: row.difficulty,
          roundIndex: lastRound.round_index,
          startsAt: toIsoString(lastRound.starts_at),
          endsAt: toIsoString(lastRound.ends_at),
        };
        
        if (process.env.NODE_ENV === 'development') {
          debugInfo.problemFound = true;
          debugInfo.problemHasLatex = latex !== null;
          debugInfo.latexLength = latex?.length ?? 0;
        }
      } else {
        if (process.env.NODE_ENV === 'development') {
          debugInfo.problemFound = false;
          debugInfo.error = 'Problem not found in integration_problems';
        }
      }
    } else {
      if (process.env.NODE_ENV === 'development') {
        debugInfo.roundFound = false;
        debugInfo.message = 'No rounds exist for this match yet';
      }
    }

    // Commit the read transaction
    await client.query("COMMIT");

    const m = matchRes.rows[0];

    const response: any = {
      match: {
        id: String(m.id),
        roomId: String(m.room_id),
        status: m.status,
        winnerUserId: m.winner_user_id,
        createdAt: toIsoString(m.created_at),
        endedAt: toIsoString(m.ended_at),
        difficulty: m.difficulty,
        secondsPerProblem: m.seconds_per_problem,
      },
      players: playersRes.rows.map((p) => ({
        userId: p.user_id,
        score: p.score,
        lastSubmitAt: toIsoString(p.last_submit_at),
        email: p.email || null,
      })),
      currentProblem,
      problemEndsAt,
    };

    if (process.env.NODE_ENV === 'development' && Object.keys(debugInfo).length > 0) {
      response.debug = {
        ...debugInfo,
        userId,
        isPlayer,
        timestamp: new Date().toISOString()
      };
    }

    return NextResponse.json(response);
  } catch (e: any) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch {}
    }
    console.error('[ERROR GET /matches/[matchId]]', e);
    if (e?.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ 
      error: e?.message ?? "Failed",
      ...(process.env.NODE_ENV === 'development' && { stack: e?.stack })
    }, { status: 500 });
  } finally {
    if (client) {
      client.release();
    }
  }
}