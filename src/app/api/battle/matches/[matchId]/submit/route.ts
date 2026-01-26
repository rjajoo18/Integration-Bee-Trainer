import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { answersEquivalent } from "@/lib/battle/answer";

export const runtime = "nodejs";

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
      SELECT m.id, m.room_id, m.status
      FROM battle_matches m
      WHERE m.id=$1
      FOR UPDATE
      `,
      [matchId]
    );
    if (matchRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    const m = matchRes.rows[0] as { room_id: string; status: string };
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

    const round = roundRes.rows[0] as { problem_id: string; ends_at: string };
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

    const probRes = await client.query(
      `SELECT problem_answer_latex FROM integration_problems WHERE id=$1`,
      [problemId]
    );
    if (probRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Problem not found" }, { status: 404 });
    }

    const canonical = String(probRes.rows[0].canonical_answer);
    const correct = answersEquivalent(answer, canonical);

    if (!correct) {
      // Update attempts for incorrect answer
      await client.query(
        `
        INSERT INTO battle_problem_results (user_id, problem_id, match_id, room_id, is_correct, attempts)
        VALUES ($1, $2, $3, $4, false, 1)
        ON CONFLICT (user_id, problem_id)
        DO UPDATE SET attempts = battle_problem_results.attempts + 1
        `,
        [userId, problemId, matchId, m.room_id]
      );

      await client.query("COMMIT");
      return NextResponse.json({ correct: false, message: "Incorrect" });
    }

    const newScore = Number(playerRes.rows[0].score) + 1;

    await client.query(
      `
      UPDATE battle_match_players
      SET score=$3, last_submit_at=now()
      WHERE match_id=$1 AND user_id=$2
      `,
      [matchId, userId, newScore]
    );

    // Record correct answer in battle_problem_results
    await client.query(
      `
      INSERT INTO battle_problem_results (user_id, problem_id, match_id, room_id, is_correct, attempts)
      VALUES ($1, $2, $3, $4, true, 1)
      ON CONFLICT (user_id, problem_id)
      DO UPDATE SET 
        is_correct = true,
        solved_at = now(),
        attempts = battle_problem_results.attempts + 1
      `,
      [userId, problemId, matchId, m.room_id]
    );

    if (newScore >= 3) {
      await client.query(
        `UPDATE battle_matches SET status='finished', winner_user_id=$2, ended_at=now() WHERE id=$1`,
        [matchId, userId]
      );
      await client.query(`UPDATE battle_rooms SET status='finished' WHERE id=$1`, [m.room_id]);
      await client.query("COMMIT");
      return NextResponse.json({ correct: true, newScore, winnerUserId: userId, matchEnded: true });
    }

    await client.query("COMMIT");
    return NextResponse.json({ correct: true, newScore, message: "Correct!" });
  } catch (e: any) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: e?.message ?? "Failed submit" }, { status: 500 });
  } finally {
    client.release();
  }
}