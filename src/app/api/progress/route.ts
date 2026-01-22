import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { pool } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({});

  try {
    // 1. Get User ID
    const userRes = await pool.query("SELECT id FROM users WHERE email = $1", [
      session.user.email,
    ]);
    
    if (userRes.rows.length === 0) return NextResponse.json({});
    const userId = userRes.rows[0].id;

    // 2. Fetch Progress (FIXED: Changed table to 'user_progress')
    const result = await pool.query(
      "SELECT problem_id, is_solved, attempts FROM user_progress WHERE user_id = $1",
      [userId]
    );

    const progressMap: Record<string, { solved: boolean; attempts: number }> = {};
    result.rows.forEach((row) => {
      progressMap[row.problem_id] = {
        solved: row.is_solved,
        attempts: row.attempts,
      };
    });

    return NextResponse.json(progressMap);
  } catch (error) {
    console.error("Progress GET Error:", error);
    return NextResponse.json({ error: "Failed to load progress" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { problemId, isCorrect } = await req.json();
    console.log(`Saving progress for ${session.user.email}: Problem ${problemId}, Correct: ${isCorrect}`);

    // 1. Get User ID
    const userRes = await pool.query("SELECT id FROM users WHERE email = $1", [
      session.user.email,
    ]);
    
    if (userRes.rows.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const userId = userRes.rows[0].id;

    // 2. Upsert Progress (FIXED: Changed table to 'user_progress')
    const existing = await pool.query(
      "SELECT id, is_solved, attempts FROM user_progress WHERE user_id = $1 AND problem_id = $2",
      [userId, problemId]
    );

    if (existing.rows.length > 0) {
      // UPDATE
      const row = existing.rows[0];
      const newSolved = row.is_solved || isCorrect;
      const newAttempts = row.attempts + 1;

      await pool.query(
        `UPDATE user_progress 
         SET is_solved = $1, attempts = $2, last_updated = NOW() 
         WHERE id = $3`,
        [newSolved, newAttempts, row.id]
      );
    } else {
      // INSERT
      await pool.query(
        `INSERT INTO user_progress (user_id, problem_id, is_solved, attempts, last_updated)
         VALUES ($1, $2, $3, 1, NOW())`,
        [userId, problemId, isCorrect]
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Progress POST Error:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}