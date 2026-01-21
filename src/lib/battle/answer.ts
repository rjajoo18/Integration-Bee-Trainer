import nerdamer from "nerdamer";
import "nerdamer/Algebra";
import "nerdamer/Calculus";

function normalize(s: string) {
  return s.replace(/\s+/g, "").trim();
}

export function answersEquivalent(userExpr: string, canonicalExpr: string): boolean {
  const a = normalize(userExpr);
  const b = normalize(canonicalExpr);
  if (!a || !b) return false;
  if (a === b) return true;

  try {
    const diff = nerdamer(`(${a})-(${b})`).simplify();
    return String(diff) === "0";
  } catch {
    return false;
  }
}
