/**
 * Elo rating system for Integration Bee battles.
 *
 * K-factor schedule:
 *   K = 40  when rated_battles < 10  (provisional / fast-moving)
 *   K = 24  standard
 *   K = 16  when elo_rating >= 2000 AND rated_battles >= 30 (stable high-rated)
 *
 * Performance modifier:
 *   Computes a performanceIndex in [0,1] for each player from:
 *     - accuracy          (45%): correct / (correct + wrong)
 *     - correctShare      (30%): player_correct / total_correct_in_match
 *     - speedScore        (15%): inverse of avg solve time, normalized to [0,1]
 *     - timeoutPenalty    (10%): 1 - (timeouts / totalRounds)
 *
 *   perfGap = perfW - perfL  →  modifier = clamp(perfGap * 0.10, -0.08, 0.08)
 *
 *   Adjusted actual score (SA):
 *     winner: clamp(0.96 + max(0, modifier), 0.96, 1.00)
 *     loser:  SL = 1 - SA  ∈ [0.00, 0.04]
 *
 *   This keeps outcome dominant (winner ≈ 1, loser ≈ 0) while giving a small
 *   bonus for dominant performances. Rating changes are zero-sum up to rounding.
 */

export interface BattleStats {
  /** Problems answered correctly by this player */
  correct: number;
  /** Problems answered incorrectly (wrong answer → locked out for that round) */
  wrong: number;
  /** Rounds where this player did not submit at all (timeout / no attempt) */
  timeouts: number;
  /** Total rounds played in the match */
  totalRounds: number;
  /** Average seconds from round start to correct answer; null if no correct solves */
  avgSolveTimeSecs: number | null;
  /** seconds_per_problem for the room — used to normalize speed into [0,1] */
  maxPossibleTimeSecs: number;
}

export interface EloDeltas {
  deltaWinner: number;       // positive integer
  deltaLoser: number;        // zero or negative integer (floored at MIN_RATING)
  newWinnerRating: number;
  newLoserRating: number;
}

export const MIN_RATING = 100;
export const DEFAULT_RATING = 1200;

function kFactor(ratedBattles: number, eloRating: number): number {
  if (ratedBattles < 10) return 40;
  if (eloRating >= 2000 && ratedBattles >= 30) return 16;
  return 24;
}

/** Standard Elo expected score for player A against player B. */
function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Compute a performance index in [0, 1] for one player.
 * Higher value = stronger performance in this match.
 */
function computePerformanceIndex(stats: BattleStats, oppStats: BattleStats): number {
  // Accuracy: what fraction of attempted problems were solved correctly
  const totalAnswered = stats.correct + stats.wrong;
  const accuracy = totalAnswered > 0 ? stats.correct / totalAnswered : 0;

  // Correct-answer share: fraction of all correct answers belonging to this player
  const totalCorrect = stats.correct + oppStats.correct;
  const correctShare = totalCorrect > 0 ? stats.correct / totalCorrect : 0.5;

  // Speed score: 0 = used full time, 1 = answered instantly.
  // Neutral (0.5) if this player had no correct solves.
  let speedScore = 0.5;
  if (stats.avgSolveTimeSecs != null && stats.maxPossibleTimeSecs > 0) {
    const normalizedTime = stats.avgSolveTimeSecs / stats.maxPossibleTimeSecs;
    speedScore = clamp(1 - normalizedTime, 0, 1);
  }

  // Timeout penalty: fraction of rounds where this player did not submit anything
  const timeoutRate = stats.totalRounds > 0 ? stats.timeouts / stats.totalRounds : 0;

  return (
    0.45 * accuracy +
    0.30 * correctShare +
    0.15 * speedScore +
    0.10 * (1 - timeoutRate)
  );
}

/**
 * Compute Elo rating changes for a completed 1v1 match.
 *
 * @param winnerRating   Current Elo of the winner
 * @param loserRating    Current Elo of the loser
 * @param winnerBattles  Rated battles completed by winner before this match
 * @param loserBattles   Rated battles completed by loser before this match
 * @param winnerStats    Optional battle performance stats for winner
 * @param loserStats     Optional battle performance stats for loser
 */
export function computeEloDeltas(
  winnerRating: number,
  loserRating: number,
  winnerBattles: number,
  loserBattles: number,
  winnerStats?: BattleStats,
  loserStats?: BattleStats,
): EloDeltas {
  const KW = kFactor(winnerBattles, winnerRating);
  const KL = kFactor(loserBattles, loserRating);

  const EW = expectedScore(winnerRating, loserRating);
  const EL = expectedScore(loserRating, winnerRating);

  // Adjusted actual score: winner near 1, loser near 0
  let SA: number;
  if (winnerStats && loserStats) {
    const perfW = computePerformanceIndex(winnerStats, loserStats);
    const perfL = computePerformanceIndex(loserStats, winnerStats);
    const perfGap = perfW - perfL; // positive = winner dominated
    const modifier = clamp(perfGap * 0.10, -0.08, 0.08);
    // Winner gets base 0.96; dominant performance can push up to 1.00
    SA = clamp(0.96 + Math.max(0, modifier), 0.96, 1.00);
  } else {
    SA = 0.96; // No stats: standard win, no modifier
  }

  const SL = 1 - SA; // Zero-sum: loser ∈ [0.00, 0.04]

  const rawNewWinner = winnerRating + KW * (SA - EW);
  const rawNewLoser = loserRating + KL * (SL - EL);

  const newWinnerRating = Math.round(rawNewWinner);
  const newLoserRating = Math.max(MIN_RATING, Math.round(rawNewLoser));

  return {
    deltaWinner: newWinnerRating - winnerRating,
    deltaLoser: newLoserRating - loserRating,
    newWinnerRating,
    newLoserRating,
  };
}
