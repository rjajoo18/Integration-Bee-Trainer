import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const runtime = "nodejs";

// Intentionally public: the trainer and battle lobby both need the problem list
// without auth. problem_answer_computed is intentionally excluded; answer
// checking is handled server-side by /api/verify and /api/battle/matches.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const difficultyParam = searchParams.get("difficulty");

  let difficulty: number | null = null;
  if (difficultyParam && difficultyParam !== "all") {
    const d = Number(difficultyParam);
    if (Number.isInteger(d) && d >= 0 && d <= 5) difficulty = d;
  }

  try {
    const result = await pool.query(
      `SELECT id, problem_text, problem_answer_latex, source, difficulty
       FROM integration_problems
       WHERE ($1::int IS NULL OR difficulty = $1)
       ORDER BY id ASC`,
      [difficulty],
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("DB Error (integrals):", error);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
}
