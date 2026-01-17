import { NextResponse } from "next/server";
import { Pool } from "pg";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export const runtime = "nodejs";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as any).id;

  try {
    const result = await pool.query(
      "SELECT problem_id, is_solved, attempts FROM user_progress WHERE user_id = $1",
      [userId]
    );

    const progressMap: Record<string, { solved: boolean; attempts: number }> = {};
    for (const row of result.rows) {
      progressMap[String(row.problem_id)] = {
        solved: row.is_solved,
        attempts: row.attempts,
      };
    }

    return NextResponse.json(progressMap);
  } catch (error) {
    console.error("DB Error (progress GET):", error);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as any).id;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { problemId, isCorrect } = body;
  if (problemId == null || typeof isCorrect !== "boolean") {
    return NextResponse.json(
      { error: "Expected { problemId, isCorrect }" },
      { status: 400 }
    );
  }

  const query = `
    INSERT INTO user_progress (user_id, problem_id, is_solved, attempts, last_updated)
    VALUES ($1, $2, $3, 1, NOW())
    ON CONFLICT (user_id, problem_id)
    DO UPDATE SET
      is_solved = GREATEST(user_progress.is_solved, EXCLUDED.is_solved),
      attempts = user_progress.attempts + 1,
      last_updated = NOW();
  `;

  try {
    await pool.query(query, [userId, problemId, isCorrect]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DB Error (progress POST):", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
