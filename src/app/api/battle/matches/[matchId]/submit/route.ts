import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { answersEquivalent } from "@/lib/battle/answer";

export const runtime = "nodejs";

const COOLDOWN_SECONDS = 5;

export async function POST(req: Request, ctx: { params: Promise<{ matchId: string }> }) {
  let userId: number;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { matchId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const problemId = String(body.problemId ?? "");
  const answer = String(body.answerLatex ?? "").trim();

  if (!problemId) return NextResponse.json({ error: "Missing problemId" }, { status: 400 });
  if (!answer) return NextResponse.json({ error: "Empty answer" }, { status: 400 });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const matchRes = await client.query(
      `
      SELECT m.id, m.room_id, m.status,
             r.difficulty, r.seconds_per_problem
      FROM battle_matches m
      JOIN battle_rooms r ON r.id = m.room_id
      WHERE m.id=$1
      FOR UPDATE
      `,
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
      `
      SELECT user_id, score
      FROM battle_match_players
      WHERE match_id=$1 AND user_id=$2
      FOR UPDATE
      `,
      [matchId, userId]
    );
    if (playerRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Not a participant" }, { status: 403 });
    }

    // Current round
    const roundRes = await client.query(
      `
      SELECT round_index, problem_id, ends_at
      FROM battle_match_rounds
      WHERE match_id=$1
      ORDER BY round_index DESC
      LIMIT 1
      `,
      [matchId]
    );
    if (roundRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "No active problem yet" }, { status: 400 });
    }

    const round = roundRes.rows[0] as { round_index: number; problem_id: string; ends_at: string };

    if (String(round.problem_id) !== String(problemId)) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Not the current problem" }, { status: 400 });
    }

    const now = new Date();
    const endsAt = new Date(round.ends_at);
    if (now > endsAt) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Time is up" }, { status: 400 });
    }

    // FIX: select as canonical_answer so code below is consistent
    const probRes = await client.query(
      `SELECT problem_answer_latex AS canonical_answer FROM integration_problems WHERE id=$1`,
      [problemId]
    );
    if (probRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Problem not found" }, { status: 404 });
    }

    const canonical = String(probRes.rows[0].canonical_answer ?? "");
    const correct = answersEquivalent(answer, canonical);

    // Record attempt (wrong or right)
    if (!correct) {
      await client.query(
        `
        INSERT INTO battle_problem_results (user_id, problem_id, match_id, room_id, is_correct, attempts)
        VALUES ($1, $2, $3, $4, false, 1)
        ON CONFLICT (match_id, user_id, problem_id)
        DO UPDATE SET
          attempts = battle_problem_results.attempts + 1,
          updated_at = now()
        `,
        [userId, problemId, matchId, m.room_id]
      );

      await client.query("COMMIT");
      return NextResponse.json({ correct: false, message: "Incorrect" });
    }

    // Correct: bump score
    const newScore = Number(playerRes.rows[0].score) + 1;

    await client.query(
      `
      UPDATE battle_match_players
      SET score=$3, last_submit_at=now()
      WHERE match_id=$1 AND user_id=$2
      `,
      [matchId, userId, newScore]
    );

    // Mark solved / attempts
    await client.query(
      `
      INSERT INTO battle_problem_results (user_id, problem_id, match_id, room_id, is_correct, attempts, solved_at)
      VALUES ($1, $2, $3, $4, true, 1, now())
      ON CONFLICT (match_id, user_id, problem_id)
      DO UPDATE SET
        is_correct = true,
        solved_at = COALESCE(battle_problem_results.solved_at, now()),
        attempts = battle_problem_results.attempts + 1,
        updated_at = now()
      `,
      [userId, problemId, matchId, m.room_id]
    );

    // End match?
    if (newScore >= 3) {
      await client.query(
        `UPDATE battle_matches SET status='finished', winner_user_id=$2, ended_at=now() WHERE id=$1`,
        [matchId, userId]
      );
      await client.query(`UPDATE battle_rooms SET status='finished' WHERE id=$1`, [m.room_id]);

      await client.query("COMMIT");
      return NextResponse.json({ correct: true, newScore, winnerUserId: userId, matchEnded: true });
    }

    // Schedule next round after cooldown (only once)
    const cooldownUntil = new Date(Date.now() + COOLDOWN_SECONDS * 1000);
    const nextStartsAt = cooldownUntil;
    const nextEndsAt = new Date(nextStartsAt.getTime() + Number(m.seconds_per_problem) * 1000);

    // If someone already created the next round (race), don't create again.
    const nextRoundIndex = Number(round.round_index) + 1;

    const existingNext = await client.query(
      `SELECT 1 FROM battle_match_rounds WHERE match_id=$1 AND round_index=$2 LIMIT 1`,
      [matchId, nextRoundIndex]
    );

    let nextProblemId: string | null = null;

    if (existingNext.rows.length === 0) {
      // Pick next problem. (Replace this selection logic with your actual generator.)
      // This example picks a random problem; you probably want to filter by difficulty.
      const nextProbRes = await client.query(
        `
        SELECT id
        FROM integration_problems
        ORDER BY random()
        LIMIT 1
        `
      );
      if (nextProbRes.rows.length > 0) {
        nextProblemId = String(nextProbRes.rows[0].id);

        await client.query(
          `
          INSERT INTO battle_match_rounds (match_id, round_index, problem_id, starts_at, ends_at)
          VALUES ($1, $2, $3, $4, $5)
          `,
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
        problemId: nextProblemId, // may be null if already created by someone else
        startsAt: nextStartsAt.toISOString(),
        endsAt: nextEndsAt.toISOString(),
      },
    });
  } catch (e: any) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: e?.message ?? "Failed submit" }, { status: 500 });
  } finally {
    client.release();
  }
}
