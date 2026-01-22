"use client";

import Link from "next/link";
import { BlockMath, InlineMath } from "react-katex";
import "katex/dist/katex.min.css";

export default function FormattingPage() {
  return (
    <div className="min-h-screen bg-[#050505] text-slate-300 font-sans pt-24 pb-12">
      <nav className="fixed top-0 w-full z-50 bg-[#050505]/95 backdrop-blur-md border-b border-white/5">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center">
          <Link 
            href="/trainer" 
            className="flex items-center gap-2 text-slate-500 hover:text-white transition-colors group"
          >
            <span className="text-xl group-hover:-translate-x-1 transition-transform">←</span>
            <span className="text-sm font-bold uppercase tracking-wider">Back to Trainer</span>
          </Link>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        {/* Header */}
        <div className="space-y-4">
          <h1 className="text-4xl font-black text-white tracking-tight">Syntax & Formatting</h1>
          <p className="text-lg text-slate-400 max-w-2xl">
            To ensure your answers are graded correctly, please follow these specific formatting rules. 
            The parser is strict!
          </p>
        </div>

        {/* Rule 1: Logarithms */}
        <div className="p-8 rounded-3xl bg-[#0a0a0a] border border-white/10 space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400 font-bold text-xl">1</div>
            <h2 className="text-2xl font-bold text-white">Natural Logarithm</h2>
          </div>
          <div className="pl-16 space-y-4">
            <p>
              Do <strong>NOT</strong> use <code className="text-red-400">ln(x)</code>. 
              You must use <code className="text-emerald-400">log(x)</code> for natural log.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-red-900/10 border border-red-500/20">
                <div className="text-xs font-bold text-red-500 uppercase mb-2">Incorrect</div>
                <code className="text-red-300 text-lg">ln(x) + C</code>
              </div>
              <div className="p-4 rounded-xl bg-emerald-900/10 border border-emerald-500/20">
                <div className="text-xs font-bold text-emerald-500 uppercase mb-2">Correct</div>
                <code className="text-emerald-300 text-lg">log(x) + C</code>
              </div>
            </div>
          </div>
        </div>

        {/* Rule 2: Inverse Trig */}
        <div className="p-8 rounded-3xl bg-[#0a0a0a] border border-white/10 space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400 font-bold text-xl">2</div>
            <h2 className="text-2xl font-bold text-white">Inverse Trigonometry</h2>
          </div>
          <div className="pl-16 space-y-4">
            <p>
              Use <code className="text-emerald-400">a</code> prefix for inverse functions 
              (e.g., <code className="text-emerald-400">atan</code>, <code className="text-emerald-400">asin</code>), 
              not <code className="text-red-400">arctan</code> or <code className="text-red-400">tan^-1</code>.
            </p>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5">
                <span>Inverse Tangent <InlineMath math="\tan^{-1}(x)" /></span>
                <code className="text-emerald-400 font-bold">atan(x)</code>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5">
                <span>Inverse Sine <InlineMath math="\sin^{-1}(x)" /></span>
                <code className="text-emerald-400 font-bold">asin(x)</code>
              </div>
            </div>
          </div>
        </div>

        {/* Rule 3: Powers & Roots */}
        <div className="p-8 rounded-3xl bg-[#0a0a0a] border border-white/10 space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400 font-bold text-xl">3</div>
            <h2 className="text-2xl font-bold text-white">Powers & Roots</h2>
          </div>
          <div className="pl-16 space-y-4">
            <p>
              Use <code className="text-emerald-400">^</code> for exponents and <code className="text-emerald-400">sqrt()</code> for square roots.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                <div className="mb-2 text-slate-400 text-sm">Expression: <InlineMath math="e^{3x}" /></div>
                <code className="text-emerald-400 text-lg">e^(3x)</code>
              </div>
              <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                <div className="mb-2 text-slate-400 text-sm">Expression: <InlineMath math="\sqrt{x^2 + 1}" /></div>
                <code className="text-emerald-400 text-lg">sqrt(x^2 + 1)</code>
              </div>
            </div>
          </div>
        </div>

        {/* Rule 4: Constants */}
        <div className="p-8 rounded-3xl bg-[#0a0a0a] border border-white/10 space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400 font-bold text-xl">4</div>
            <h2 className="text-2xl font-bold text-white">Constants</h2>
          </div>
          <div className="pl-16 space-y-4">
            <ul className="space-y-3">
              <li className="flex items-center gap-3">
                <span className="w-20 text-slate-500">Pi (<InlineMath math="\pi" />)</span>
                <span className="text-slate-600">→</span>
                <code className="text-emerald-400 font-bold">pi</code>
              </li>
              <li className="flex items-center gap-3">
                <span className="w-20 text-slate-500">Euler (<InlineMath math="e" />)</span>
                <span className="text-slate-600">→</span>
                <code className="text-emerald-400 font-bold">e</code>
              </li>
              <li className="flex items-center gap-3">
                <span className="w-20 text-slate-500">Constant</span>
                <span className="text-slate-600">→</span>
                <span className="text-slate-400 text-sm italic">You should not add the +C.</span>
              </li>
            </ul>
          </div>
        </div>

      </main>
    </div>
  );
}