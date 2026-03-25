"use client";

import Link from "next/link";
import AnswerFormattingGuide from "@/components/AnswerFormattingGuide";

export default function FormattingPage() {
  return (
    <div className="min-h-screen bg-[#050505] text-slate-300 font-sans pt-24 pb-12">
      <nav className="fixed top-0 w-full z-50 bg-[#050505]/95 backdrop-blur-md border-b border-white/5">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center">
          <Link
            href="/trainer"
            className="flex items-center gap-2 text-slate-500 hover:text-white transition-colors group"
          >
            <span className="text-xl group-hover:-translate-x-1 transition-transform">&larr;</span>
            <span className="text-sm font-bold uppercase tracking-wider">Back to Trainer</span>
          </Link>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="space-y-4">
          <h1 className="text-4xl font-black text-white tracking-tight">Syntax &amp; Formatting</h1>
          <p className="text-lg text-slate-400 max-w-2xl">
            Use plain Nerdamer expressions. The trainer and battle now use the same answer checker, so this guide applies everywhere.
          </p>
        </div>

        <AnswerFormattingGuide backHref="/trainer" backLabel="Back to trainer" />

        <div className="rounded-3xl border border-white/10 bg-[#0a0a0a] p-8">
          <h2 className="text-2xl font-bold text-white">Quick checklist</h2>
          <div className="mt-4 grid gap-3 text-sm text-slate-400 md:grid-cols-2">
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
              Submit expressions like <code className="text-emerald-300">x^2/2</code>, <code className="text-emerald-300">sin(x)</code>, or <code className="text-emerald-300">atan(x)</code>.
            </div>
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
              Avoid LaTeX, solver commands, and extra prose. The checker expects only the mathematical expression.
            </div>
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
              If something looks right but is rejected, rewrite it with clearer multiplication like <code className="text-emerald-300">2*x</code> or <code className="text-emerald-300">x*(x+1)</code>.
            </div>
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
              Once a format works in trainer, it should now work the same way in battle.
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
