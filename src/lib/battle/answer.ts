import nerdamer from "nerdamer";
import "nerdamer/Algebra";
import "nerdamer/Calculus";

export const MAX_ANSWER_LENGTH = 180;
const MAX_OPERATOR_COUNT = 40;
const MAX_IDENTIFIER_COUNT = 24;
const MAX_PAREN_DEPTH = 12;
const ALLOWED_CHARS_RE = /^[0-9a-zA-Z_+\-*/^().,\s]+$/;

const ALLOWED_IDENTIFIERS = new Set([
  "x",
  "e",
  "pi",
  "sqrt",
  "abs",
  "sin",
  "cos",
  "tan",
  "sec",
  "csc",
  "cot",
  "asin",
  "acos",
  "atan",
  "asec",
  "acsc",
  "acot",
  "sinh",
  "cosh",
  "tanh",
  "sech",
  "csch",
  "coth",
  "asinh",
  "acosh",
  "atanh",
  "log",
  "exp",
]);

function normalize(s: string): string {
  return s.replace(/\s+/g, "").trim();
}

function hasBalancedParentheses(input: string): boolean {
  let depth = 0;
  for (const ch of input) {
    if (ch === "(") {
      depth++;
      if (depth > MAX_PAREN_DEPTH) return false;
    } else if (ch === ")") {
      depth--;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
}

function hasReasonableOperatorCount(input: string): boolean {
  const operators = input.match(/[+\-*/^]/g);
  return (operators?.length ?? 0) <= MAX_OPERATOR_COUNT;
}

function hasOnlyAllowedIdentifiers(input: string): boolean {
  const identifiers = input.match(/[A-Za-z_]+/g) ?? [];
  if (identifiers.length > MAX_IDENTIFIER_COUNT) return false;
  return identifiers.every((token) => ALLOWED_IDENTIFIERS.has(token.toLowerCase()));
}

export function validateAnswerInput(input: string): string | null {
  const trimmed = String(input ?? "").trim();
  if (!trimmed) return "Answer cannot be empty.";
  if (trimmed.length > MAX_ANSWER_LENGTH) {
    return `Answer is too long. Keep it under ${MAX_ANSWER_LENGTH} characters.`;
  }
  if (!ALLOWED_CHARS_RE.test(trimmed)) {
    return "Answer contains unsupported characters.";
  }

  const lower = trimmed.toLowerCase();
  const bannedKeywords = [
    "int", "integrate", "defint",
    "diff", "derivative",
    "solve", "roots",
    "limit", "lim",
    "sum", "product",
    "nerdamer",
  ];
  const bannedPattern = new RegExp(`\\b(${bannedKeywords.join("|")})\\b`, "i");
  if (bannedPattern.test(lower)) {
    return "Solver commands are not allowed in answers.";
  }

  if (!hasBalancedParentheses(trimmed)) {
    return "Invalid syntax: check parentheses and nesting.";
  }
  if (!hasReasonableOperatorCount(trimmed)) {
    return "Answer is too complex to verify safely.";
  }
  if (!hasOnlyAllowedIdentifiers(trimmed)) {
    return "Answer uses unsupported variables or function names.";
  }
  if (/[/*^+\-,.]{3,}/.test(trimmed) || /\^\^/.test(trimmed)) {
    return "Invalid syntax.";
  }

  try {
    const parsed = nerdamer(normalize(trimmed)) as any;
    const parsedText = String(parsed.toString?.() ?? "");
    if (!parsedText) {
      return "Invalid syntax.";
    }
    if (parsedText.length > MAX_ANSWER_LENGTH * 2) {
      return "Answer is too complex to verify safely.";
    }
  } catch {
    return "Invalid syntax.";
  }

  return null;
}

/**
 * Checks whether userExpr and canonicalExpr are mathematically equivalent.
 * 1. Symbolic simplification of (userExpr - canonicalExpr)
 * 2. Numeric fallback at random sample points
 */
export function answersEquivalent(userExpr: string, canonicalExpr: string): boolean {
  const a = normalize(userExpr);
  const b = normalize(canonicalExpr);
  if (!a || !b) return false;
  if (a === b) return true;

  try {
    const diff = (nerdamer(`(${a})-(${b})`) as any).simplify().toString();
    if (diff === "0") return true;
  } catch {
    // Fall through to numeric checks.
  }

  const tolerance = 0.001;
  let validPointsTested = 0;

  for (let i = 0; i < 10; i++) {
    let xVal = (Math.random() * 20) - 10;
    if (Math.abs(xVal) < 0.1) xVal += 0.5;

    try {
      const uVal = Number((nerdamer(a) as any).evaluate({ x: xVal }).text("decimals"));
      const eVal = Number((nerdamer(b) as any).evaluate({ x: xVal }).text("decimals"));

      if (!isFinite(uVal) || !isFinite(eVal)) continue;

      validPointsTested++;
      const absDiff = Math.abs(uVal - eVal);
      const magnitude = Math.max(Math.abs(uVal), Math.abs(eVal));

      if (magnitude < 1.0) {
        if (absDiff > tolerance) return false;
      } else if (absDiff / magnitude > tolerance) {
        return false;
      }
    } catch {
      continue;
    }
  }

  return validPointsTested >= 3;
}
