import Link from "next/link";

import { Pill, type Tone } from "@/components/admin/ui";
import {
  formatDateTime,
  LOG_CATEGORY_LABELS,
  type DescribedEntry,
  type LogCategory,
  type LogEntry,
} from "@/lib/exam-activity";

const CATEGORY_TONE: Record<LogCategory, Tone> = {
  answer: "violet",
  violation: "bad",
  session: "info",
  network: "warn",
};

export type LogLine = {
  entry: LogEntry;
  described: DescribedEntry;
  /** "12:05" since the attempt started. */
  offset: string | null;
  /** Set on the exam-wide log, where lines of many learners mix. */
  learner?: { name: string; sessionId: string };
};

/** The admin's log of one attempt or of a whole exam. */
export function LogTable({ lines, empty }: { lines: LogLine[]; empty: string }) {
  if (lines.length === 0) return <p className="p-4 text-sm text-white/50">{empty}</p>;
  const withLearner = lines.some((line) => line.learner);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-white/[0.04] text-left text-[11px] uppercase tracking-wider text-white/45">
          <tr>
            <th className="px-4 py-3 font-medium">Цаг</th>
            <th className="px-4 py-3 font-medium" title="Шалгалт эхэлснээс хойш">
              Эхэлснээс
            </th>
            {withLearner ? <th className="px-4 py-3 font-medium">Оролцогч</th> : null}
            <th className="px-4 py-3 font-medium">Ангилал</th>
            <th className="px-4 py-3 font-medium">Үйлдэл</th>
            <th className="px-4 py-3 font-medium">Дэлгэрэнгүй</th>
            <th className="px-4 py-3 font-medium">IP</th>
          </tr>
        </thead>
        <tbody>
          {lines.map(({ entry, described, offset, learner }) => (
            <tr
              key={`${entry.source}-${entry.id}`}
              className={`border-t border-white/[0.06] align-top ${
                described.category === "violation" ? "bg-rose-500/[0.06]" : "hover:bg-white/[0.02]"
              }`}
            >
              <td className="whitespace-nowrap px-4 py-2 font-mono text-[12px] text-white/55">
                {formatDateTime(entry.at)}
              </td>
              <td className="whitespace-nowrap px-4 py-2 font-mono text-[12px] text-white/45">
                {offset ? `+${offset}` : ""}
              </td>
              {withLearner ? (
                <td className="whitespace-nowrap px-4 py-2">
                  {learner ? (
                    <Link
                      href={`/admin/sessions/${learner.sessionId}`}
                      className="text-white hover:text-violet-300 hover:underline"
                    >
                      {learner.name}
                    </Link>
                  ) : null}
                </td>
              ) : null}
              <td className="px-4 py-2">
                <Pill tone={CATEGORY_TONE[described.category]}>
                  {LOG_CATEGORY_LABELS[described.category]}
                </Pill>
              </td>
              <td className="px-4 py-2 font-medium text-white">{described.label}</td>
              <td className="px-4 py-2 text-[13px] text-white/70">
                <span className="whitespace-pre-wrap break-words">{described.detail}</span>
                {described.correct !== null ? (
                  <span
                    className={`ml-2 whitespace-nowrap text-[12px] font-semibold ${
                      described.correct ? "text-emerald-300" : "text-rose-300"
                    }`}
                  >
                    {described.correct ? "✓ зөв" : "✗ буруу"}
                  </span>
                ) : null}
              </td>
              <td className="whitespace-nowrap px-4 py-2 font-mono text-[12px] text-white/45">
                {entry.ip ?? ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
