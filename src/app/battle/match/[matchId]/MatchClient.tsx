"use client";

import React, { useEffect, useMemo, useState } from "react";
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
  players: { userId: number; score: number; lastSubmitAt?: string | null }[];
  currentProblem: null | {
    id: string;
    latex: string | null; // <-- allow null defensively
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

  const msLeft = useMemo(() => {
    if (!state?.problemEndsAt) return null;
    return new Date(state.problemEndsAt).getTime() - Date.now();
  }, [state?.problemEndsAt]);

  const secondsLeft = msLeft == null ? null : Math.max(0, Math.ceil(msLeft / 1000));

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
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xl font-semibold">Battle</div>
            <div className="mt-1 text-sm text-zinc-400">
              Match ID: <span className="font-mono text-zinc-300">{matchId}</span>
            </div>
          </div>
          <button
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm hover:border-zinc-700"
            onClick={() => (window.location.href = "/battle")}
          >
            Back to Lobby
          </button>
        </div>

        {err && (
          <div className="mt-4 rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">
            {err}
          </div>
        )}

        {feedback && (
          <div
            className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
              feedback.type === "ok"
                ? "border-emerald-900/50 bg-emerald-950/30 text-emerald-200"
                : "border-amber-900/50 bg-amber-950/30 text-amber-200"
            }`}
          >
            {feedback.msg}
          </div>
        )}

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Problem</div>
              <div className="text-sm text-zinc-400">
                {secondsLeft == null ? "—" : `Time left: ${secondsLeft}s`}
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/30 p-4">
              {state?.currentProblem ? (
                latexStr ? (
                  <BlockMath math={latexStr} />
                ) : (
                  <div className="text-sm text-zinc-400">
                    Problem is missing/invalid LaTeX (problem_text).
                  </div>
                )
              ) : (
                <div className="text-sm text-zinc-400">
                  No problem served yet. Host must click “Next problem”.
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-col gap-2">
              <label className="text-xs text-zinc-400">
                Your answer (nerdamer-friendly expr for MVP)
              </label>
              <input
                className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-zinc-600"
                placeholder="e.g. ln(x)+C"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                disabled={!state?.currentProblem || submitting || finished}
              />

              <div className="flex items-center gap-2">
                <button
                  className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={submit}
                  disabled={!state?.currentProblem || submitting || finished}
                >
                  {submitting ? "Submitting…" : "Submit"}
                </button>

                <button
                  className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm hover:border-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={nextProblem}
                  disabled={finished}
                  title="Host only (server enforces)"
                >
                  Next problem
                </button>
              </div>

              {finished && (
                <div className="mt-2 text-sm text-zinc-300">
                  Match finished. Winner:{" "}
                  <span className="font-mono">{state?.match?.winnerUserId}</span>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="text-sm font-medium">Scoreboard</div>
            <div className="mt-2 text-xs text-zinc-400">First to 3 wins</div>

            <div className="mt-4 grid gap-2">
              {(state?.players ?? []).map((p) => (
                <div key={p.userId} className="rounded-xl border border-zinc-800 bg-zinc-950/30 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-zinc-200">{p.userId}</div>
                    <div className="text-sm font-semibold">{p.score}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/30 p-3 text-xs text-zinc-400">
              Difficulty built into problem generation
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
