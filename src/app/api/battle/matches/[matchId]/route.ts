import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireUserId } from "@/lib/auth";

export const runtime = "nodejs";

function toIsoString(v: any): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  // pg sometimes returns timestamps as strings already
  const s = String(v);
  return s.length ? s : null;
}

function toLatexString(v: any): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v;
  // If the column is JSON/JSONB or some other type, don't crash KaTeX.
  // You can choose to JSON.stringify here, but that usually isn't valid LaTeX.
  // Returning null forces the client to show the "invalid/missing" message.
  return null;
}

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

    const isPlayer = playersRes.rows.some((p) => Number(p.user_id) === Number(userId));
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
      problemEndsAt = toIsoString(lastRound.ends_at);

      const probRes = await pool.query(
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
          latex, // string | null (client will guard)
          difficulty: row.difficulty,
          roundIndex: lastRound.round_index,
          startsAt: toIsoString(lastRound.starts_at),
          endsAt: toIsoString(lastRound.ends_at),
        };
      }
    }

    const m = matchRes.rows[0];

    return NextResponse.json({
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
