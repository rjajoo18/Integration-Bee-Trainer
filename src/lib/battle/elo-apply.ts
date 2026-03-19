/**
 * Shared helper for applying Elo rating changes at match completion.
 *
 * applyEloForWin must be called INSIDE an active transaction that already
 * holds a FOR UPDATE lock on battle_matches (to prevent double-application).
 * It fetches battle stats, computes performance-adjusted deltas, updates both
 * players' ratings, and marks the match as elo_applied = true.
 */

import { computeEloDeltas, MIN_RATING, BattleStats } from "./elo";

export async function applyEloForWin(
  client: any,
  matchId: string,
  winnerId: number,
  secondsPerProblem: number,
): Promise<{ deltaWinner: number; deltaLoser: number }> {
  // Only valid for exactly 2-player matches
  const eloRes = await client.query(
    `SELECT bmp.user_id,
            COALESCE(u.elo_rating, 1200)    AS elo_rating,
            COALESCE(u.rated_battles, 0)    AS rated_battles
     FROM battle_match_players bmp
     JOIN users u ON u.id = bmp.user_id
     WHERE bmp.match_id = $1`,
    [matchId],
  );

  if (eloRes.rows.length !== 2) return { deltaWinner: 0, deltaLoser: 0 };

  const winnerRow = eloRes.rows.find((r: any) => Number(r.user_id) === winnerId);
  const loserRow  = eloRes.rows.find((r: any) => Number(r.user_id) !== winnerId);

  if (!winnerRow || !loserRow) return { deltaWinner: 0, deltaLoser: 0 };

  const loserId = Number(loserRow.user_id);

  // Fetch per-player battle stats in one query
  const [statsRes, roundsRes] = await Promise.all([
    client.query(
      `SELECT
         bpr.user_id,
         COUNT(CASE WHEN bpr.is_correct = true  THEN 1 END)::int  AS correct_count,
         COUNT(CASE WHEN bpr.is_correct = false THEN 1 END)::int  AS wrong_count,
         AVG(
           CASE
             WHEN bpr.is_correct = true
              AND bpr.solved_at IS NOT NULL
              AND bmr.starts_at IS NOT NULL
             THEN EXTRACT(EPOCH FROM (bpr.solved_at - bmr.starts_at))
           END
         )::float AS avg_solve_time_secs
       FROM battle_problem_results bpr
       LEFT JOIN battle_match_rounds bmr
         ON bmr.match_id = bpr.match_id AND bmr.problem_id = bpr.problem_id
       WHERE bpr.match_id = $1
       GROUP BY bpr.user_id`,
      [matchId],
    ),
    client.query(
      `SELECT COUNT(*)::int AS total_rounds FROM battle_match_rounds WHERE match_id = $1`,
      [matchId],
    ),
  ]);

  const totalRounds = Number(roundsRes.rows[0]?.total_rounds ?? 0);

  function buildStats(userId: number): BattleStats {
    const row = statsRes.rows.find((r: any) => Number(r.user_id) === userId);
    const correct = Number(row?.correct_count ?? 0);
    const wrong   = Number(row?.wrong_count   ?? 0);
    // Rounds where the player neither solved nor gave a wrong answer
    const timeouts = Math.max(0, totalRounds - correct - wrong);
    const avgSolveTimeSecs =
      row?.avg_solve_time_secs != null ? Number(row.avg_solve_time_secs) : null;
    return {
      correct,
      wrong,
      timeouts,
      totalRounds,
      avgSolveTimeSecs,
      maxPossibleTimeSecs: secondsPerProblem,
    };
  }

  const winnerStats = buildStats(winnerId);
  const loserStats  = buildStats(loserId);

  const deltas = computeEloDeltas(
    Number(winnerRow.elo_rating),
    Number(loserRow.elo_rating),
    Number(winnerRow.rated_battles),
    Number(loserRow.rated_battles),
    winnerStats,
    loserStats,
  );

  // Update winner
  await client.query(
    `UPDATE users
     SET elo_rating    = elo_rating + $2,
         rated_wins    = rated_wins + 1,
         rated_battles = rated_battles + 1
     WHERE id = $1`,
    [winnerId, deltas.deltaWinner],
  );

  // Update loser (floor at MIN_RATING)
  await client.query(
    `UPDATE users
     SET elo_rating    = GREATEST(${MIN_RATING}, elo_rating + $2),
         rated_losses  = rated_losses + 1,
         rated_battles = rated_battles + 1
     WHERE id = $1`,
    [loserId, deltas.deltaLoser],
  );

  // Mark match as rated and record deltas
  await client.query(
    `UPDATE battle_matches
     SET elo_applied       = true,
         loser_user_id     = $2,
         elo_delta_winner  = $3,
         elo_delta_loser   = $4,
         rated_completed_at = now()
     WHERE id = $1`,
    [matchId, loserId, deltas.deltaWinner, deltas.deltaLoser],
  );

  return { deltaWinner: deltas.deltaWinner, deltaLoser: deltas.deltaLoser };
}
