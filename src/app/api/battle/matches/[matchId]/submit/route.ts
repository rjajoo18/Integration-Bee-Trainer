import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { answersEquivalent } from "@/lib/battle/answer";
import { computeEloDeltas } from "@/lib/battle/elo";

export const runtime = "nodejs";

const COOLDOWN_SECONDS = 5;

function isValidProblemId(id: string): boolean {
  return /^[A-Z0-9-]+$/i.test(id) && id.length < 100 && !id.includes(' ');
}

export async function POST(req: Request, ctx: { params: Promise<{ matchId: string }> }) {
  let userId: number;
  try {
    userId = await requireUserId();
  } catch (error) {
    console.error('[SUBMIT] Auth failed:', error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { matchId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const problemId = String(body.problemId ?? "").trim();
  const answer = String(body.answerLatex ?? "").trim();

  console.log('[SUBMIT] Request:', { matchId, userId, problemId: problemId.substring(0, 20), hasAnswer: !!answer });

  if (!problemId) {
    return NextResponse.json({ error: "Missing problemId" }, { status: 400 });
  }

  if (!isValidProblemId(problemId)) {
    return NextResponse.json({
      error: "Invalid problem ID format"
    }, { status: 400 });
  }

  if (!answer) {
    return NextResponse.json({ error: "Empty answer" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const matchRes = await client.query(
      `SELECT m.id, m.room_id, m.status,
              r.difficulty, r.seconds_per_problem
       FROM battle_matches m
       JOIN battle_rooms r ON r.id = m.room_id
       WHERE m.id=$1
       FOR UPDATE`,
      [matchId]
    );

    if (matchRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    const m = matchRes.rows[0] as {
      room_id: string;
      status: string;
      difficulty: number | null;
      seconds_per_problem: number;
    };

    if (m.status !== "in_game") {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Match is not active" }, { status: 400 });
    }

    const playerRes = await client.query(
      `SELECT user_id, score
       FROM battle_match_players
       WHERE match_id=$1 AND user_id=$2
       FOR UPDATE`,
      [matchId, userId]
    );

    if (playerRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Not a participant" }, { status: 403 });
    }

    const roundRes = await client.query(
      `SELECT round_index, problem_id, ends_at
       FROM battle_match_rounds
       WHERE match_id=$1
       ORDER BY round_index DESC
       LIMIT 1`,
      [matchId]
    );

    if (roundRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "No active problem yet" }, { status: 400 });
    }

    const round = roundRes.rows[0] as { round_index: number; problem_id: string; ends_at: string };

    if (String(round.problem_id) !== String(problemId)) {
      await client.query("ROLLBACK");
      return NextResponse.json({
        error: "Not the current problem",
        expected: round.problem_id,
        received: problemId
      }, { status: 400 });
    }

    const now = new Date();
    const endsAt = new Date(round.ends_at);
    if (now > endsAt) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Time is up" }, { status: 400 });
    }

    // Lockout enforcement: block any re-attempt after a wrong answer.
    // (match_id, user_id, problem_id) is unique — any existing record means they already tried.
    const prevAttemptRes = await client.query(
      `SELECT is_correct FROM battle_problem_results
       WHERE match_id=$1 AND user_id=$2 AND problem_id=$3
       LIMIT 1`,
      [matchId, userId, problemId]
    );

    if (prevAttemptRes.rows.length > 0) {
      const wasCorrect = prevAttemptRes.rows[0].is_correct;
      await client.query("ROLLBACK");
      if (wasCorrect) {
        return NextResponse.json({ error: "Already solved this problem" }, { status: 400 });
      }
      // Wrong attempt already recorded → locked out
      return NextResponse.json({
        error: "Already attempted — locked out for this round.",
        locked: true
      }, { status: 400 });
    }

    const probRes = await client.query(
      `SELECT problem_answer_computed AS canonical_answer FROM integration_problems WHERE id=$1`,
      [problemId]
    );

    if (probRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Problem not found" }, { status: 404 });
    }

    const canonical = String(probRes.rows[0].canonical_answer ?? "");
    const correct = answersEquivalent(answer, canonical);

    console.log('[SUBMIT] Answer check:', {
      userId, problemId, correct,
      answer: answer.substring(0, 40),
      canonical: canonical.substring(0, 40),
    });

    if (!correct) {
      // Record the wrong attempt (locks the player out for this round)
      await client.query(
        `INSERT INTO battle_problem_results (user_id, problem_id, match_id, room_id, is_correct, attempts)
         VALUES ($1, $2, $3, $4, false, 1)
         ON CONFLICT (match_id, user_id, problem_id)
         DO UPDATE SET
           attempts = battle_problem_results.attempts + 1,
           updated_at = now()`,
        [userId, problemId, matchId, m.room_id]
      );

      // Check whether every participant has now answered this problem incorrectly.
      // The FOR UPDATE on battle_matches at the top of this transaction serializes
      // concurrent submits, so these counts are stable within the transaction.
      const [wrongCountRes, playerCountRes] = await Promise.all([
        client.query(
          `SELECT COUNT(*) AS cnt
           FROM battle_problem_results
           WHERE match_id=$1 AND problem_id=$2 AND is_correct=false`,
          [matchId, problemId]
        ),
        client.query(
          `SELECT COUNT(*) AS cnt FROM battle_match_players WHERE match_id=$1`,
          [matchId]
        ),
      ]);
      const wrongCount = Number(wrongCountRes.rows[0].cnt);
      const playerCount = Number(playerCountRes.rows[0].cnt);

      if (wrongCount >= playerCount && playerCount > 0) {
        // All players got it wrong — enter cooldown immediately and queue the next
        // problem, exactly as advanceStateIfNeeded does on timer expiry.
        const now = new Date();
        const nextRoundIndex = Number(round.round_index) + 1;

        // Mark the round as ended so advanceStateIfNeeded ignores it on future GETs
        await client.query(
          `UPDATE battle_match_rounds SET ended_reason='all_wrong'
           WHERE match_id=$1 AND round_index=$2`,
          [matchId, round.round_index]
        );

        // 10-problem cap: if all players got the last problem wrong, end match by score
        if (nextRoundIndex >= 10) {
          const scoresRes = await client.query(
            `SELECT user_id, score FROM battle_match_players WHERE match_id=$1 ORDER BY score DESC`,
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
             SET status='finished', current_phase='finished', winner_user_id=$2, ended_at=now(),
                 cooldown_starts_at=NULL, cooldown_ends_at=NULL
             WHERE id=$1`,
            [matchId, winnerId]
          );
          await client.query(`UPDATE battle_rooms SET status='finished' WHERE id=$1`, [m.room_id]);
          await client.query("COMMIT");
          return NextResponse.json({
            correct: false,
            locked: true,
            allWrong: true,
            matchEnded: true,
            draw: winnerId === null,
            winnerUserId: winnerId,
            message: "All players got it wrong — match over (10 problems reached).",
          });
        }

        const cooldownEndsAt = new Date(now.getTime() + COOLDOWN_SECONDS * 1000);
        const nextEndsAt = new Date(cooldownEndsAt.getTime() + Number(m.seconds_per_problem) * 1000);

        // Transition match to cooldown so the frontend shows the countdown overlay
        await client.query(
          `UPDATE battle_matches
           SET current_phase='cooldown', cooldown_starts_at=$2, cooldown_ends_at=$3
           WHERE id=$1`,
          [matchId, now.toISOString(), cooldownEndsAt.toISOString()]
        );

        // Pick an unused problem for the next round
        const nextProbRes = await client.query(
          `SELECT id FROM integration_problems
           WHERE ($1::int IS NULL OR difficulty = $1)
             AND NOT EXISTS (
               SELECT 1 FROM battle_match_rounds
               WHERE match_id=$2 AND problem_id=integration_problems.id
             )
           ORDER BY random() LIMIT 1`,
          [m.difficulty, matchId]
        );

        if (nextProbRes.rows.length > 0) {
          const nextProblemId = String(nextProbRes.rows[0].id);
          await client.query(
            `INSERT INTO battle_match_rounds (match_id, round_index, problem_id, starts_at, ends_at)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT DO NOTHING`,
            [matchId, nextRoundIndex, nextProblemId,
             cooldownEndsAt.toISOString(), nextEndsAt.toISOString()]
          );
        }

        await client.query("COMMIT");
        console.log('[SUBMIT] All players wrong — advancing to round', nextRoundIndex);
        return NextResponse.json({
          correct: false,
          locked: true,
          allWrong: true,
          message: "All players got it wrong — moving to next problem.",
        });
      }

      await client.query("COMMIT");
      return NextResponse.json({ correct: false, message: "Incorrect", locked: true });
    }

    // Correct answer: bump score
    const newScore = Number(playerRes.rows[0].score) + 1;

    await client.query(
      `UPDATE battle_match_players
       SET score=$3, last_submit_at=now()
       WHERE match_id=$1 AND user_id=$2`,
      [matchId, userId, newScore]
    );

    await client.query(
      `INSERT INTO battle_problem_results (user_id, problem_id, match_id, room_id, is_correct, attempts, solved_at)
       VALUES ($1, $2, $3, $4, true, 1, now())
       ON CONFLICT (match_id, user_id, problem_id)
       DO UPDATE SET
         is_correct = true,
         solved_at = COALESCE(battle_problem_results.solved_at, now()),
         attempts = battle_problem_results.attempts + 1,
         updated_at = now()`,
      [userId, problemId, matchId, m.room_id]
    );

    console.log('[SUBMIT] Correct answer! New score:', newScore);

    // Win condition: first to 3
    if (newScore >= 3) {
      // ── Elo update (2-player matches only) ────────────────────────────────
      // Fetch both players' current ratings in one query.
      // The match is already locked FOR UPDATE at the top of this transaction,
      // so no concurrent submit can reach this branch simultaneously.
      const allPlayersElo = await client.query(
        `SELECT bmp.user_id, u.elo_rating, u.rated_battles
         FROM battle_match_players bmp
         JOIN users u ON u.id = bmp.user_id
         WHERE bmp.match_id = $1`,
        [matchId],
      );

      let eloApplied = false;
      let loserId: number | null = null;
      let deltaWinner: number | null = null;
      let deltaLoser: number | null = null;

      // Only apply Elo for exactly 2-player matches
      if (allPlayersElo.rows.length === 2) {
        const winnerRow = allPlayersElo.rows.find(
          (r: any) => Number(r.user_id) === userId,
        );
        const loserRow = allPlayersElo.rows.find(
          (r: any) => Number(r.user_id) !== userId,
        );

        if (winnerRow && loserRow) {
          const deltas = computeEloDeltas(
            Number(winnerRow.elo_rating),
            Number(loserRow.elo_rating),
            Number(winnerRow.rated_battles),
            Number(loserRow.rated_battles),
          );
          deltaWinner = deltas.deltaWinner;
          deltaLoser = deltas.deltaLoser;
          loserId = Number(loserRow.user_id);

          await client.query(
            `UPDATE users
             SET elo_rating     = elo_rating + $2,
                 rated_wins     = rated_wins + 1,
                 rated_battles  = rated_battles + 1
             WHERE id = $1`,
            [userId, deltaWinner],
          );

          await client.query(
            `UPDATE users
             SET elo_rating     = GREATEST(100, elo_rating + $2),
                 rated_losses   = rated_losses + 1,
                 rated_battles  = rated_battles + 1
             WHERE id = $1`,
            [loserId, deltaLoser],
          );

          eloApplied = true;
        }
      }

      await client.query(
        `UPDATE battle_matches
         SET status              = 'finished',
             winner_user_id      = $2,
             ended_at            = now(),
             elo_applied         = $3,
             loser_user_id       = $4,
             elo_delta_winner    = $5,
             elo_delta_loser     = $6,
             rated_completed_at  = $7
         WHERE id = $1`,
        [
          matchId,
          userId,
          eloApplied,
          loserId,
          deltaWinner,
          deltaLoser,
          eloApplied ? new Date() : null,
        ],
      );

      await client.query(`UPDATE battle_rooms SET status='finished' WHERE id=$1`, [m.room_id]);
      await client.query("COMMIT");
      return NextResponse.json({ correct: true, newScore, winnerUserId: userId, matchEnded: true });
    }

    // Schedule cooldown + next round
    const cooldownUntil = new Date(Date.now() + COOLDOWN_SECONDS * 1000);
    const nextStartsAt = cooldownUntil;
    const nextEndsAt = new Date(nextStartsAt.getTime() + Number(m.seconds_per_problem) * 1000);
    const nextRoundIndex = Number(round.round_index) + 1;

    // 10-problem cap: end match by score if this was the last allowed problem
    if (nextRoundIndex >= 10) {
      const scoresRes = await client.query(
        `SELECT user_id, score FROM battle_match_players WHERE match_id=$1 ORDER BY score DESC`,
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
         SET status='finished', current_phase='finished', winner_user_id=$2, ended_at=now()
         WHERE id=$1`,
        [matchId, winnerId]
      );
      await client.query(`UPDATE battle_rooms SET status='finished' WHERE id=$1`, [m.room_id]);
      await client.query("COMMIT");
      return NextResponse.json({
        correct: true,
        newScore,
        matchEnded: true,
        draw: winnerId === null,
        winnerUserId: winnerId,
      });
    }

    const existingNext = await client.query(
      `SELECT 1 FROM battle_match_rounds WHERE match_id=$1 AND round_index=$2 LIMIT 1`,
      [matchId, nextRoundIndex]
    );

    let nextProblemId: string | null = null;

    if (existingNext.rows.length === 0) {
      const nextProbRes = await client.query(
        `SELECT id
         FROM integration_problems
         WHERE ($1::int IS NULL OR difficulty = $1)
           AND NOT EXISTS (
             SELECT 1 FROM battle_match_rounds
             WHERE match_id = $2 AND problem_id = integration_problems.id
           )
         ORDER BY random()
         LIMIT 1`,
        [m.difficulty, matchId]
      );

      if (nextProbRes.rows.length > 0) {
        nextProblemId = String(nextProbRes.rows[0].id);

        await client.query(
          `INSERT INTO battle_match_rounds (match_id, round_index, problem_id, starts_at, ends_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [matchId, nextRoundIndex, nextProblemId, nextStartsAt.toISOString(), nextEndsAt.toISOString()]
        );
      }
    }

    await client.query("COMMIT");
    return NextResponse.json({
      correct: true,
      newScore,
      message: "Correct!",
      cooldownSeconds: COOLDOWN_SECONDS,
      cooldownUntil: cooldownUntil.toISOString(),
      nextRound: {
        roundIndex: nextRoundIndex,
        problemId: nextProblemId,
        startsAt: nextStartsAt.toISOString(),
        endsAt: nextEndsAt.toISOString(),
      },
    });
  } catch (e: any) {
    await client.query("ROLLBACK");
    console.error('[SUBMIT] Error:', e);
    return NextResponse.json({
      error: e?.message ?? "Failed submit",
      ...(process.env.NODE_ENV === 'development' && { stack: e?.stack })
    }, { status: 500 });
  } finally {
    client.release();
  }
}
