import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { answersEquivalent, validateAnswerInput } from "@/lib/battle/answer";
import { applyEloForWin } from "@/lib/battle/elo-apply";
import { ROUND_COOLDOWN_SECONDS, TOTAL_MATCH_ROUNDS } from "@/lib/battle/constants";

export const runtime = "nodejs";

function isValidProblemId(id: string): boolean {
  return /^[A-Z0-9-]+$/i.test(id) && id.length < 100 && !id.includes(" ");
}

async function determineWinnerId(client: any, matchId: string): Promise<number | null> {
  const scoresRes = await client.query(
    `SELECT user_id, score
     FROM battle_match_players
     WHERE match_id = $1
     ORDER BY score DESC, user_id ASC`,
    [matchId]
  );

  if (scoresRes.rows.length === 0) return null;
  if (scoresRes.rows.length === 1) return Number(scoresRes.rows[0].user_id);

  const topScore = Number(scoresRes.rows[0].score);
  const secondScore = Number(scoresRes.rows[1].score);
  if (topScore === secondScore) return null;
  return Number(scoresRes.rows[0].user_id);
}

async function finishMatchByScore(client: any, matchId: string, roomId: string, secondsPerProblem: number) {
  const winnerId = await determineWinnerId(client, matchId);

  await client.query(
    `UPDATE battle_matches
     SET status = 'finished',
         current_phase = 'finished',
         winner_user_id = $2,
         ended_at = now(),
         cooldown_starts_at = NULL,
         cooldown_ends_at = NULL
     WHERE id = $1`,
    [matchId, winnerId]
  );

  if (winnerId !== null) {
    await applyEloForWin(client, matchId, winnerId, secondsPerProblem);
  }

  await client.query(`UPDATE battle_rooms SET status = 'finished' WHERE id = $1`, [roomId]);
  return winnerId;
}

export async function POST(req: Request, ctx: { params: Promise<{ matchId: string }> }) {
  let userId: number;
  try {
    userId = await requireUserId();
  } catch (error) {
    console.error("[SUBMIT] Auth failed:", error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { matchId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const problemId = String(body.problemId ?? "").trim();
  const answer = String(body.answerLatex ?? "").trim();

  if (!problemId) {
    return NextResponse.json({ error: "Missing problemId" }, { status: 400 });
  }

  if (!isValidProblemId(problemId)) {
    return NextResponse.json({ error: "Invalid problem ID format" }, { status: 400 });
  }

  if (!answer) {
    return NextResponse.json({ error: "Empty answer" }, { status: 400 });
  }

  const validationError = validateAnswerInput(answer);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const matchRes = await client.query(
      `SELECT m.id, m.room_id, m.status, r.difficulty, r.seconds_per_problem
       FROM battle_matches m
       JOIN battle_rooms r ON r.id = m.room_id
       WHERE m.id = $1
       FOR UPDATE`,
      [matchId]
    );

    if (matchRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    const match = matchRes.rows[0] as {
      room_id: string;
      status: string;
      difficulty: number | null;
      seconds_per_problem: number;
    };

    if (match.status !== "in_game") {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Match is not active" }, { status: 400 });
    }

    const playerRes = await client.query(
      `SELECT user_id, score
       FROM battle_match_players
       WHERE match_id = $1 AND user_id = $2
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
       WHERE match_id = $1
       ORDER BY round_index DESC
       LIMIT 1`,
      [matchId]
    );

    if (roundRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "No active problem yet" }, { status: 400 });
    }

    const round = roundRes.rows[0] as { round_index: number; problem_id: string; ends_at: string };

    if (String(round.problem_id) !== problemId) {
      await client.query("ROLLBACK");
      return NextResponse.json({
        error: "Not the current problem",
        expected: round.problem_id,
        received: problemId,
      }, { status: 400 });
    }

    if (new Date() > new Date(round.ends_at)) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Time is up" }, { status: 400 });
    }

    const prevAttemptRes = await client.query(
      `SELECT is_correct
       FROM battle_problem_results
       WHERE match_id = $1 AND user_id = $2 AND problem_id = $3
       LIMIT 1`,
      [matchId, userId, problemId]
    );

    if (prevAttemptRes.rows.length > 0) {
      const wasCorrect = prevAttemptRes.rows[0].is_correct;
      await client.query("ROLLBACK");
      if (wasCorrect) {
        return NextResponse.json({ error: "Already solved this problem" }, { status: 400 });
      }
      return NextResponse.json({
        error: "Already attempted and locked out for this round.",
        locked: true,
      }, { status: 400 });
    }

    const probRes = await client.query(
      `SELECT problem_answer_computed AS canonical_answer
       FROM integration_problems
       WHERE id = $1`,
      [problemId]
    );

    if (probRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Problem not found" }, { status: 404 });
    }

    const canonical = String(probRes.rows[0].canonical_answer ?? "");
    const correct = answersEquivalent(answer, canonical);
    const nextRoundIndex = Number(round.round_index) + 1;
    const lastRoundReached = nextRoundIndex >= TOTAL_MATCH_ROUNDS;

    if (!correct) {
      await client.query(
        `INSERT INTO battle_problem_results (user_id, problem_id, match_id, room_id, is_correct, attempts)
         VALUES ($1, $2, $3, $4, false, 1)
         ON CONFLICT (match_id, user_id, problem_id)
         DO UPDATE SET
           attempts = battle_problem_results.attempts + 1,
           updated_at = now()`,
        [userId, problemId, matchId, match.room_id]
      );

      const [wrongCountRes, playerCountRes] = await Promise.all([
        client.query(
          `SELECT COUNT(*)::int AS cnt
           FROM battle_problem_results
           WHERE match_id = $1 AND problem_id = $2 AND is_correct = false`,
          [matchId, problemId]
        ),
        client.query(
          `SELECT COUNT(*)::int AS cnt
           FROM battle_match_players
           WHERE match_id = $1`,
          [matchId]
        ),
      ]);

      const wrongCount = Number(wrongCountRes.rows[0].cnt);
      const playerCount = Number(playerCountRes.rows[0].cnt);

      if (wrongCount >= playerCount && playerCount > 0) {
        await client.query(
          `UPDATE battle_match_rounds
           SET ended_reason = 'all_wrong'
           WHERE match_id = $1 AND round_index = $2`,
          [matchId, round.round_index]
        );

        if (lastRoundReached) {
          const winnerId = await finishMatchByScore(client, matchId, match.room_id, match.seconds_per_problem);
          await client.query("COMMIT");
          return NextResponse.json({
            correct: false,
            locked: true,
            allWrong: true,
            matchEnded: true,
            draw: winnerId === null,
            winnerUserId: winnerId,
            message: "All players got it wrong. Match over.",
          });
        }

        const cooldownEndsAt = new Date(Date.now() + ROUND_COOLDOWN_SECONDS * 1000);
        const nextEndsAt = new Date(cooldownEndsAt.getTime() + Number(match.seconds_per_problem) * 1000);

        await client.query(
          `UPDATE battle_matches
           SET current_phase = 'cooldown',
               cooldown_starts_at = $2,
               cooldown_ends_at = $3
           WHERE id = $1`,
          [matchId, new Date().toISOString(), cooldownEndsAt.toISOString()]
        );

        const nextProbRes = await client.query(
          `SELECT id
           FROM integration_problems
           WHERE ($1::int IS NULL OR difficulty = $1)
             AND NOT EXISTS (
               SELECT 1
               FROM battle_match_rounds
               WHERE match_id = $2 AND problem_id = integration_problems.id
             )
           ORDER BY random()
           LIMIT 1`,
          [match.difficulty, matchId]
        );

        if (nextProbRes.rows.length > 0) {
          const nextProblemId = String(nextProbRes.rows[0].id);
          await client.query(
            `INSERT INTO battle_match_rounds (match_id, round_index, problem_id, starts_at, ends_at)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT DO NOTHING`,
            [matchId, nextRoundIndex, nextProblemId, cooldownEndsAt.toISOString(), nextEndsAt.toISOString()]
          );
        }

        await client.query("COMMIT");
        return NextResponse.json({
          correct: false,
          locked: true,
          allWrong: true,
          message: "All players got it wrong. Moving to the next problem.",
        });
      }

      await client.query("COMMIT");
      return NextResponse.json({ correct: false, message: "Incorrect", locked: true });
    }

    const newScore = Number(playerRes.rows[0].score) + 1;

    await client.query(
      `UPDATE battle_match_players
       SET score = $3, last_submit_at = now()
       WHERE match_id = $1 AND user_id = $2`,
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
      [userId, problemId, matchId, match.room_id]
    );

    if (lastRoundReached) {
      const winnerId = await finishMatchByScore(client, matchId, match.room_id, match.seconds_per_problem);
      await client.query("COMMIT");
      return NextResponse.json({
        correct: true,
        newScore,
        matchEnded: true,
        draw: winnerId === null,
        winnerUserId: winnerId,
      });
    }

    const cooldownUntil = new Date(Date.now() + ROUND_COOLDOWN_SECONDS * 1000);
    const nextEndsAt = new Date(cooldownUntil.getTime() + Number(match.seconds_per_problem) * 1000);

    const existingNext = await client.query(
      `SELECT 1 FROM battle_match_rounds WHERE match_id = $1 AND round_index = $2 LIMIT 1`,
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
        [match.difficulty, matchId]
      );

      if (nextProbRes.rows.length > 0) {
        nextProblemId = String(nextProbRes.rows[0].id);
        await client.query(
          `INSERT INTO battle_match_rounds (match_id, round_index, problem_id, starts_at, ends_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [matchId, nextRoundIndex, nextProblemId, cooldownUntil.toISOString(), nextEndsAt.toISOString()]
        );
      }
    }

    await client.query("UPDATE battle_matches SET current_phase = 'cooldown', cooldown_starts_at = $2, cooldown_ends_at = $3 WHERE id = $1", [
      matchId,
      new Date().toISOString(),
      cooldownUntil.toISOString(),
    ]);

    await client.query("COMMIT");
    return NextResponse.json({
      correct: true,
      newScore,
      message: "Correct!",
      cooldownSeconds: ROUND_COOLDOWN_SECONDS,
      cooldownUntil: cooldownUntil.toISOString(),
      nextRound: {
        roundIndex: nextRoundIndex,
        problemId: nextProblemId,
        startsAt: cooldownUntil.toISOString(),
        endsAt: nextEndsAt.toISOString(),
      },
    });
  } catch (e: any) {
    await client.query("ROLLBACK");
    console.error("[SUBMIT] Error:", e);
    return NextResponse.json({
      error: e?.message ?? "Failed submit",
      ...(process.env.NODE_ENV === "development" && { stack: e?.stack }),
    }, { status: 500 });
  } finally {
    client.release();
  }
}
