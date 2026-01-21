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

  // --- STATE ---
  const [problems, setProblems] = useState<Problem[]>([]);
  const [progress, setProgress] = useState<ProgressMap>({});

  const [searchQuery, setSearchQuery] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState<number | "all">("all");

  const [showList, setShowList] = useState(false);

  // currentIdx indexes into `problems` (master list)
  const [currentIdx, setCurrentIdx] = useState<number | null>(null);

  const [userInput, setUserInput] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [loading, setLoading] = useState(true);

  // --- FETCH ---
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

  // --- FILTERED LIST ---
  const filteredProblems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return problems.filter((p) => {
      const matchesSearch = p.id.toLowerCase().includes(q);
      const d = typeof p.difficulty === "number" ? p.difficulty : 0; // treat missing as unrated
      const matchesDifficulty = difficultyFilter === "all" ? true : d === difficultyFilter;
      return matchesSearch && matchesDifficulty;
    });
  }, [problems, searchQuery, difficultyFilter]);

  const activeProblem: Problem | null =
    currentIdx == null ? null : problems[currentIdx] ?? null;

  // If list is open and filters hide the selected problem, snap to first visible
  useEffect(() => {
    if (!showList) return;
    if (filteredProblems.length === 0) return;

    if (currentIdx == null) {
      const firstId = filteredProblems[0].id;
      const idx = problems.findIndex((p) => p.id === firstId);
      if (idx !== -1) setCurrentIdx(idx);
      return;
    }

    const active = problems[currentIdx];
    const stillVisible = !!active && filteredProblems.some((p) => p.id === active.id);
    if (!stillVisible) {
      const firstId = filteredProblems[0].id;
      const idx = problems.findIndex((p) => p.id === firstId);
      if (idx !== -1) {
        setCurrentIdx(idx);
        setFeedback(null);
        setUserInput("");
      }
    }
  }, [showList, filteredProblems, problems, currentIdx]);

  // --- CHECK ANSWER ---
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
    } catch {
      setFeedback({ type: "error", msg: "Syntax Error. Use ^ for powers." });
      return;
    }

    if (session) {
      // optimistic UI
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

      try {
        await fetch("/api/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ problemId: activeProblem.id, isCorrect }),
        });
      } catch (err) {
        console.error("Failed to save progress", err);
      }
    }
  };

  const pillClass = (active: boolean) =>
    `px-3 py-1 rounded-full text-[11px] font-bold border transition-all ${
      active
        ? "bg-blue-600/20 border-blue-500 text-blue-300"
        : "bg-transparent border-gray-700 text-gray-400 hover:bg-gray-800"
    }`;

  if (loading) {
    return (
      <div className="h-screen bg-[#0d1117] text-white flex items-center justify-center font-mono animate-pulse">
        Loading Trainer...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d1117] text-gray-200 font-sans pt-16">
      {/* TOP CONTROL BAR */}
      <div className="sticky top-16 z-40 border-b border-gray-800 bg-[#0d1117]/70 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 py-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="text-white font-bold tracking-tight text-lg whitespace-nowrap">
                Problem Set
              </div>

              <div className="hidden sm:flex text-[11px] text-gray-500">
                {problems.length} total
                {showList ? (
                  <>
                    <span className="mx-2">•</span>
                    Showing <span className="text-gray-200 font-bold mx-1">{filteredProblems.length}</span>
                  </>
                ) : null}
              </div>
            </div>

            <button
              onClick={() => setShowList((v) => !v)}
              className={`px-4 py-2 rounded-xl font-bold text-sm border transition-all ${
                showList
                  ? "bg-gray-900/40 border-gray-700 text-gray-200 hover:bg-gray-900/60"
                  : "bg-blue-600 border-blue-500 text-white hover:bg-blue-500"
              }`}
            >
              {showList ? "Hide list" : "Browse problems"}
            </button>
          </div>

          {/* Controls row */}
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search ID (e.g. 2010-Q01)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#0b1220] border border-gray-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-200 placeholder-gray-500 transition-all"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mr-1">
                Difficulty
              </span>

              <button
                onClick={() => setDifficultyFilter("all")}
                className={pillClass(difficultyFilter === "all")}
              >
                All
              </button>

              <button
                onClick={() => setDifficultyFilter(0)}
                className={pillClass(difficultyFilter === 0)}
              >
                Unrated
              </button>

              {[1, 2, 3, 4, 5].map((d) => (
                <button
                  key={d}
                  onClick={() => setDifficultyFilter(d)}
                  className={pillClass(difficultyFilter === d)}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* PROBLEM LIST PANEL (hidden until Browse problems) */}
      {showList && (
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="bg-[#161b22] border border-gray-800 rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
              <div className="text-sm text-gray-400">
                Showing <span className="text-gray-200 font-bold">{filteredProblems.length}</span> /{" "}
                <span className="text-gray-200 font-bold">{problems.length}</span>
              </div>

              <button
                onClick={() => {
                  setSearchQuery("");
                  setDifficultyFilter("all");
                }}
                className="text-xs font-bold px-3 py-2 rounded-xl border border-gray-700 text-gray-300 hover:bg-gray-900/40 transition-all"
              >
                Reset filters
              </button>
            </div>

            <div className="max-h-[40vh] overflow-y-auto custom-scrollbar p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredProblems.length > 0 ? (
                filteredProblems.map((p) => {
                  const originalIndex = problems.findIndex((op) => op.id === p.id);
                  const pStats = progress[p.id];
                  const isSelected = currentIdx === originalIndex;
                  const isSolved = pStats?.solved;
                  const isAttempted = !isSolved && (pStats?.attempts ?? 0) > 0;

                  const d = typeof p.difficulty === "number" ? p.difficulty : 0;

                  let styleClass =
                    "bg-transparent border-gray-800 hover:bg-gray-900/30 text-gray-300";

                  if (isSolved) {
                    styleClass =
                      "bg-green-900/15 border-green-900/50 text-green-200 hover:bg-green-900/25";
                  } else if (isAttempted) {
                    styleClass =
                      "bg-red-900/15 border-red-900/50 text-red-200 hover:bg-red-900/25";
                  }

                  if (isSelected) {
                    styleClass +=
                      " ring-1 ring-blue-500/50 border-blue-500 shadow-[0_0_18px_rgba(59,130,246,0.18)]";
                  }

                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        if (originalIndex !== -1) setCurrentIdx(originalIndex);
                        setFeedback(null);
                        setUserInput("");
                        // optional: collapse list after picking
                        setShowList(false);
                      }}
                      className={`text-left w-full px-4 py-3 rounded-2xl border transition-all ${styleClass}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-mono font-bold truncate">{p.id}</div>
                          <div className="mt-1 flex items-center gap-2">
                            <span className="text-[10px] uppercase tracking-tight opacity-70">
                              {isSolved ? "Solved" : isAttempted ? "Attempted" : "Integration Bee"}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-gray-900/40 border border-gray-700 text-gray-300">
                              {d === 0 ? "Unrated" : `D${d}`}
                            </span>
                          </div>
                        </div>

                        {isAttempted && (
                          <span className="text-[10px] font-bold bg-red-500/20 px-2 py-1 rounded text-red-300 shrink-0">
                            {pStats!.attempts}x
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="col-span-full text-center py-10 text-gray-500 text-sm italic">
                  No problems found.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MAIN SOLVING AREA */}
      <main className="max-w-6xl mx-auto px-6 pb-16">
        <div className="flex items-center justify-center">
          <div className="w-full max-w-3xl bg-[#161b22] p-10 rounded-3xl border border-gray-800 shadow-2xl relative overflow-hidden group mt-10">
            <div className="absolute -top-24 -left-24 w-48 h-48 bg-blue-600/10 rounded-full blur-3xl group-hover:bg-blue-600/20 transition-all duration-500" />

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
                        return d === 0 ? "UNRATED" : `DIFFICULTY ${d}`;
                      })()}
                    </span>
                  </div>

                  <div className="mt-10 text-4xl py-6 flex justify-center">
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
              <div className="relative z-10 text-center text-gray-500 py-16">
                <div className="text-white font-bold text-xl mb-2">Pick a problem to begin</div>
                <div className="text-sm text-gray-500 mb-6">
                  Use the top bar to search/filter, then click <span className="text-gray-300 font-bold">Browse problems</span>.
                </div>
                <button
                  onClick={() => setShowList(true)}
                  className="px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-all"
                >
                  Browse problems
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #30363d;
          border-radius: 999px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #484f58;
        }
      `}</style>
    </div>
  );
}
