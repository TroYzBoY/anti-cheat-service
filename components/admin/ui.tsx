export type Tone = "default" | "good" | "warn" | "bad" | "info" | "violet";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 pb-2">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-white">{title}</h1>
        {subtitle ? <p className="mt-2 max-w-2xl text-[15px] text-white/65">{subtitle}</p> : null}
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </header>
  );
}

const STAT_TONES: Record<Tone, string> = {
  default: "text-white",
  good: "text-emerald-300",
  warn: "text-amber-300",
  bad: "text-rose-300",
  info: "text-sky-300",
  violet: "text-violet-300",
};

export function StatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: Tone;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/50">{label}</p>
      <p className={`mt-2 text-3xl font-semibold tabular-nums ${STAT_TONES[tone]}`}>{value}</p>
    </div>
  );
}

export function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.03]">{children}</div>;
}

const PILL_TONES: Record<Tone, string> = {
  default: "bg-white/[0.06] text-white/70 border-white/10",
  good: "bg-emerald-500/10 text-emerald-300 border-emerald-400/30",
  warn: "bg-amber-500/10 text-amber-300 border-amber-400/30",
  bad: "bg-rose-500/10 text-rose-300 border-rose-400/30",
  info: "bg-sky-500/10 text-sky-300 border-sky-400/30",
  violet: "bg-violet-500/10 text-violet-300 border-violet-400/30",
};

export function Pill({ children, tone = "default" }: { children: React.ReactNode; tone?: Tone }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[13px] font-semibold ${PILL_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
      <p className="text-base font-medium text-white/80">{title}</p>
      {description ? <p className="mt-1 text-[13px] text-white/45">{description}</p> : null}
    </div>
  );
}

export const smallButton =
  "rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[12px] text-white/80 hover:bg-white/[0.08] hover:text-white";

/** Secondary action in a page header (edit, export…). */
export const headerButton =
  "rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-white/75 hover:bg-white/[0.08] hover:text-white";
