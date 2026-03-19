import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { applyEloForWin } from "@/lib/battle/elo-apply";

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

      // Fallback: apply Elo for matches that ended via timer-expiry (non-fatal)
      try {
        await maybeApplyEloFallback(client, matchId);
      } catch (eloErr) {
        console.error("[MATCH_GET] Elo fallback error (non-fatal):", eloErr);
      }

      const matchRes = await client.query(
        `SELECT m.id, m.room_id, m.status, m.winner_user_id, m.loser_user_id,
                m.created_at, m.ended_at,
                m.current_phase, m.cooldown_starts_at, m.cooldown_ends_at,
                m.elo_applied, m.elo_delta_winner, m.elo_delta_loser,
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
                u.elo_rating,
                EXISTS(
                  SELECT 1 FROM battle_room_players brp
                  WHERE brp.room_id = $2 AND brp.user_id = bmp.user_id
                ) AS is_in_room
         FROM battle_match_players bmp
         LEFT JOIN users u ON u.id = bmp.user_id
         WHERE bmp.match_id = $1
         ORDER BY bmp.score DESC, bmp.user_id ASC`,
        [matchId, match.room_id]
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
          loserUserId: match.loser_user_id != null ? Number(match.loser_user_id) : null,
          createdAt: toIsoString(match.created_at),
          endedAt: toIsoString(match.ended_at),
          difficulty: match.difficulty,
          secondsPerProblem: match.seconds_per_problem,
          cooldownStartsAt: toIsoString(match.cooldown_starts_at),
          cooldownEndsAt: toIsoString(match.cooldown_ends_at),
          eloApplied: match.elo_applied ?? false,
          eloDeltaWinner: match.elo_delta_winner != null ? Number(match.elo_delta_winner) : null,
          eloDeltaLoser: match.elo_delta_loser != null ? Number(match.elo_delta_loser) : null,
        },
        players: playersRes.rows.map((p: any) => ({
          userId: p.user_id,
          username: p.username || null,
          score: p.score,
          lastSubmitAt: toIsoString(p.last_submit_at),
          eloRating: p.elo_rating != null ? Number(p.elo_rating) : null,
          isInRoom: Boolean(p.is_in_room),
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
 * Idempotent fallback: apply Elo for matches that ended via timer-expiry without
 * going through the submit route (where Elo is applied inline).
 *
 * Uses its own BEGIN/COMMIT so it is isolated from advanceStateIfNeeded's
 * auto-committed queries. The FOR UPDATE on battle_matches serializes concurrent
 * GET polls — the second one will see elo_applied = true and skip.
 */
async function maybeApplyEloFallback(client: any, matchId: string): Promise<void> {
  await client.query("BEGIN");
  try {
    const checkRes = await client.query(
      `SELECT m.winner_user_id, r.seconds_per_problem
       FROM battle_matches m
       JOIN battle_rooms r ON r.id = m.room_id
       WHERE m.id = $1
         AND m.status = 'finished'
         AND m.elo_applied IS NOT TRUE
         AND m.winner_user_id IS NOT NULL
       FOR UPDATE`,
      [matchId],
    );

    if (checkRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return;
    }

    const { winner_user_id, seconds_per_problem } = checkRes.rows[0];
    await applyEloForWin(client, matchId, Number(winner_user_id), Number(seconds_per_problem));
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
}

/**
 * Opportunistically advances match state if cooldown has expired or round time ran out.
 */
async function advanceStateIfNeeded(client: any, matchId: string): Promise<void> {
  const now = new Date();

  const checkRes = await client.query(
    `SELECT id, room_id, current_phase, cooldown_ends_at
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
      const nextRoundIndex = Number(round.round_index) + 1;

      // 10-problem cap: end the match after the last round expires
      if (nextRoundIndex >= 10) {
        await client.query(
          `UPDATE battle_match_rounds SET ended_reason = 'time_expired'
           WHERE match_id = $1 AND round_index = $2`,
          [matchId, round.round_index]
        );

        const scoresRes = await client.query(
          `SELECT user_id, score FROM battle_match_players WHERE match_id = $1 ORDER BY score DESC`,
          [matchId]
        );

        let winnerId: any = null;
        if (scoresRes.rows.length >= 2 && Number(scoresRes.rows[0].score) > Number(scoresRes.rows[1].score)) {
          winnerId = scoresRes.rows[0].user_id;
        } else if (scoresRes.rows.length === 1) {
          winnerId = scoresRes.rows[0].user_id;
        }

        await client.query(
          `UPDATE battle_matches
           SET status = 'finished', current_phase = 'finished',
               winner_user_id = $2, ended_at = now(),
               cooldown_starts_at = NULL, cooldown_ends_at = NULL
           WHERE id = $1`,
          [matchId, winnerId]
        );

        await client.query(
          `UPDATE battle_rooms SET status = 'finished' WHERE id = $1`,
          [match.room_id]
        );

        return;
      }

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
