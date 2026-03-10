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
  try {
    const userId = await requireUserId();
    const { matchId } = await ctx.params;

    const client = await pool.connect();
    try {
      await advanceStateIfNeeded(client, matchId);

      const matchRes = await client.query(
        `SELECT m.id, m.room_id, m.status, m.winner_user_id, m.created_at, m.ended_at,
                m.current_phase, m.cooldown_starts_at, m.cooldown_ends_at,
                r.difficulty, r.seconds_per_problem
         FROM battle_matches m
         JOIN battle_rooms r ON r.id = m.room_id
         WHERE m.id = $1`,
        [matchId]
      );

      if (matchRes.rows.length === 0) {
        return NextResponse.json({ error: "Match not found" }, { status: 404 });
      }

      const match = matchRes.rows[0];

      const playersRes = await client.query(
        `SELECT bmp.user_id, bmp.score, bmp.last_submit_at,
                COALESCE(u.username, split_part(u.email, '@', 1)) AS username,
                u.elo_rating
         FROM battle_match_players bmp
         LEFT JOIN users u ON u.id = bmp.user_id
         WHERE bmp.match_id = $1
         ORDER BY bmp.score DESC, bmp.user_id ASC`,
        [matchId]
      );

      const isPlayer = playersRes.rows.some((p: any) => Number(p.user_id) === Number(userId));
      if (!isPlayer) {
        return NextResponse.json({ error: "Not a match participant" }, { status: 403 });
      }

      const lastRoundRes = await client.query(
        `SELECT round_index, problem_id, starts_at, ends_at
         FROM battle_match_rounds
         WHERE match_id = $1
         ORDER BY round_index DESC
         LIMIT 1`,
        [matchId]
      );

      let currentProblem: any = null;
      let problemEndsAt: string | null = null;
      let isLockedOut = false;

      if (lastRoundRes.rows.length > 0) {
        const lastRound = lastRoundRes.rows[0];
        problemEndsAt = toIsoString(lastRound.ends_at);

        const probRes = await client.query(
          `SELECT id, problem_text, difficulty
           FROM integration_problems
           WHERE id = $1`,
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
        }

        // Check per-player lockout: did this player already submit a wrong answer for this problem?
        if (currentProblem) {
          const lockRes = await client.query(
            `SELECT 1 FROM battle_problem_results
             WHERE match_id=$1 AND user_id=$2 AND problem_id=$3 AND is_correct=false
             LIMIT 1`,
            [matchId, userId, currentProblem.id]
          );
          isLockedOut = lockRes.rows.length > 0;
        }
      }

      return NextResponse.json({
        match: {
          id: String(match.id),
          roomId: String(match.room_id),
          status: match.status,
          currentPhase: match.current_phase,
          winnerUserId: match.winner_user_id,
          createdAt: toIsoString(match.created_at),
          endedAt: toIsoString(match.ended_at),
          difficulty: match.difficulty,
          secondsPerProblem: match.seconds_per_problem,
          cooldownStartsAt: toIsoString(match.cooldown_starts_at),
          cooldownEndsAt: toIsoString(match.cooldown_ends_at),
        },
        players: playersRes.rows.map((p: any) => ({
          userId: p.user_id,
          username: p.username || null,
          score: p.score,
          lastSubmitAt: toIsoString(p.last_submit_at),
          eloRating: p.elo_rating != null ? Number(p.elo_rating) : null,
        })),
        currentProblem,
        problemEndsAt,
        isLockedOut,
      });
    } finally {
      client.release();
    }
  } catch (e: any) {
    if (e?.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Match state error:", e);
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 });
  }
}

/**
 * Opportunistically advances match state if cooldown has expired or round time ran out.
 */
async function advanceStateIfNeeded(client: any, matchId: string): Promise<void> {
  const now = new Date();

  const checkRes = await client.query(
    `SELECT id, current_phase, cooldown_ends_at
     FROM battle_matches
     WHERE id = $1 AND status = 'in_game'
     FOR UPDATE SKIP LOCKED`,
    [matchId]
  );

  if (checkRes.rows.length === 0) return;

  const match = checkRes.rows[0];

  if (
    match.current_phase === "cooldown" &&
    match.cooldown_ends_at &&
    new Date(match.cooldown_ends_at) <= now
  ) {
    await client.query(
      `UPDATE battle_matches
       SET current_phase = 'in_game',
           cooldown_starts_at = NULL,
           cooldown_ends_at = NULL
       WHERE id = $1`,
      [matchId]
    );
  }

  const roundRes = await client.query(
    `SELECT round_index, ends_at, ended_reason
     FROM battle_match_rounds
     WHERE match_id = $1
     ORDER BY round_index DESC
     LIMIT 1`,
    [matchId]
  );

  if (roundRes.rows.length > 0) {
    const round = roundRes.rows[0];
    const endsAt = new Date(round.ends_at);

    if (match.current_phase === "in_game" && !round.ended_reason && endsAt <= now) {
      const cooldownStartsAt = now;
      const cooldownEndsAt = new Date(now.getTime() + 5000);

      await client.query(
        `UPDATE battle_matches
         SET current_phase = 'cooldown',
             cooldown_starts_at = $2,
             cooldown_ends_at = $3
         WHERE id = $1`,
        [matchId, cooldownStartsAt.toISOString(), cooldownEndsAt.toISOString()]
      );

      await client.query(
        `UPDATE battle_match_rounds
         SET ended_reason = 'time_expired'
         WHERE match_id = $1 AND round_index = $2`,
        [matchId, round.round_index]
      );

      const nextRoundIndex = Number(round.round_index) + 1;
      const nextStartsAt = cooldownEndsAt;

      const matchData = await client.query(
        `SELECT r.difficulty, r.seconds_per_problem
         FROM battle_matches m
         JOIN battle_rooms r ON r.id = m.room_id
         WHERE m.id = $1`,
        [matchId]
      );

      if (matchData.rows.length > 0) {
        const { difficulty, seconds_per_problem } = matchData.rows[0];
        const nextEndsAt = new Date(nextStartsAt.getTime() + seconds_per_problem * 1000);

        const nextProbRes = await client.query(
          `SELECT id
           FROM integration_problems
           WHERE ($1::int IS NULL OR difficulty = $1)
             AND id NOT IN (
               SELECT problem_id
               FROM battle_match_rounds
               WHERE match_id = $2
             )
           ORDER BY random()
           LIMIT 1`,
          [difficulty, matchId]
        );

        if (nextProbRes.rows.length > 0) {
          const nextProblemId = String(nextProbRes.rows[0].id);

          await client.query(
            `INSERT INTO battle_match_rounds (
               match_id, round_index, problem_id, starts_at, ends_at
             )
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT DO NOTHING`,
            [matchId, nextRoundIndex, nextProblemId, nextStartsAt.toISOString(), nextEndsAt.toISOString()]
          );
        }
      }
    }
  }
}
