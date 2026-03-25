import Link from "next/link";
import { answerFormattingRules } from "@/lib/answer-formatting";

type Props = {
  compact?: boolean;
  className?: string;
  backHref?: string;
  backLabel?: string;
};

export default function AnswerFormattingGuide({
  compact = false,
  className = "",
  backHref,
  backLabel,
}: Props) {
  const rules = compact ? answerFormattingRules.slice(0, 4) : answerFormattingRules;

  return (
    <section className={`rounded-2xl border border-white/[0.08] bg-white/[0.025] ${compact ? "p-4" : "p-6"} ${className}`.trim()}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className={`${compact ? "text-sm" : "text-xl"} font-bold text-white`}>Answer Formatting Guide</h2>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {!compact && backHref && backLabel && (
            <Link href={backHref} className="text-xs font-semibold text-zinc-500 hover:text-zinc-200 transition-colors">
              {backLabel}
            </Link>
          )}
          <Link href="/formatting" className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors">
            Full guide
          </Link>
        </div>
      </div>

      <div className={`mt-4 grid gap-3 ${compact ? "" : "md:grid-cols-2"}`}>
        {rules.map((rule) => (
          <div key={rule.title} className="rounded-xl border border-white/[0.06] bg-[#0d1220]/70 p-4">
            <h3 className="text-sm font-semibold text-zinc-100">{rule.title}</h3>
            <p className="mt-1 text-xs text-zinc-500">{rule.summary}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {rule.good.map((example) => (
                <code key={`${rule.title}-good-${example}`} className="rounded-md bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-300">
                  {example}
                </code>
              ))}
              {rule.bad?.map((example) => (
                <code key={`${rule.title}-bad-${example}`} className="rounded-md bg-red-500/10 px-2 py-1 text-[11px] text-red-300">
                  {example}
                </code>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
