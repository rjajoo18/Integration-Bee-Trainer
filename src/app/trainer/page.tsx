"use client";

import React, { useState, useEffect, useMemo, Suspense } from "react";
import "katex/dist/katex.min.css";
import { BlockMath } from "react-katex";
import nerdamer from "nerdamer";
import "nerdamer/Algebra";
import "nerdamer/Calculus";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import confetti from "canvas-confetti";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

type Problem = {
  id: string;
  problem_text: string;
  problem_answer_latex: string;
  problem_answer_computed: string;
  source?: string | null;
  difficulty?: number | null;
};

type ProgressMap = Record<string, { solved: boolean; attempts: number }>;

function TrainerContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeId = searchParams.get("id");

  const [problems, setProblems] = useState<Problem[]>([]);
  const [progress, setProgress] = useState<ProgressMap>({});

  const [searchQuery, setSearchQuery] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState<number | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "solved" | "unsolved">("all");

  const [userInput, setUserInput] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [isShaking, setIsShaking] = useState(false);

  // Auth redirect
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth");
    }
  }, [status, router]);

  // --- FETCH DATA ---
  useEffect(() => {
    let mounted = true;

    fetch("/api/integrals")
      .then((res) => res.json())
      .then((data) => {
        if (!mounted) return;
        if (Array.isArray(data)) setProblems(data);
        setLoading(false);
      });

    if (status === "authenticated") {
      fetch("/api/progress")
        .then((res) => res.json())
        .then((data) => {
          if (mounted && data && !data.error) {
            setProgress(data);
          }
        })
        .catch(console.error);
    }

    return () => { mounted = false; };
  }, [status]);

  const activeProblem = useMemo(() =>
    problems.find((p) => p.id === activeId),
  [problems, activeId]);

  useEffect(() => {
    setUserInput("");
    setFeedback(null);
    setIsShaking(false);
  }, [activeId]);

  const filteredProblems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return problems.filter((p) => {
      const matchesSearch = p.id.toLowerCase().includes(q);
      const d = typeof p.difficulty === "number" ? p.difficulty : 0;
      const matchesDifficulty = difficultyFilter === "all" ? true : d === difficultyFilter;

      const isSolved = !!progress[p.id]?.solved;
      let matchesStatus = true;
      if (statusFilter === "solved") matchesStatus = isSolved;
      if (statusFilter === "unsolved") matchesStatus = !isSolved;

      return matchesSearch && matchesDifficulty && matchesStatus;
    });
  }, [problems, searchQuery, difficultyFilter, statusFilter, progress]);

  // --- ACTIONS ---
  const triggerConfetti = () => {
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
  };

  const triggerShake = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 500);
  };

  const checkAnswer = async () => {
    if (!activeProblem || !userInput) return;

    let isCorrect = false;
    try {
      const expected = activeProblem.problem_answer_computed;
      const expr = nerdamer(`(${userInput}) - (${expected})`);
      const diff = (expr as any).simplify().toString();
      if (diff === "0") {
        setFeedback({ type: "success", msg: "Correct!" });
        isCorrect = true;
        triggerConfetti();
      } else {
        setFeedback({ type: "error", msg: "Incorrect." });
        triggerShake();
      }
    } catch {
      setFeedback({ type: "error", msg: "Syntax Error" });
      triggerShake();
      return;
    }

    if (session) {
      setProgress((prev) => {
        const cur = prev[activeProblem.id] || { solved: false, attempts: 0 };
        return {
          ...prev,
          [activeProblem.id]: {
            solved: cur.solved || isCorrect,
            attempts: cur.attempts + 1,
          },
        };
      });

      await fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problemId: activeProblem.id, isCorrect }),
      });
    }
  };

  const navigateToProblem = (id: string) => router.push(`/trainer?id=${id}`);
  const navigateToDashboard = () => router.push(`/trainer`);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-[#080c14] text-white flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (status === "unauthenticated") return null;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080c14] text-white flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  // === VIEW 1: PROBLEM PAGE ===
  if (activeProblem) {
    const isSolved = progress[activeProblem.id]?.solved;
    const attempts = progress[activeProblem.id]?.attempts || 0;

    return (
      <div className="min-h-screen bg-[#080c14] text-zinc-300 flex flex-col pt-16">
        <nav className="px-6 py-3 flex justify-between items-center border-b border-white/[0.05]">
          <button
            onClick={navigateToDashboard}
            className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors text-sm font-medium"
          >
            <ArrowLeft size={15} />
            Back to Problems
          </button>

          <Link href="/formatting" className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors">
            Answer Format
          </Link>
        </nav>

        <main className="flex-1 max-w-4xl mx-auto w-full px-6 flex flex-col justify-center pb-16">
          <div className="space-y-8">
            <div className={`p-8 sm:p-10 rounded-2xl border ${
              isSolved ? "bg-emerald-950/20 border-emerald-500/20" : "bg-white/[0.025] border-white/[0.07]"
            }`}>
              <div className="flex flex-col items-center gap-5">
                <div className="flex gap-2">
                  <span className="px-3 py-1 rounded-lg bg-white/[0.05] border border-white/[0.08] text-zinc-400 text-xs font-mono font-bold">
                    {activeProblem.id}
                  </span>
                  {attempts > 0 && (
                    <span className={`px-3 py-1 rounded-lg border text-xs font-bold ${
                      isSolved
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                        : "bg-red-500/10 border-red-500/20 text-red-400"
                    }`}>
                      {isSolved ? "Solved" : `${attempts} attempt${attempts !== 1 ? "s" : ""}`}
                    </span>
                  )}
                </div>
                <div className="text-white w-full overflow-x-auto text-center" style={{ fontSize: "clamp(1.75rem, 5vw, 3.5rem)" }}>
                  <BlockMath math={activeProblem.problem_text} />
                </div>
              </div>
            </div>

            <div className="max-w-2xl mx-auto space-y-3">
              <div className={`relative ${isShaking ? "animate-shake" : ""}`}>
                <input
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && checkAnswer()}
                  placeholder={isSolved ? "Solved!" : "Enter your answer..."}
                  className={`w-full border px-5 py-4 rounded-xl text-base font-mono text-white bg-white/[0.04] focus:outline-none transition-all pr-28 ${
                    isShaking
                      ? "border-red-500"
                      : isSolved
                        ? "border-emerald-500/40"
                        : "border-white/[0.08] focus:border-indigo-500/50"
                  }`}
                />
                <button
                  onClick={checkAnswer}
                  className="absolute right-2 top-2 bottom-2 px-5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition-all active:scale-95"
                >
                  {isSolved ? "Check" : "Submit"}
                </button>
              </div>
              {feedback && (
                <div className={`px-4 py-3 rounded-xl text-sm font-semibold ${
                  feedback.type === "success"
                    ? "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20"
                    : "text-red-400 bg-red-500/10 border border-red-500/20"
                }`}>
                  {feedback.msg}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    );
  }

  // === VIEW 2: DASHBOARD ===
  return (
    <div className="min-h-screen bg-[#080c14] text-zinc-300 pt-16">

      {/* Sticky header */}
      <div className="sticky top-16 z-40 bg-[#080c14]/95 backdrop-blur-md border-b border-white/[0.05]">
        <div className="max-w-7xl mx-auto px-6 py-4 space-y-3">

          {/* Row 1: Search + formatting link */}
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Search by problem ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-indigo-500/50 outline-none transition-all"
            />
            <Link
              href="/formatting"
              className="hidden md:flex items-center px-5 rounded-xl bg-white/[0.03] border border-white/[0.07] text-zinc-500 hover:text-zinc-200 text-xs font-semibold transition-colors whitespace-nowrap"
            >
              Answer Format
            </Link>
          </div>

          {/* Row 2: Filters */}
          <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">

            {/* Status filter */}
            <div className="flex bg-white/[0.03] p-1 rounded-xl border border-white/[0.05]">
              {(["all", "solved", "unsolved"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-all ${
                    statusFilter === s
                      ? "bg-indigo-600 text-white"
                      : "text-zinc-600 hover:text-zinc-300"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            <div className="hidden md:block w-px h-6 bg-white/[0.07]" />

            {/* Difficulty filter */}
            <div className="flex-1 overflow-x-auto no-scrollbar w-full">
              <div className="flex gap-2">
                {(["all", 0, 1, 2, 3, 4, 5] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDifficultyFilter(d as any)}
                    className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                      difficultyFilter === d
                        ? "bg-indigo-600 text-white border-indigo-500/50"
                        : "bg-white/[0.03] border-white/[0.06] text-zinc-600 hover:text-zinc-300 hover:border-white/[0.12]"
                    }`}
                  >
                    {d === "all" ? "All" : d === 0 ? "Unrated" : `Level ${d}`}
                  </button>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-6">
        <div className="text-[10px] font-black uppercase tracking-widest text-zinc-700 mb-4">
          {filteredProblems.length} {filteredProblems.length === 1 ? "Problem" : "Problems"}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {filteredProblems.map((p) => {
            const pStats = progress[p.id];
            const isSolved = pStats?.solved;
            const attempts = pStats?.attempts || 0;
            const isWrong = !isSolved && attempts > 0;

            let cardStyle = "bg-white/[0.025] border-white/[0.06] hover:border-indigo-500/25 hover:bg-white/[0.04]";
            if (isSolved) {
              cardStyle = "bg-emerald-950/20 border-emerald-500/20 hover:border-emerald-500/35";
            } else if (isWrong) {
              cardStyle = "bg-red-950/15 border-red-500/20 hover:border-red-500/35";
            }

            return (
              <button
                key={p.id}
                onClick={() => navigateToProblem(p.id)}
                className={`group p-5 rounded-2xl border text-left transition-all hover:-translate-y-0.5 ${cardStyle}`}
              >
                <div className="flex justify-between items-start mb-5">
                  <span className={`font-mono text-xs font-bold ${
                    isSolved ? "text-emerald-400" : isWrong ? "text-red-400" : "text-zinc-600"
                  }`}>
                    {p.id}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${
                    isSolved ? "bg-emerald-500" : isWrong ? "bg-red-500" : "bg-zinc-700"
                  }`} />
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${
                    isSolved ? "text-emerald-400" : isWrong ? "text-red-400" : "text-zinc-600"
                  }`}>
                    {isSolved ? "Solved" : isWrong ? `${attempts} attempt${attempts !== 1 ? "s" : ""}` : "Start"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </main>

      <style jsx global>{`
        @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
        .animate-shake { animation: shake 0.4s cubic-bezier(.36,.07,.19,.97) both; }
        .katex-display { margin: 0 !important; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}

export default function IntegralTrainer() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#080c14] flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
      </div>
    }>
      <TrainerContent />
    </Suspense>
  );
}
