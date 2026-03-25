import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { pool } from "@/lib/db";
import { answersEquivalent, validateAnswerInput } from "@/lib/battle/answer";

export async function POST(req: Request) {
  try {
    await requireUserId();

    const { problemId, userInput } = await req.json();
    if (!problemId || !userInput) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }

    const validationError = validateAnswerInput(String(userInput));
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const res = await pool.query(
      "SELECT problem_answer_computed FROM integration_problems WHERE id = $1",
      [problemId]
    );

    if (res.rows.length === 0) {
      return NextResponse.json({ error: "Problem not found" }, { status: 404 });
    }

    const expected = String(res.rows[0].problem_answer_computed ?? "");
    return NextResponse.json({ isCorrect: answersEquivalent(String(userInput), expected) });
  } catch (error: any) {
    if (error?.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[VERIFY] Error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
