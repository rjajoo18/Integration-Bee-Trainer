import { NextResponse } from "next/server";
import { Pool } from "pg";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export const runtime = "nodejs";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  /*if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }*/

  const { searchParams } = new URL(req.url);
  const difficultyParam = searchParams.get("difficulty"); // "all" | "0".."5" | null

  // Build WHERE clause safely
  const values: any[] = [];
  let whereClause = "";

  if (difficultyParam && difficultyParam !== "all") {
    const d = Number(difficultyParam);
    if (Number.isInteger(d) && d >= 0 && d <= 5) {
      values.push(d);
      whereClause = `WHERE difficulty = $1`;
    }
  }

  try {
    const result = await pool.query(
      `
      SELECT 
        id, 
        problem_text, 
        problem_answer_latex, 
        problem_answer_computed, 
        source,
        difficulty
      FROM integration_problems
      ${whereClause}
      ORDER BY id ASC
    `,
      values
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("DB Error (integrals):", error);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
}
