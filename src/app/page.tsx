'use client';
import Link from 'next/link';
import { InlineMath } from 'react-katex';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#0d1117] text-white flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-600/10 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-600/10 rounded-full blur-[120px]" />

      <main className="z-10 text-center px-6 max-w-4xl">
        <h1 className="text-7xl md:text-9xl font-extrabold tracking-tighter mb-6 bg-gradient-to-b from-white to-gray-600 bg-clip-text text-transparent">
          Master the <br /> <span className="text-blue-500 italic">Integral.</span>
        </h1>

        <div className="flex justify-center mb-10 opacity-40 text-2xl">
          <InlineMath math="\int_{0}^{\infty} \frac{\sin(x)}{x} dx = \frac{\pi}{2}" />
        </div>

        <p className="text-gray-400 text-lg md:text-xl mb-12 leading-relaxed max-w-2xl mx-auto">
          The ultimate trainer for competitive calculus. Explore and solve hundreds of problems from the MIT Integration Bee and beyond.
        </p>

        <div className="flex justify-center items-center">
          <Link 
            href="/trainer" 
            className="px-12 py-5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-bold text-xl transition-all shadow-[0_0_30px_rgba(59,130,246,0.4)] hover:scale-105 active:scale-95"
          >
            Enter the Trainer
          </Link>
        </div>
      </main>

      <footer className="absolute bottom-10 w-full text-center text-gray-600 font-mono text-[10px] uppercase tracking-[0.4em]">
        Designed for Excellence • Powered by Neon
      </footer>
    </div>
  );
}