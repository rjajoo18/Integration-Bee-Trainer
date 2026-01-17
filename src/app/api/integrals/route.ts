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
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await pool.query(`
      SELECT 
        id, 
        problem_text, 
        problem_answer_latex, 
        problem_answer_computed, 
        source
      FROM integration_problems
      ORDER BY id ASC
    `);

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("DB Error (integrals):", error);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
}
