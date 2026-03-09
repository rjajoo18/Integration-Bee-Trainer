/**
 * Standard Elo rating helpers.
 *
 * K-factor schedule (Chess.com-style):
 *   K = 40  when rated_battles < 20  (provisional / fast-moving)
 *   K = 20  otherwise               (established / stable)
 *
 * No draw logic — draws are impossible in this game.
 */

const K_PROVISIONAL = 40;
const K_ESTABLISHED = 20;
const PROVISIONAL_THRESHOLD = 20;
const MIN_RATING = 100;

function kFactor(ratedBattles: number): number {
  return ratedBattles < PROVISIONAL_THRESHOLD ? K_PROVISIONAL : K_ESTABLISHED;
}

/** Expected score for player A given both ratings (standard Elo formula). */
function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

export interface EloDeltas {
  deltaWinner: number; // positive
  deltaLoser: number;  // negative
  newWinnerRating: number;
  newLoserRating: number;
}

/**
 * Compute Elo rating changes for a completed match.
 *
 * @param winnerRating   Current Elo of the winner
 * @param loserRating    Current Elo of the loser
 * @param winnerBattles  Number of rated battles the winner has played (before this one)
 * @param loserBattles   Number of rated battles the loser has played (before this one)
 */
export function computeEloDeltas(
  winnerRating: number,
  loserRating: number,
  winnerBattles: number,
  loserBattles: number,
): EloDeltas {
  const kW = kFactor(winnerBattles);
  const kL = kFactor(loserBattles);

  const eW = expectedScore(winnerRating, loserRating);
  const eL = expectedScore(loserRating, winnerRating);

  // S_winner = 1 (win), S_loser = 0 (loss)
  const deltaWinner = Math.round(kW * (1 - eW));
  const deltaLoser = Math.round(kL * (0 - eL));

  return {
    deltaWinner,
    deltaLoser,
    newWinnerRating: winnerRating + deltaWinner,
    newLoserRating: Math.max(MIN_RATING, loserRating + deltaLoser),
  };
}
