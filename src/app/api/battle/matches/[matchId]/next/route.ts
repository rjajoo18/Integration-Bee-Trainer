import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireUserId } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(_: Request, ctx: { params: Promise<{ matchId: string }> }) {
  let userId: number;
  try {
    userId = await requireUserId();
  } catch (error) {
    console.error('[NEXT] Auth failed:', error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { matchId } = await ctx.params;
  console.log('[NEXT] Request to serve next problem:', { matchId, userId });
  
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const matchRes = await client.query(
      `
      SELECT m.id, m.room_id, m.status,
             r.host_user_id, r.difficulty, r.seconds_per_problem
      FROM battle_matches m
      JOIN battle_rooms r ON r.id = m.room_id
      WHERE m.id = $1
      FOR UPDATE
      `,
      [matchId]
    );

    if (matchRes.rows.length === 0) {
      await client.query("ROLLBACK");
      console.error('[NEXT] Match not found:', matchId);
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    const m = matchRes.rows[0] as {
      status: string;
      host_user_id: number;
      difficulty: number | null;
      seconds_per_problem: number;
    };

    if (m.status !== "in_game") {
      await client.query("ROLLBACK");
      console.error('[NEXT] Match not active:', m.status);
      return NextResponse.json({ error: "Match is not active" }, { status: 400 });
    }
    
    if (m.host_user_id !== userId) {
      await client.query("ROLLBACK");
      console.error('[NEXT] User not host:', { userId, hostUserId: m.host_user_id });
      return NextResponse.json({ error: "Only host can advance problems" }, { status: 403 });
    }

    const lastRound = await client.query(
      `SELECT COALESCE(MAX(round_index), -1) AS mx FROM battle_match_rounds WHERE match_id=$1`,
      [matchId]
    );
    const nextRoundIdx = Number(lastRound.rows[0].mx) + 1;

    // 10-problem cap
    if (nextRoundIdx >= 10) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Match has reached the maximum of 10 problems" }, { status: 400 });
    }

    // CRITICAL: Select problem where id is TEXT (like "MIT-2010-Q22"), not UUID
    const problemRes = await client.query(
      `
      SELECT
        p.id,
        p.problem_text,
        p.problem_answer_latex,
        p.problem_answer_computed,
        p.difficulty
      FROM integration_problems p
      WHERE p.difficulty BETWEEN 1 AND 5
        AND ($1::int IS NULL OR p.difficulty = $1)
        AND NOT EXISTS (
          SELECT 1
          FROM battle_match_rounds r
          WHERE r.match_id = $2
            AND r.problem_id = p.id
        )
      ORDER BY random()
      LIMIT 1
      `,
      [m.difficulty, matchId]
    );

    if (problemRes.rows.length === 0) {
      await client.query("ROLLBACK");
      console.error('[NEXT] No unused problems available');
      return NextResponse.json(
        { error: "No unused problems available at this difficulty" },
        { status: 400 }
      );
    }

    const prob = problemRes.rows[0] as {
      id: string;
      problem_text: string;
      problem_answer_latex: string | null;
      problem_answer_computed: string | null;
      difficulty: number;
    };

    const startsAt = new Date();
    const endsAt = new Date(startsAt.getTime() + Number(m.seconds_per_problem) * 1000);

    // Insert round - problem_id is TEXT
    await client.query(
      `
      INSERT INTO battle_match_rounds (match_id, round_index, problem_id, starts_at, ends_at)
      VALUES ($1,$2,$3,$4,$5)
      `,
      [matchId, nextRoundIdx, prob.id, startsAt.toISOString(), endsAt.toISOString()]
    );

    // CRITICAL: Commit BEFORE releasing client
    await client.query("COMMIT");
    
    console.log('[NEXT] Round created:', {
      matchId,
      roundIndex: nextRoundIdx,
      problemId: prob.id,
      timestamp: new Date().toISOString()
    });

    // Post-commit verification
    if (process.env.NODE_ENV === 'development') {
      const verifyRound = await client.query(
        `SELECT round_index, problem_id FROM battle_match_rounds 
         WHERE match_id = $1 AND round_index = $2`,
        [matchId, nextRoundIdx]
      );
      
      console.log('[NEXT] Verification:', {
        rowCount: verifyRound.rows.length,
        verifiedProblemId: verifyRound.rows[0]?.problem_id,
      });
    }

    return NextResponse.json({
      problem: {
        id: prob.id,
        latex: prob.problem_text,
        difficulty: prob.difficulty,
        roundIndex: nextRoundIdx,
      },
      problemEndsAt: endsAt.toISOString(),
      ...(process.env.NODE_ENV === 'development' && {
        debug: {
          roundCreated: true,
          commitComplete: true
        }
      })
    });
  } catch (e: any) {
    await client.query("ROLLBACK");
    console.error('[NEXT] Error:', e);
    return NextResponse.json(
      { error: e?.message ?? "Failed to serve next problem" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}