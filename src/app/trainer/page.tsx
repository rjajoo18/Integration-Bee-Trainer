"use client";

import React, { useState, useEffect, useMemo, Suspense } from "react";
import "katex/dist/katex.min.css";
import { BlockMath, InlineMath } from "react-katex";
import nerdamer from "nerdamer";
import "nerdamer/Algebra";
import "nerdamer/Calculus";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import confetti from "canvas-confetti";
import Link from "next/link"; // Added Link import

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

  // --- FETCH DATA ---
  useEffect(() => {
    let mounted = true;
    
    // 1. Get Problems
    fetch("/api/integrals")
      .then((res) => res.json())
      .then((data) => {
        if (!mounted) return;
        if (Array.isArray(data)) setProblems(data);
        setLoading(false);
      });

    // 2. Get Progress (Only if authenticated)
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
      // Optimistic update
      setProgress((prev) => {
        const cur = prev[activeProblem.id] || { solved: false, attempts: 0 };
        return { 
          ...prev, 
          [activeProblem.id]: { 
            solved: cur.solved || isCorrect, 
            attempts: cur.attempts + 1 
          } 
        };
      });

      // DB update
      await fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problemId: activeProblem.id, isCorrect }),
      });
    }
  };

  const navigateToProblem = (id: string) => router.push(`/trainer?id=${id}`);
  const navigateToDashboard = () => router.push(`/trainer`);

  if (loading) return <div className="h-screen bg-black text-white flex items-center justify-center">Loading...</div>;

  // === VIEW 1: PROBLEM PAGE ===
  if (activeProblem) {
    const isSolved = progress[activeProblem.id]?.solved;
    const attempts = progress[activeProblem.id]?.attempts || 0;

    return (
      <div className="min-h-screen bg-[#050505] text-slate-300 font-sans flex flex-col pt-16">
        <nav className="px-6 py-4 flex justify-between items-center">
          <button onClick={navigateToDashboard} className="flex items-center gap-2 text-slate-500 hover:text-white transition-colors group">
            <span className="text-xl group-hover:-translate-x-1">←</span>
            <span className="text-sm font-bold uppercase tracking-wider">Back to Dashboard</span>
          </button>
          
          <Link href="/formatting" className="text-xs font-bold text-blue-500 hover:text-blue-400 uppercase tracking-wide">
             Formatting Help
          </Link>
        </nav>

        <main className="flex-1 max-w-6xl mx-auto w-full px-4 flex flex-col justify-center pb-20">
          <div className="space-y-12">
            <div className={`relative p-12 rounded-[40px] border shadow-2xl ${
              isSolved ? "bg-emerald-900/10 border-emerald-500/20" : "bg-white/5 border-white/10"
            }`}>
              <div className="flex flex-col items-center gap-6">
                <div className="flex gap-2">
                  <span className="px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold uppercase">
                    {activeProblem.id}
                  </span>
                  {attempts > 0 && (
                     <span className={`px-3 py-1 rounded-full border text-xs font-bold uppercase ${
                       isSolved ? "bg-emerald-500/10 border-emerald-500 text-emerald-400" : "bg-red-500/10 border-red-500 text-red-400"
                     }`}>
                       {isSolved ? "Solved" : `${attempts} Attempts`}
                     </span>
                  )}
                </div>
                <div className="text-4xl md:text-6xl text-white">
                  <BlockMath math={activeProblem.problem_text} />
                </div>
              </div>
            </div>

            <div className="max-w-2xl mx-auto space-y-4">
              <div className={`relative ${isShaking ? "animate-shake" : ""}`}>
                <input
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && checkAnswer()}
                  placeholder={isSolved ? "Solved!" : "Answer..."}
                  className={`w-full border-2 p-6 rounded-3xl text-2xl font-mono text-white bg-white/5 focus:outline-none transition-all ${
                    isShaking ? "border-red-500" : isSolved ? "border-emerald-500/50" : "border-white/10 focus:border-blue-500"
                  }`}
                />
                <button onClick={checkAnswer} className="absolute right-3 top-3 bottom-3 px-8 rounded-2xl bg-white text-black font-bold uppercase hover:bg-blue-500 hover:text-white transition-all">
                  {isSolved ? "Check" : "Submit"}
                </button>
              </div>
              {feedback && (
                <div className={`p-4 rounded-xl text-center font-bold ${
                  feedback.type === "success" ? "text-emerald-400 bg-emerald-500/10" : "text-red-400 bg-red-500/10"
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
    <div className="min-h-screen bg-[#050505] text-slate-300 font-sans pt-16">
      
      {/* IMPROVED HEADER SECTION */}
      <div className="sticky top-16 z-40 bg-[#050505]/95 backdrop-blur-md border-b border-white/5 shadow-2xl">
        <div className="max-w-7xl mx-auto px-6 py-4 space-y-4">
          
          {/* Row 1: Search + Link */}
          <div className="flex gap-4">
            <input 
              type="text"
              placeholder="Search problems by ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#111] border border-white/10 rounded-xl px-5 py-3 text-sm text-white placeholder-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
            />
            {/* Added Link Here */}
            <Link 
              href="/formatting"
              className="hidden md:flex items-center px-6 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-bold uppercase hover:bg-blue-500 hover:text-white transition-all whitespace-nowrap"
            >
              Formatting Guide
            </Link>
          </div>
          
          {/* Mobile Link (Visible only on small screens) */}
          <div className="md:hidden">
             <Link 
              href="/formatting"
              className="block w-full text-center py-2 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-bold uppercase"
            >
              Formatting Guide
            </Link>
          </div>

          {/* Row 2: Controls */}
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
            
            {/* Status Filter */}
            <div className="flex bg-[#111] p-1 rounded-xl border border-white/5">
              {(["all", "solved", "unsolved"] as const).map((s) => (
                <button 
                  key={s} 
                  onClick={() => setStatusFilter(s)} 
                  className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-all ${
                    statusFilter === s 
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-900/20" 
                      : "text-gray-500 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            <div className="hidden md:block w-px h-8 bg-white/10"></div>

            {/* Difficulty Filter (Scrollable) */}
            <div className="flex-1 overflow-x-auto no-scrollbar w-full">
              <div className="flex gap-2">
                {["all", 0, 1, 2, 3, 4, 5].map((d) => (
                  <button
                    key={d}
                    onClick={() => setDifficultyFilter(d as any)}
                    className={`whitespace-nowrap px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all border ${
                      difficultyFilter === d 
                        ? "bg-white text-black border-white shadow-lg" 
                        : "bg-[#111] border-white/5 text-gray-500 hover:text-white hover:border-white/20"
                    }`}
                  >
                    {d === "all" ? "All Difficulties" : d === 0 ? "Unrated" : `Difficulty ${d}`}
                  </button>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {filteredProblems.map((p) => {
            const pStats = progress[p.id];
            const isSolved = pStats?.solved;
            const attempts = pStats?.attempts || 0;
            const isWrong = !isSolved && attempts > 0;

            // --- COLOR LOGIC FOR TILES ---
            let cardStyle = "bg-[#0a0a0a] border-white/5 hover:border-blue-500/50"; // Default
            
            if (isSolved) {
               cardStyle = "bg-emerald-900/40 border-emerald-500/50 hover:bg-emerald-900/60 shadow-[0_0_20px_rgba(16,185,129,0.1)]"; 
            } else if (isWrong) {
               cardStyle = "bg-red-900/40 border-red-500/50 hover:bg-red-900/60 shadow-[0_0_20px_rgba(239,68,68,0.1)]";
            }

            return (
              <button
                key={p.id}
                onClick={() => navigateToProblem(p.id)}
                className={`group p-6 rounded-3xl border text-left transition-all hover:-translate-y-1 ${cardStyle}`}
              >
                <div className="flex justify-between items-start mb-6">
                  <span className={`font-mono text-xs font-bold ${isSolved ? "text-emerald-400" : isWrong ? "text-red-400" : "text-slate-500"}`}>
                    {p.id}
                  </span>
                </div>
                
                <div className="mt-8 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${isSolved ? "bg-emerald-500" : isWrong ? "bg-red-500" : "bg-slate-700"}`} />
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${isSolved ? "text-emerald-400" : isWrong ? "text-red-400" : "text-slate-500"}`}>
                      {isSolved ? "Solved" : isWrong ? `${attempts} attempt(s)` : "Start"}
                    </span>
                  </div>
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
    <Suspense fallback={<div className="h-screen bg-black flex items-center justify-center text-white">Loading...</div>}>
      <TrainerContent />
    </Suspense>
  );
}