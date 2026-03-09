import nerdamer from "nerdamer";
import "nerdamer/Algebra";
import "nerdamer/Calculus";

function normalize(s: string): string {
  return s.replace(/\s+/g, "").trim();
}

/**
 * Checks whether userExpr and canonicalExpr are mathematically equivalent,
 * using the same hybrid logic as the trainer's /api/verify endpoint:
 *   1. Symbolic: simplify (userExpr) - (canonicalExpr) and check for "0"
 *   2. Numerical fallback: evaluate both at 10 random points and compare
 *
 * IMPORTANT: canonicalExpr must be the `problem_answer_computed` column value
 * (clean algebraic form), NOT `problem_answer_latex` (raw LaTeX). Nerdamer
 * cannot parse LaTeX syntax such as \frac, \ln, \sqrt, etc.
 */
export function answersEquivalent(userExpr: string, canonicalExpr: string): boolean {
  const a = normalize(userExpr);
  const b = normalize(canonicalExpr);
  if (!a || !b) return false;
  if (a === b) return true;

  try {
    // 1. Symbolic check — fastest path
    const diff = (nerdamer(`(${a})-(${b})`) as any).simplify().toString();
    if (diff === "0") return true;
  } catch {
    // Symbolic simplification failed; fall through to numerical check
  }

  // 2. Numerical fallback — 10 random sample points
  const TOLERANCE = 0.001;
  let validPointsTested = 0;

  for (let i = 0; i < 10; i++) {
    let xVal = (Math.random() * 20) - 10;
    if (Math.abs(xVal) < 0.1) xVal += 0.5; // avoid singularities near zero

    try {
      const uVal = Number((nerdamer(a) as any).evaluate({ x: xVal }).text("decimals"));
      const eVal = Number((nerdamer(b) as any).evaluate({ x: xVal }).text("decimals"));

      if (!isFinite(uVal) || !isFinite(eVal)) continue;

      validPointsTested++;
      const absDiff = Math.abs(uVal - eVal);
      const magnitude = Math.max(Math.abs(uVal), Math.abs(eVal));

      // Hybrid error: absolute for small values, relative for large values
      if (magnitude < 1.0) {
        if (absDiff > TOLERANCE) return false;
      } else {
        if (absDiff / magnitude > TOLERANCE) return false;
      }
    } catch {
      continue; // domain error at this point (e.g. sqrt of negative), skip it
    }
  }

  // Need at least 3 valid points to trust the numerical result
  return validPointsTested >= 3;
}
