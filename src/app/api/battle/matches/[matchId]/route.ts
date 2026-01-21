import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireUserId } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(_: Request, ctx: { params: Promise<{ matchId: string }> }) {
  try {
    const userId = await requireUserId();
    const { matchId } = await ctx.params;

    const matchRes = await pool.query(
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
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    const playersRes = await pool.query(
      `
      SELECT user_id, score, last_submit_at
      FROM battle_match_players
      WHERE match_id = $1
      ORDER BY score DESC, user_id ASC
      `,
      [matchId]
    );

    const isPlayer = playersRes.rows.some((p) => p.user_id === userId);
    if (!isPlayer) {
      return NextResponse.json({ error: "Not a match participant" }, { status: 403 });
    }

    const lastRoundRes = await pool.query(
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

    if (lastRoundRes.rows.length > 0) {
      const lastRound = lastRoundRes.rows[0];
      problemEndsAt = lastRound.ends_at;

      const probRes = await pool.query(
        `SELECT id, latex_question, rating FROM problems WHERE id=$1`,
        [lastRound.problem_id]
      );

      if (probRes.rows.length > 0) {
        currentProblem = {
          id: probRes.rows[0].id,
          latex: probRes.rows[0].latex_question,
          difficulty: probRes.rows[0].rating,
          roundIndex: lastRound.round_index,
          startsAt: lastRound.starts_at,
          endsAt: lastRound.ends_at,
        };
      }
    }

    const m = matchRes.rows[0];
    return NextResponse.json({
      match: {
        id: m.id,
        roomId: m.room_id,
        status: m.status,
        winnerUserId: m.winner_user_id,
        createdAt: m.created_at,
        endedAt: m.ended_at,
        difficulty: m.difficulty,
        secondsPerProblem: m.seconds_per_problem,
      },
      players: playersRes.rows.map((p) => ({
        userId: p.user_id,
        score: p.score,
        lastSubmitAt: p.last_submit_at,
      })),
      currentProblem,
      problemEndsAt,
    });
  } catch (e: any) {
    if (e?.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 });
  }
}
