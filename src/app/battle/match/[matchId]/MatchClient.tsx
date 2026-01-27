"use client";

import React, { useEffect, useMemo, useState, useRef } from "react";
import "katex/dist/katex.min.css";
import { BlockMath } from "react-katex";

type MatchState = {
  match: {
    id: string;
    roomId: string;
    status: "in_game" | "finished";
    winnerUserId: number | null;
    difficulty: number | null;
    secondsPerProblem: number;
  };
  players: { userId: number; score: number; lastSubmitAt?: string | null; email?: string | null }[];
  currentProblem: null | {
    id: string;
    latex: string | null;
    difficulty: number;
    roundIndex: number;
    startsAt: string | null;
    endsAt: string | null;
  };
  problemEndsAt: string | null;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function MatchClient({ matchId }: { matchId: string }) {
  const [state, setState] = useState<MatchState | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "bad"; msg: string } | null>(null);

  // Live countdown timer state
  const [now, setNow] = useState(Date.now());
  const rafRef = useRef<number | null>(null);
  const lastUpdateRef = useRef(0);

  const validMatchId = UUID_RE.test(matchId);

  async function load() {
    if (!validMatchId) return;

    const r = await fetch(`/api/battle/matches/${matchId}`, { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j as any)?.error ?? "Failed to load match");

    setState(j as MatchState);
  }

  useEffect(() => {
    if (!validMatchId) {
      setErr(`Invalid matchId (expected uuid), got: ${matchId}`);
      return;
    }

    setErr(null);
    load().catch((e) => setErr(e?.message ?? "Failed"));

    const t = setInterval(() => load().catch(() => {}), 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, validMatchId]);

  // Live countdown timer loop
  useEffect(() => {
    const tick = () => {
      const currentTime = Date.now();
      const elapsed = currentTime - lastUpdateRef.current;
      
      // Update frequency based on time remaining
      const msLeft = state?.problemEndsAt 
        ? new Date(state.problemEndsAt).getTime() - currentTime
        : null;
      
      const updateInterval = msLeft !== null && msLeft <= 10000 ? 100 : 1000;
      
      if (elapsed >= updateInterval) {
        setNow(currentTime);
        lastUpdateRef.current = currentTime;
      }
      
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [state?.problemEndsAt]);

  const msLeft = useMemo(() => {
    if (!state?.problemEndsAt) return null;
    return Math.max(0, new Date(state.problemEndsAt).getTime() - now);
  }, [state?.problemEndsAt, now]);

  const timerDisplay = useMemo(() => {
    if (msLeft === null) return null;
    const seconds = msLeft / 1000;
    
    if (seconds > 10) {
      return Math.ceil(seconds).toString();
    } else {
      return seconds.toFixed(1);
    }
  }, [msLeft]);

  const latexStr = useMemo(() => {
    const v = state?.currentProblem?.latex;
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t.length ? t : null;
  }, [state?.currentProblem?.latex]);

  async function nextProblem() {
    if (!validMatchId) return;
    setErr(null);

    try {
      const r = await fetch(`/api/battle/matches/${matchId}/next`, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j as any)?.error ?? "Failed to serve next problem");

      setFeedback({ type: "ok", msg: "New problem served." });
      setAnswer("");
      await load();
    } catch (e: any) {
      setErr(e?.message ?? "Failed");
    }
  }

  async function submit() {
    if (!validMatchId) return;
    if (!state?.currentProblem) return;

    setSubmitting(true);
    setErr(null);
    setFeedback(null);

    try {
      const r = await fetch(`/api/battle/matches/${matchId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problemId: state.currentProblem.id,
          answerLatex: answer,
        }),
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j as any)?.error ?? "Failed to submit");

      if ((j as any).correct) {
        setFeedback({
          type: "ok",
          msg: (j as any).matchEnded ? "Correct — you won the match!" : "Correct!",
        });
        setAnswer("");
      } else {
        setFeedback({ type: "bad", msg: (j as any).message ?? "Incorrect" });
      }

      await load();
    } catch (e: any) {
      setErr(e?.message ?? "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  const finished = state?.match?.status === "finished";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-screen-2xl px-6 py-8">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <div className="text-2xl font-semibold">Battle</div>
          </div>
          <button
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm hover:border-zinc-700"
            onClick={() => (window.location.href = "/battle")}
          >
            Back to Lobby
          </button>
        </div>

        {err && (
          <div className="mb-6 rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">
            {err}
          </div>
        )}

        {feedback && (
          <div
            className={`mb-6 rounded-xl border px-4 py-3 text-sm ${
              feedback.type === "ok"
                ? "border-emerald-900/50 bg-emerald-950/30 text-emerald-200"
                : "border-amber-900/50 bg-amber-950/30 text-amber-200"
            }`}
          >
            {feedback.msg}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-8">
            <div className="mb-6 rounded-xl border border-zinc-800 bg-zinc-950/30 p-8 min-h-[300px] flex items-center justify-center">
              {state?.currentProblem ? (
                latexStr ? (
                  <div className="text-3xl">
                    <BlockMath math={latexStr} />
                  </div>
                ) : (
                  <div className="text-base text-zinc-400">
                    Problem is missing/invalid LaTeX (problem_text).
                  </div>
                )
              ) : (
                <div className="text-base text-zinc-400">
                  No problem served yet. Host must click "Next problem".
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <label className="text-sm text-zinc-400">
                Your answer (nerdamer-friendly expr for MVP)
              </label>
              <input
                className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-base outline-none focus:border-zinc-600"
                placeholder="e.g. log(x)+C"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                disabled={!state?.currentProblem || submitting || finished}
              />

              <div className="flex items-center gap-3">
                <button
                  className="rounded-lg bg-zinc-100 px-6 py-3 text-base font-medium text-zinc-950 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={submit}
                  disabled={!state?.currentProblem || submitting || finished}
                >
                  {submitting ? "Submitting…" : "Submit"}
                </button>

                <button
                  className="rounded-lg border border-zinc-800 bg-zinc-900 px-6 py-3 text-base hover:border-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={nextProblem}
                  disabled={finished}
                  title="Host only (server enforces)"
                >
                  Next problem
                </button>
              </div>

              {finished && (
                <div className="mt-2 text-base text-zinc-300">
                  Match finished. Winner:{" "}
                  <span className="font-mono">{state?.match?.winnerUserId}</span>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
            <div className="text-lg font-medium mb-1">Scoreboard</div>
            <div className="mb-6 text-sm text-zinc-400">First to 3 wins</div>

            <div className="grid gap-3">
              {(state?.players ?? []).map((p) => (
                <div key={p.userId} className="rounded-xl border border-zinc-800 bg-zinc-950/30 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="text-base text-zinc-200">
                      {p.email || `User ${p.userId}`}
                    </div>
                    <div className="text-lg font-semibold">{p.score}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Live countdown timer - fixed position bottom right */}
      {state?.currentProblem && !finished && timerDisplay !== null && (
        <div className="fixed bottom-8 right-8 rounded-2xl border border-zinc-700 bg-zinc-900/90 backdrop-blur-sm px-6 py-4 shadow-xl">
          <div className="text-xs text-zinc-400 mb-1">Time Left</div>
          <div className={`text-3xl font-bold tabular-nums ${
            msLeft !== null && msLeft <= 10000 ? 'text-red-400' : 'text-zinc-100'
          }`}>
            {timerDisplay}s
          </div>
        </div>
      )}
    </div>
  );
}