export async function determineWinnerId(client: any, matchId: string): Promise<number | null> {
  const scoresRes = await client.query(
    `SELECT user_id, score
     FROM battle_match_players
     WHERE match_id = $1
     ORDER BY score DESC, user_id ASC`,
    [matchId],
  );

  if (scoresRes.rows.length === 0) return null;
  if (scoresRes.rows.length === 1) return Number(scoresRes.rows[0].user_id);

  const topScore = Number(scoresRes.rows[0].score);
  const secondScore = Number(scoresRes.rows[1].score);
  if (topScore === secondScore) return null;
  return Number(scoresRes.rows[0].user_id);
}
