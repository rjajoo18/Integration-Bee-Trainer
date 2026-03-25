export type FormattingRule = {
  title: string;
  summary: string;
  good: string[];
  bad?: string[];
};

export const answerFormattingRules: FormattingRule[] = [
  {
    title: "Use Nerdamer syntax, not LaTeX",
    summary: "Type plain expressions like `sqrt(x^2+1)` or `pi/2`, not LaTeX like `\\sqrt{x^2+1}` or `\\frac{\\pi}{2}`.",
    good: ["sqrt(x^2+1)", "(x^2+1)^(1/2)", "pi/2"],
    bad: ["\\sqrt{x^2+1}", "\\frac{\\pi}{2}"],
  },
  {
    title: "Use `log(...)` for natural log",
    summary: "Nerdamer expects `log(x)` for ln(x).",
    good: ["log(x)", "x*log(x)-x"],
    bad: ["ln(x)"],
  },
  {
    title: "Use supported function names",
    summary: "Write inverse trig with short names and roots with `sqrt(...)`.",
    good: ["asin(x)", "atan(x)", "sqrt(1-x^2)"],
    bad: ["arcsin(x)", "tan^-1(x)"],
  },
  {
    title: "Make multiplication explicit",
    summary: "Prefer `2*x`, `x*(x+1)`, and `e^(3*x)` when there is any ambiguity.",
    good: ["2*x", "x*(x+1)", "e^(3*x)"],
    bad: ["2x", "x(x+1)"],
  },
  {
    title: "Do not add `+C`",
    summary: "Submit only the expression being graded, not an arbitrary constant of integration.",
    good: ["x^2/2", "sin(x)", "atan(x)"],
    bad: ["x^2/2 + C"],
  },
  {
    title: "Constants and variables",
    summary: "Use `pi`, `e`, and standard variables such as `x`.",
    good: ["pi", "e", "1/(1+x^2)"],
  },
];
