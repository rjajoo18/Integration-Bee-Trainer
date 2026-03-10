"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import "katex/dist/katex.min.css";
import { BlockMath } from "react-katex";
import { ArrowLeft, Trophy, Lock, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

type MatchState = {
  match: {
    id: string;
    roomId: string;
    status: "in_game" | "finished";
    currentPhase: "in_game" | "cooldown" | "finished";
    winnerUserId: number | null;
    difficulty: number | null;
    secondsPerProblem: number;
    cooldownStartsAt: string | null;
    cooldownEndsAt: string | null;
  };
  players: { userId: number; score: number; username?: string | null; lastSubmitAt?: string | null; eloRating?: number | null }[];
  currentProblem: null | {
    id: string;
    latex: string | null;
    difficulty: number;
    roundIndex: number;
    startsAt: string | null;
    endsAt: string | null;
  };
  problemEndsAt: string | null;
  isLockedOut?: boolean;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const AVATAR_COLORS = [
  "bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500",
  "bg-rose-500", "bg-sky-500", "bg-indigo-500", "bg-pink-500",
];
function getAvatarColor(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatTime(msLeft: number): string {
  const ms = Math.max(0, msLeft);
  if (ms < 10_000) {
    return (Math.ceil(ms / 100) / 10).toFixed(1);
  }
  return String(Math.ceil(ms / 1000));
}

function displayName(username: string | null | undefined, userId: number): string {
  if (!username?.trim()) return `Player ${userId}`;
  return username;
}

export default function MatchClient({ matchId }: { matchId: string }) {
  const [state, setState] = useState<MatchState | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [matchClosed, setMatchClosed] = useState(false);

  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "bad"; msg: string } | null>(null);
  const [lockedOut, setLockedOut] = useState(false);

  const [nowMs, setNowMs] = useState(() => Date.now());

  // Tracks which problem ID we have already initialized state for, to detect round transitions.
  const seenProblemIdRef = useRef<string | null>(null);

  const validMatchId = UUID_RE.test(matchId);

  async function load() {
    if (!validMatchId) return;
    const r = await fetch(`/api/battle/matches/${matchId}`, { cache: "no-store" });

    if (r.status === 404) {
      setMatchClosed(true);
      setState(null);
      return;
    }

    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j as any)?.error ?? "Failed to load match");
    setState(j as MatchState);
  }

  useEffect(() => {
    if (!validMatchId) {
      setErr(`Invalid match ID: ${matchId}`);
      return;
    }
    setErr(null);
    load().catch((e) => setErr(e?.message ?? "Failed to load match"));
    const t = setInterval(() => load().catch(() => {}), 800);
    return () => clearInterval(t);
  }, [matchId, validMatchId]);

  // Reset all round-specific state when a new problem appears.
  useEffect(() => {
    const newId = state?.currentProblem?.id ?? null;
    if (newId && newId !== seenProblemIdRef.current) {
      seenProblemIdRef.current = newId;
      setAnswer("");
      setFeedback(null);
      setLockedOut(false);
    }
  }, [state?.currentProblem?.id]);

  // Sync lockout from backend (in case of page refresh / reconnect mid-round).
  useEffect(() => {
    if (state?.isLockedOut) {
      setLockedOut(true);
    }
  }, [state?.isLockedOut]);

  // Timer ticker — uses RAF for the last 10 seconds, interval otherwise.
  useEffect(() => {
    const phase = state?.match?.currentPhase;
    const endsAtIso =
      phase === "in_game"
        ? state?.problemEndsAt ?? state?.currentProblem?.endsAt ?? null
        : phase === "cooldown"
          ? state?.match?.cooldownEndsAt ?? null
          : null;

    if (!endsAtIso) return;

    let raf = 0 as any;
    let interval: any = null;
    const tick = () => setNowMs(Date.now());
    const msLeft = new Date(endsAtIso).getTime() - Date.now();

    if (phase === "in_game" && msLeft < 10_000) {
      const loop = () => { tick(); raf = requestAnimationFrame(loop); };
      raf = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(raf);
    } else {
      interval = setInterval(tick, 100);
      return () => clearInterval(interval);
    }
  }, [state?.match?.currentPhase, state?.problemEndsAt, state?.currentProblem?.endsAt, state?.match?.cooldownEndsAt]);

  const phase = state?.match?.currentPhase ?? "in_game";

  const timeLeftMs = useMemo(() => {
    if (!state) return null;
    if (phase === "in_game") {
      const iso = state.problemEndsAt ?? state.currentProblem?.endsAt ?? null;
      if (!iso) return null;
      return new Date(iso).getTime() - nowMs;
    }
    if (phase === "cooldown") {
      const iso = state.match.cooldownEndsAt ?? null;
      if (!iso) return null;
      return new Date(iso).getTime() - nowMs;
    }
    return null;
  }, [state, phase, nowMs]);

  const inCooldown = phase === "cooldown";
  const finished = state?.match?.status === "finished" || phase === "finished";

  const latexStr = useMemo(() => {
    const v = state?.currentProblem?.latex;
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t.length ? t : null;
  }, [state?.currentProblem?.latex]);

  const timerProgress = useMemo(() => {
    if (!state || phase !== "in_game" || timeLeftMs == null) return 1;
    const total = state.match.secondsPerProblem * 1000;
    return Math.max(0, Math.min(1, timeLeftMs / total));
  }, [state, phase, timeLeftMs]);

  const isTimeLow = phase === "in_game" && timeLeftMs != null && timeLeftMs < 10_000;

  const inputDisabled = !state?.currentProblem || submitting || finished || inCooldown || lockedOut;

  async function submit() {
    if (inputDisabled) return;
    const trimmedAnswer = answer.trim();
    if (!trimmedAnswer) return;

    setSubmitting(true);
    setErr(null);
    setFeedback(null);

    try {
      const r = await fetch(`/api/battle/matches/${matchId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problemId: state!.currentProblem!.id,
          answerLatex: trimmedAnswer,
        }),
      });
      const j = await r.json().catch(() => ({}));

      if (!r.ok) {
        if ((j as any)?.locked) {
          setLockedOut(true);
          setFeedback({ type: "bad", msg: "Already attempted — you are locked out for this round." });
        } else {
          throw new Error((j as any)?.error ?? "Failed to submit");
        }
        return;
      }

      if ((j as any).correct) {
        setFeedback({
          type: "ok",
          msg: (j as any).matchEnded ? "Correct — you won the match!" : "Correct! Next problem in a moment...",
        });
        setAnswer("");
      } else {
        setFeedback({ type: "bad", msg: "Incorrect — you are locked out for this round." });
        setLockedOut(true);
      }
      await load();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  const winner = useMemo(() => {
    if (!finished || !state) return null;
    const wId = state.match.winnerUserId;
    if (!wId) return null;
    const p = state.players.find((p) => p.userId === wId);
    return displayName(p?.username, wId);
  }, [finished, state]);

  const sortedPlayers = useMemo(
    () => [...(state?.players ?? [])].sort((a, b) => b.score - a.score),
    [state?.players]
  );

  const roundIndex = (state?.currentProblem?.roundIndex ?? 0) + 1;

  // --- Match closed (room deleted / host left) ---
  if (matchClosed) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-[#080c14] text-white flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <AlertTriangle size={40} className="text-amber-400 mx-auto mb-4" />
          <h2 className="text-2xl font-black mb-2">Match Ended</h2>
          <p className="text-zinc-500 text-sm mb-6">The host left the room and the match was closed.</p>
          <button
            onClick={() => (window.location.href = "/battle")}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 rounded-xl font-bold transition-all active:scale-95"
          >
            Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  // --- Loading ---
  if (!state && !err) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-[#080c14] flex items-center justify-center">
        <div className="text-center">
          <div className="h-10 w-10 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin mx-auto mb-4" />
          <p className="text-sm text-zinc-500">Loading match...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#080c14] text-white flex flex-col">

      {/* Thin progress bar at the very top of the viewport */}
      {!finished && !inCooldown && (
        <div className="fixed top-0 left-0 right-0 z-50 h-[3px] bg-white/[0.06]">
          <div
            className={`h-full transition-none ${isTimeLow ? "bg-red-500" : "bg-indigo-500"}`}
            style={{ width: `${timerProgress * 100}%` }}
          />
        </div>
      )}

      {/* ─── Header ─────────────────────────────────────────────── */}
      <header className="border-b border-white/[0.07] bg-[#0a0f1c]/95 backdrop-blur-sm sticky top-16 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center gap-4 h-16">

          {/* Back */}
          <button
            onClick={() => (window.location.href = "/battle")}
            className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-200 font-medium transition-colors shrink-0"
          >
            <ArrowLeft size={15} />
            <span className="hidden sm:inline">Lobby</span>
          </button>

          {/* Center label */}
          <div className="flex-1 text-center">
            {finished ? (
              <span className="text-xs font-black uppercase tracking-widest text-amber-400">Match Over</span>
            ) : inCooldown ? (
              <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">Next Problem Loading…</span>
            ) : state?.currentProblem ? (
              <span className="text-xs font-black uppercase tracking-widest text-zinc-500">
                Problem {roundIndex}
              </span>
            ) : null}
          </div>

          {/* ─── BIG TIMER ─── */}
          <div className="shrink-0 text-right min-w-[80px]">
            {!finished && timeLeftMs != null ? (
              <>
                <div className={`font-black font-mono tabular-nums leading-none ${
                  inCooldown
                    ? "text-3xl text-zinc-500"
                    : isTimeLow
                      ? "text-4xl text-red-400 animate-pulse"
                      : "text-4xl text-white"
                }`}>
                  {inCooldown
                    ? `${Math.max(0, Math.ceil(timeLeftMs / 1000))}`
                    : formatTime(timeLeftMs)
                  }
                </div>
                <div className="text-[9px] uppercase tracking-widest mt-0.5 font-bold">
                  {inCooldown
                    ? <span className="text-zinc-600">next in</span>
                    : isTimeLow
                      ? <span className="text-red-600">hurry!</span>
                      : <span className="text-zinc-700">time left</span>
                  }
                </div>
              </>
            ) : (
              <div className="text-4xl font-black font-mono text-zinc-800">—</div>
            )}
          </div>

        </div>
      </header>

      {/* API error banner */}
      {err && (
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 mt-4">
          <div className="rounded-xl bg-red-950/20 border border-red-900/30 px-4 py-3 text-sm text-red-300">
            {err}
          </div>
        </div>
      )}

      {/* ─── Main content ───────────────────────────────────────── */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-5">
        <div className="flex flex-col lg:flex-row gap-5 h-full">

          {/* ── Left: Problem + Answer ── */}
          <div className="flex-1 flex flex-col gap-4 min-w-0">

            {/* Problem card */}
            <div className="relative rounded-2xl border border-white/[0.07] bg-white/[0.015] flex-1 min-h-[340px] sm:min-h-[420px] lg:min-h-[460px] flex items-center justify-center p-8 sm:p-14 overflow-hidden">

              {/* Cooldown overlay */}
              {inCooldown && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#080c14]/96 backdrop-blur-sm z-10 rounded-2xl gap-4">
                  <div className={`text-[7rem] font-black font-mono tabular-nums leading-none ${
                    timeLeftMs != null && timeLeftMs < 3000 ? "text-emerald-400" : "text-zinc-200"
                  }`}>
                    {timeLeftMs == null ? "—" : Math.max(0, Math.ceil(timeLeftMs / 1000))}
                  </div>
                  <p className="text-sm font-bold uppercase tracking-[0.2em] text-zinc-600">
                    Next problem starting…
                  </p>
                </div>
              )}

              {/* Finished overlay */}
              {finished && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#080c14]/96 backdrop-blur-sm z-10 rounded-2xl gap-3">
                  <Trophy size={52} className="text-amber-400" />
                  <h2 className="text-3xl font-black">Match Over</h2>
                  {winner && (
                    <p className="text-lg text-zinc-400">
                      Winner: <span className="text-white font-black">{winner}</span>
                    </p>
                  )}
                  <button
                    onClick={() => (window.location.href = "/battle")}
                    className="mt-4 bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 rounded-xl text-base font-bold transition-all active:scale-95 hover:shadow-[0_0_24px_rgba(99,102,241,0.4)]"
                  >
                    Back to Lobby
                  </button>
                </div>
              )}

              {/* Problem LaTeX — the dominant visual element */}
              <div className="w-full overflow-x-auto text-center">
                {state?.currentProblem ? (
                  latexStr ? (
                    <div
                      className="[&_.katex]:text-white [&_.katex-display]:my-0"
                      style={{ fontSize: 'clamp(2rem, 4.5vw, 4.5rem)' }}
                    >
                      <BlockMath math={latexStr} />
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-600 italic">Problem is missing LaTeX content.</p>
                  )
                ) : !finished && !inCooldown ? (
                  <div className="text-sm text-zinc-700 animate-pulse">Waiting for problem to load…</div>
                ) : null}
              </div>
            </div>

            {/* Feedback banner */}
            {feedback && (
              <div className={`rounded-xl px-5 py-4 flex items-center gap-3 text-base font-semibold border ${
                feedback.type === "ok"
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                  : "bg-red-500/10 border-red-500/20 text-red-300"
              }`}>
                {feedback.type === "ok"
                  ? <CheckCircle2 size={20} className="shrink-0" />
                  : <XCircle size={20} className="shrink-0" />
                }
                {feedback.msg}
              </div>
            )}

            {/* Locked-out banner (shown when no other feedback message is visible) */}
            {lockedOut && !feedback && (
              <div className="rounded-xl px-5 py-4 flex items-center gap-3 bg-red-500/10 border border-red-500/20 text-red-300 text-base font-semibold">
                <Lock size={18} className="shrink-0" />
                Locked out for this round — wait for the next problem.
              </div>
            )}

            {/* Answer input */}
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.015] p-4">
              <div className="flex gap-3">
                <input
                  className={`flex-1 border rounded-xl px-5 py-4 text-base text-white placeholder:text-zinc-600 outline-none transition-colors font-mono ${
                    lockedOut
                      ? "bg-white/[0.02] border-red-500/15 opacity-40 cursor-not-allowed"
                      : "bg-white/[0.05] border-white/[0.08] focus:border-indigo-500/60"
                  }`}
                  placeholder={
                    lockedOut
                      ? "Locked out for this round"
                      : inCooldown
                        ? "Waiting for next problem…"
                        : finished
                          ? "Match over"
                          : "Enter your answer (e.g. pi/2 + C)"
                  }
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !inputDisabled && answer.trim()) submit();
                  }}
                  disabled={inputDisabled}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  onClick={submit}
                  disabled={inputDisabled || !answer.trim()}
                  className={`shrink-0 px-8 py-4 rounded-xl text-base font-black transition-all ${
                    inputDisabled || !answer.trim()
                      ? "bg-white/[0.04] text-zinc-700 cursor-not-allowed"
                      : "bg-indigo-600 hover:bg-indigo-500 text-white hover:shadow-[0_0_24px_rgba(99,102,241,0.4)] active:scale-95"
                  }`}
                >
                  {submitting ? (
                    <span className="inline-block h-5 w-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  ) : "Submit"}
                </button>
              </div>
            </div>

          </div>

          {/* ── Right: Scoreboard ── */}
          <div className="lg:w-64 xl:w-72 shrink-0">
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.015] p-5 sticky top-36">

              <div className="flex items-center gap-2 mb-5">
                <Trophy size={15} className="text-amber-500" />
                <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500">Scoreboard</h3>
                <span className="ml-auto text-[10px] text-zinc-700 font-bold">First to 3</span>
              </div>

              <div className="space-y-3">
                {sortedPlayers.map((p, i) => {
                  const label = displayName(p.username, p.userId);
                  const initial = label.charAt(0).toUpperCase();
                  const avatarColor = getAvatarColor(p.username ?? String(p.userId));
                  const isWinner = finished && p.userId === state?.match?.winnerUserId;
                  const isLeading = !finished && i === 0 && p.score > 0;

                  return (
                    <div
                      key={p.userId}
                      className={`rounded-xl p-4 border transition-all ${
                        isWinner
                          ? "bg-amber-500/10 border-amber-500/25 shadow-[0_0_12px_rgba(245,158,11,0.1)]"
                          : isLeading
                            ? "bg-indigo-500/10 border-indigo-500/20"
                            : "bg-white/[0.03] border-white/[0.05]"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {/* Avatar */}
                        <div className="relative shrink-0">
                          <div className={`w-10 h-10 rounded-full ${avatarColor} flex items-center justify-center text-sm font-black text-white`}>
                            {initial}
                          </div>
                          {isWinner && (
                            <span className="absolute -top-2 -right-2 text-base leading-none">👑</span>
                          )}
                        </div>

                        {/* Name + rank + Elo */}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold text-zinc-100 truncate">{label}</div>
                          <div className={`text-[11px] font-bold ${
                            isWinner ? "text-amber-500" : isLeading ? "text-indigo-400" : "text-zinc-600"
                          }`}>
                            {isWinner ? "Winner!" : isLeading ? "Leading" : `#${i + 1}`}
                          </div>
                          {p.eloRating != null && (
                            <div className="text-[10px] text-zinc-600 font-mono mt-0.5">
                              {p.eloRating} Elo
                            </div>
                          )}
                        </div>

                        {/* Score — large and prominent */}
                        <div className={`text-4xl font-black tabular-nums shrink-0 leading-none ${
                          isWinner ? "text-amber-400" : isLeading ? "text-indigo-300" : "text-zinc-400"
                        }`}>
                          {p.score}
                        </div>
                      </div>

                      {/* Progress bar to 3 */}
                      <div className="mt-3 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ease-out ${
                            isWinner ? "bg-amber-400" : isLeading ? "bg-indigo-500" : "bg-zinc-600"
                          }`}
                          style={{ width: `${Math.min(1, p.score / 3) * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Round counter */}
              {!finished && state?.currentProblem && (
                <div className="mt-4 pt-4 border-t border-white/[0.05] text-center">
                  <span className="text-xs text-zinc-700">Round {roundIndex}</span>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
