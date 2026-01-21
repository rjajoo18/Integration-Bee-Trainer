"use client";

import React, { useState, useEffect, useMemo } from "react";
import "katex/dist/katex.min.css";
import { BlockMath, InlineMath } from "react-katex";
import nerdamer from "nerdamer";
import "nerdamer/Algebra";
import "nerdamer/Calculus";
import { useSession } from "next-auth/react";

type Problem = {
  id: string; // text
  problem_text: string;
  problem_answer_latex: string;
  problem_answer_computed: string;
  source?: string | null;
  difficulty?: number | null; // 0..5, 0 = unrated
};

type ProgressMap = Record<string, { solved: boolean; attempts: number }>;

export default function IntegralTrainer() {
  const { data: session } = useSession();

  // --- STATE MANAGEMENT ---
  const [problems, setProblems] = useState<Problem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState<number | "all">("all");

  // NOTE: currentIdx indexes into `problems` (master list), not filtered list
  const [currentIdx, setCurrentIdx] = useState(0);

  const [userInput, setUserInput] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [loading, setLoading] = useState(true);

  // Progress State
  const [progress, setProgress] = useState<ProgressMap>({});

  // --- INITIAL DATA FETCHING ---
  useEffect(() => {
    let mounted = true;

    fetch("/api/integrals")
      .then((res) => res.json())
      .then((data) => {
        if (!mounted) return;
        if (Array.isArray(data)) setProblems(data);
        setLoading(false);
      })
      .catch(() => {
        if (!mounted) return;
        setLoading(false);
      });

    if (session) {
      fetch("/api/progress")
        .then((res) => res.json())
        .then((data) => {
          if (!mounted) return;
          setProgress(data || {});
        })
        .catch((err) => console.error("Failed to load progress:", err));
    }

    return () => {
      mounted = false;
    };
  }, [session]);

  // --- FILTERING ---
  const filteredProblems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return problems.filter((p) => {
      const matchesSearch = p.id.toLowerCase().includes(q);

      const d = typeof p.difficulty === "number" ? p.difficulty : 0; // treat missing as unrated
      const matchesDifficulty = difficultyFilter === "all" ? true : d === difficultyFilter;

      return matchesSearch && matchesDifficulty;
    });
  }, [problems, searchQuery, difficultyFilter]);

  const activeProblem = problems[currentIdx];

  // Keep selection valid when filters change
  useEffect(() => {
    if (filteredProblems.length === 0) return;

    const active = problems[currentIdx];
    const activeStillVisible =
      !!active && filteredProblems.some((p) => p.id === active.id);

    if (!activeStillVisible) {
      const firstVisibleId = filteredProblems[0].id;
      const newIndex = problems.findIndex((p) => p.id === firstVisibleId);
      if (newIndex !== -1) {
        setCurrentIdx(newIndex);
        setFeedback(null);
        setUserInput("");
      }
    }
  }, [filteredProblems, problems, currentIdx]);

  // --- ANSWER CHECKING LOGIC ---
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
      } else {
        setFeedback({ type: "error", msg: "Incorrect. Try again!" });
      }
    } catch (e) {
      setFeedback({ type: "error", msg: "Syntax Error. Use ^ for powers." });
      return;
    }

    if (session) {
      // Optimistic UI update
      setProgress((prev) => {
        const currentStats = prev[activeProblem.id] || { solved: false, attempts: 0 };
        return {
          ...prev,
          [activeProblem.id]: {
            solved: currentStats.solved || isCorrect,
            attempts: currentStats.attempts + 1,
          },
        };
      });

      try {
        await fetch("/api/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            problemId: activeProblem.id,
            isCorrect,
          }),
        });
      } catch (err) {
        console.error("Failed to save progress", err);
      }
    }
  };

  if (loading)
    return (
      <div className="h-screen bg-[#0d1117] text-white flex items-center justify-center font-mono animate-pulse">
        Loading Trainer...
      </div>
    );

  return (
    <div className="flex h-screen bg-[#0d1117] text-gray-200 font-sans pt-16">
      {/* --- SIDEBAR --- */}
      <aside className="w-80 border-r border-gray-800 flex flex-col bg-[#161b22] h-full">
        <div className="p-6 space-y-4 border-b border-gray-800">
          <h1 className="text-xl font-bold text-white tracking-tight">Problem Set</h1>

          <div className="relative">
            <input
              type="text"
              placeholder="Search ID (e.g. 2010-Q01)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#0d1117] border border-gray-700 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-300 placeholder-gray-500 transition-all"
            />
          </div>

          {/* Difficulty Filter */}
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">
              Difficulty
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setDifficultyFilter("all")}
                className={`px-3 py-1 rounded-full text-[11px] font-bold border transition-all
                  ${
                    difficultyFilter === "all"
                      ? "bg-blue-600/20 border-blue-500 text-blue-300"
                      : "bg-transparent border-gray-700 text-gray-400 hover:bg-gray-800"
                  }`}
              >
                All
              </button>

              <button
                onClick={() => setDifficultyFilter(0)}
                className={`px-3 py-1 rounded-full text-[11px] font-bold border transition-all
                  ${
                    difficultyFilter === 0
                      ? "bg-blue-600/20 border-blue-500 text-blue-300"
                      : "bg-transparent border-gray-700 text-gray-400 hover:bg-gray-800"
                  }`}
              >
                Unrated
              </button>
              {[1, 2, 3, 4, 5].map((d) => (
                <button
                  key={d}
                  onClick={() => setDifficultyFilter(d)}
                  className={`px-3 py-1 rounded-full text-[11px] font-bold border transition-all
                    ${
                      difficultyFilter === d
                        ? "bg-blue-600/20 border-blue-500 text-blue-300"
                        : "bg-transparent border-gray-700 text-gray-400 hover:bg-gray-800"
                    }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Count */}
          <div className="text-[11px] text-gray-500">
            Showing <span className="text-gray-300 font-bold">{filteredProblems.length}</span> /{" "}
            <span className="text-gray-300 font-bold">{problems.length}</span>
          </div>
        </div>

        {/* List of Problems */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar pb-24">
          {filteredProblems.length > 0 ? (
            filteredProblems.map((p) => {
              const originalIndex = problems.findIndex((op) => op.id === p.id);
              const pStats = progress[p.id];
              const isSelected = currentIdx === originalIndex;
              const isSolved = pStats?.solved;
              const isAttempted = !isSolved && (pStats?.attempts ?? 0) > 0;

              const d = typeof p.difficulty === "number" ? p.difficulty : 0;

              // Base Style
              let styleClass =
                "bg-transparent border-transparent hover:bg-gray-800 text-gray-400";

              // Status Styles
              if (isSolved) {
                styleClass =
                  "bg-green-900/20 border-green-900/50 text-green-200 hover:bg-green-900/30";
              } else if (isAttempted) {
                styleClass =
                  "bg-red-900/20 border-red-900/50 text-red-200 hover:bg-red-900/30";
              }

              // Selection Styles
              if (isSelected) {
                if (isSolved || isAttempted) {
                  styleClass +=
                    " !border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.3)] ring-1 ring-blue-500/50";
                } else {
                  styleClass =
                    "bg-blue-600/20 border-blue-500 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.2)]";
                }
              }

              return (
                <button
                  key={p.id}
                  onClick={() => {
                    setCurrentIdx(originalIndex);
                    setFeedback(null);
                    setUserInput("");
                  }}
                  className={`w-full text-left px-4 py-3 rounded-xl text-sm font-mono transition-all duration-200 border flex justify-between items-center ${styleClass}`}
                >
                  <div className="min-w-0">
                    <span className="block font-bold truncate">{p.id}</span>

                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] uppercase tracking-tighter ${
                          isSolved || isAttempted ? "opacity-80" : "opacity-50"
                        }`}
                      >
                        {isSolved ? "Solved" : isAttempted ? "Attempted" : "Integration Bee"}
                      </span>

                      {/* Difficulty badge */}
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-gray-900/40 border border-gray-700 text-gray-300">
                        {d === 0 ? "Unrated" : `D${d}`}
                      </span>
                    </div>
                  </div>

                  {/* Minimalist Try Counter for Wrong Answers */}
                  {isAttempted && (
                    <span className="text-[10px] font-bold bg-red-500/20 px-2 py-1 rounded text-red-300">
                      {pStats.attempts}x
                    </span>
                  )}
                </button>
              );
            })
          ) : (
            <div className="text-center py-10 text-gray-500 text-sm italic">
              No problems found.
            </div>
          )}
        </div>
      </aside>

      {/* --- MAIN SOLVING AREA --- */}
      <main className="flex-1 flex flex-col items-center justify-center p-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-gray-900 via-[#0d1117] to-[#0d1117] overflow-y-auto">
        <div className="w-full max-w-2xl bg-[#161b22] p-10 rounded-3xl border border-gray-800 shadow-2xl relative overflow-hidden group mb-10">
          <div className="absolute -top-24 -left-24 w-48 h-48 bg-blue-600/10 rounded-full blur-3xl group-hover:bg-blue-600/20 transition-all duration-500"></div>

          {activeProblem ? (
            <div className="relative z-10">
              <header className="mb-10 text-center">
                <div className="flex items-center justify-center gap-2">
                  <span className="px-3 py-1 bg-blue-500/10 text-blue-400 rounded-full text-[10px] font-bold tracking-widest uppercase border border-blue-500/20">
                    {activeProblem.id}
                  </span>
                  <span className="px-3 py-1 bg-gray-900/40 text-gray-300 rounded-full text-[10px] font-bold tracking-widest uppercase border border-gray-700">
                    {(() => {
                      const d =
                        typeof activeProblem.difficulty === "number"
                          ? activeProblem.difficulty
                          : 0;
                      return d === 0 ? "Unrated" : `Difficulty ${d}`;
                    })()}
                  </span>
                </div>

                <div className="mt-8 text-4xl py-6 flex justify-center">
                  <BlockMath math={activeProblem.problem_text} />
                </div>
              </header>

              <div className="space-y-6">
                <input
                  type="text"
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && checkAnswer()}
                  placeholder="Enter answer (e.g. x^2/2 + C)"
                  className="w-full bg-[#0d1117] border-2 border-gray-800 p-5 rounded-2xl text-xl font-mono focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/5 outline-none transition-all shadow-inner placeholder:text-gray-700 text-white"
                />

                <button
                  onClick={checkAnswer}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white py-5 rounded-2xl font-bold text-xl shadow-[0_10px_20px_rgba(59,130,246,0.3)] transition-all active:scale-[0.97]"
                >
                  Submit
                </button>

                {feedback && (
                  <div
                    className={`p-5 rounded-2xl border-2 animate-in fade-in slide-in-from-bottom-2 duration-300 ${
                      feedback.type === "success"
                        ? "bg-green-500/5 border-green-500/30 text-green-400"
                        : "bg-red-500/5 border-red-500/30 text-red-400"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{feedback.type === "success" ? "✨" : "⚠️"}</span>
                      <p className="font-bold">{feedback.msg}</p>
                    </div>

                    {feedback.type === "success" && (
                      <div className="mt-3 pt-3 border-t border-green-500/10 text-sm">
                        <span className="opacity-60 block mb-1 uppercase text-[10px] font-bold">
                          Standard Form:
                        </span>
                        <InlineMath math={activeProblem.problem_answer_latex} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center text-gray-500">Select a problem to begin</div>
          )}
        </div>
      </main>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #30363d;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #484f58;
        }
      `}</style>
    </div>
  );
}
