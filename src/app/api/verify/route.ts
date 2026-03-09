import { NextResponse } from "next/server";
import { Pool } from "pg";
import nerdamer from "nerdamer";
require("nerdamer/Algebra");
require("nerdamer/Calculus");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// --- ANTI-CHEAT VALIDATOR ---
function isValidInput(input: string): boolean {
  if (!input) return false;
  const lower = input.toLowerCase();
  
  // Banned commands that act as solvers
  const bannedKeywords = [
    "int", "integrate", "defint", 
    "diff", "d", "derivative",
    "solve", "roots", 
    "limit", "lim",
    "sum", "product",
    "nerdamer"
  ];

  // Regex looks for whole words to avoid banning "sin" inside "using"
  const regex = new RegExp(`\\b(${bannedKeywords.join("|")})\\b`, "i");
  return !regex.test(lower);
}

// --- ROBUST EQUALITY CHECKER (Hybrid Relative/Absolute) ---
function areExpressionsEqual(userInput: string, expected: string): boolean {
  try {
    // 1. Symbolic Check (Fastest & Most Accurate)
    const diff = nerdamer(`(${userInput}) - (${expected})`).simplify().toString();
    if (diff === "0") return true;

    // 2. Numerical Fallback (Heavy Duty)
    // We use 10 test points ranging from -10 to +10
    const testPoints: number[] = [];
    for (let i = 0; i < 10; i++) {
        // Generate random number between -10 and 10
        let val = (Math.random() * 20) - 10; 
        // Avoid singularities near zero (like 1/x)
        if (Math.abs(val) < 0.1) val += 0.5; 
        testPoints.push(val);
    }

    const TOLERANCE = 0.001; // 0.1% error allowed

    for (const xVal of testPoints) {
      try {
        const uVal = Number(nerdamer(userInput).evaluate({ x: xVal }).text('decimals'));
        const eVal = Number(nerdamer(expected).evaluate({ x: xVal }).text('decimals'));

        // If evaluation fails (NaN/Infinity), skip this point (might be outside domain)
        if (!isFinite(uVal) || !isFinite(eVal)) continue;

        const absDiff = Math.abs(uVal - eVal);
        const magnitude = Math.max(Math.abs(uVal), Math.abs(eVal));

        // HYBRID ERROR CHECK:
        if (magnitude < 1.0) {
            // A. Small numbers: Absolute Error
            if (absDiff > TOLERANCE) return false;
        } else {
            // B. Large numbers: Relative Error
            if ((absDiff / magnitude) > TOLERANCE) return false;
        }

      } catch (e) {
        // Domain error (e.g. sqrt(-1)), skip this point
        continue;
      }
    }

    // If we survived the loop without returning false, it is correct.
    return true;

  } catch (e) {
    return false;
  }
}

export async function POST(req: Request) {
  try {
    const { problemId, userInput } = await req.json();

    if (!problemId || !userInput) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }

    // 1. Anti-Cheat Check
    if (!isValidInput(userInput)) {
       return NextResponse.json({ error: "Illegal Command" }, { status: 400 });
    }

    const client = await pool.connect();
    
    // 2. Fetch Real Answer
    const res = await client.query(
      "SELECT problem_answer_computed FROM integration_problems WHERE id = $1", 
      [problemId]
    );
    client.release();

    if (res.rows.length === 0) {
      return NextResponse.json({ error: "Problem not found" }, { status: 404 });
    }

    const expected = res.rows[0].problem_answer_computed;

    // 3. Verify Equality
    const isCorrect = areExpressionsEqual(userInput, expected);

    return NextResponse.json({ isCorrect });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}