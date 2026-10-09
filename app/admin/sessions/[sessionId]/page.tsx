import Link from "next/link";
import { notFound } from "next/navigation";

import { AutoRefresh } from "@/components/admin/auto-refresh";
import { LogTable } from "@/components/admin/log-table";
import { Card, headerButton, PageHeader, Pill, StatCard } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth";
import {
  breakdownQuestions,
  choiceTag,
  countAnswered,
  describeClientInfo,
  describeEntry,
  describeUserAgent,
  excerpt,
  finalAnswers,
  formatDateTime,
  formatDuration,
  formatHistory,
  isLogCategory,
  LOG_CATEGORIES,
  LOG_CATEGORY_LABELS,
  logCategory,
  TERMINATION_REASON_LABELS,
  type LogEntry,
} from "@/lib/exam-activity";
import { UNANSWERED, type SessionQuestion } from "@/lib/exam-build";
import { CHOICE_LABELS, describeAttempt } from "@/lib/exam-forms";
import { loadLog } from "@/lib/exam-log";
import { MAX_FOCUS_LOSSES } from "@/lib/policy";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function isActivity(entry: LogEntry, ...types: string[]) {
  return entry.source === "activity" && types.includes(entry.type);
}

export default async function SessionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ filter?: string | string[] }>;
}) {
  await requireAdmin();
  const { sessionId } = await params;
  const { filter } = await searchParams;
  const session = await prisma.examSession.findUnique({
    where: { id: sessionId },
    include: {
      user: { select: { fullName: true, email: true } },
      exam: { select: { id: true, title: true } },
    },
  });
  if (!session) notFound();
  const { entries: log } = await loadLog({ sessionWhere: { id: session.id } });

  const nowMs = new Date().getTime();
  const view = describeAttempt(session, nowMs);
  const questions = session.questions as SessionQuestion[];
  const attempt = { questions, answerKey: session.answerKey };
  const answers = finalAnswers(session);
  const answered = countAnswered(answers);
  // Attempts from before autosave that never submitted kept no answers at all.
  const answersKnown =
    session.status === "SUBMITTED" || session.draftAnswers.length === questions.length;
  const breakdown = breakdownQuestions({
    answerKey: session.answerKey,
    finalAnswers: answers,
    startedAt: session.startedAt,
    log,
  });
  const startMs = session.startedAt.getTime();
  const sinceStart = (date: Date) => formatDuration(date.getTime() - startMs);
  const endMs = session.submittedAt?.getTime() ?? (view.running ? nowMs : null);

  const focusLosses = log.filter(
    (entry) => entry.source === "integrity" && entry.type === "focus-loss",
  ).length;
  const violations = log.filter((entry) => entry.source === "integrity").length;
  const changes = breakdown.reduce((sum, row) => sum + row.changes, 0);
  const visits = log.filter((entry) => isActivity(entry, "started", "resumed"));
  const outages = log.filter((entry) => isActivity(entry, "offline")).length;
  const offlineMs = log
    .filter((entry) => isActivity(entry, "online"))
    .reduce((sum, entry) => {
      const value = (entry.metadata as { offlineMs?: unknown } | null)?.offlineMs;
      return sum + (typeof value === "number" ? value : 0);
    }, 0);
  const ips = new Map<string, { first: Date; lines: number }>();
  for (const entry of log) {
    if (!entry.ip) continue;
    const known = ips.get(entry.ip);
    if (known) known.lines += 1;
    else ips.set(entry.ip, { first: entry.at, lines: 1 });
  }
  const hasActivity = log.some((entry) => entry.source === "activity");

  const category = isLogCategory(filter) ? filter : null;
  const lines = log
    .filter((entry) => category === null || logCategory(entry) === category)
    .map((entry) => ({
      entry,
      described: describeEntry(entry, attempt),
      offset: sinceStart(entry.at),
    }));
  const filterHref = (value: string | null) =>
    value ? `/admin/sessions/${session.id}?filter=${value}` : `/admin/sessions/${session.id}`;
  const chipClass = (selected: boolean) =>
    `rounded-full border px-3 py-1 text-[13px] font-semibold ${
      selected
        ? "border-violet-400/50 bg-violet-500/20 text-white"
        : "border-white/10 bg-white/[0.04] text-white/65 hover:text-white"
    }`;

  return (
    <>
      {view.running ? <AutoRefresh intervalMs={15_000} /> : null}
      <Link
        href={`/admin/exams/${session.exam.id}/results`}
        className="text-sm text-white/55 hover:text-white"
      >
        ← {session.exam.title} — үр дүн
      </Link>
      <PageHeader
        title={session.user.fullName}
        subtitle={session.user.email}
        action={
          <>
            <a href={`/api/admin/sessions/${session.id}/export?kind=answers`} className={headerButton}>
              ↓ Хариултууд (CSV)
            </a>
            <a href={`/api/admin/sessions/${session.id}/export?kind=log`} className={headerButton}>
              ↓ Лог (CSV)
            </a>
          </>
        }
      />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/50">Төлөв</p>
          <div className="mt-3">
            <Pill tone={view.tone}>{view.label}</Pill>
          </div>
          {session.terminationReason ? (
            <p className="mt-2 text-[13px] text-rose-200">
              {TERMINATION_REASON_LABELS[session.terminationReason] ?? session.terminationReason}
            </p>
          ) : null}
        </div>
        <StatCard
          label="Оноо"
          value={session.scorePercent === null ? "—" : `${session.scorePercent}%`}
          tone="violet"
        />
        <StatCard
          label="Зөв"
          value={session.correctCount === null ? "—" : `${session.correctCount}/${questions.length}`}
        />
        <StatCard label="Хариулсан" value={`${answered}/${questions.length}`} tone="info" />
        <StatCard
          label="Зарцуулсан хугацаа"
          value={endMs === null ? "—" : formatDuration(endMs - startMs)}
        />
        <StatCard
          label="Хариулт өөрчилсөн"
          value={changes}
          tone={changes > 0 ? "warn" : "default"}
        />
        <StatCard
          label="Focus алдсан"
          value={`${focusLosses}/${MAX_FOCUS_LOSSES}`}
          tone={focusLosses >= MAX_FOCUS_LOSSES ? "bad" : focusLosses > 0 ? "warn" : "default"}
        />
        <StatCard label="Зөрчил (бүгд)" value={violations} tone={violations > 0 ? "bad" : "default"} />
      </section>

      <p className="text-[13px] text-white/50">
        Эхэлсэн: {formatDateTime(session.startedAt)} · Дуусах ёстой:{" "}
        {formatDateTime(session.expiresAt)} · Дууссан: {formatDateTime(session.submittedAt) || "—"}
        {session.lastSeenAt ? ` · Сүүлд идэвхтэй: ${formatDateTime(session.lastSeenAt)}` : ""}
      </p>

      <h2 className="pt-2 text-lg font-semibold text-white">Төхөөрөмж ба холболт</h2>
      <Card>
        {!hasActivity ? (
          <p className="p-4 text-sm text-white/50">
            Энэ оролдлого дэлгэрэнгүй лог нэмэгдэхээс өмнө эхэлсэн тул төхөөрөмж, IP, хариулт
            сонгосон түүх бүртгэгдээгүй.
          </p>
        ) : (
          <dl className="grid gap-x-6 gap-y-4 p-4 text-sm md:grid-cols-[180px_1fr]">
            <dt className="text-white/50">IP хаяг</dt>
            <dd>
              {[...ips].map(([ip, info]) => (
                <p key={ip} className="font-mono text-[13px] text-white/85">
                  {ip}
                  <span className="ml-2 font-sans text-[12px] text-white/45">
                    анх {formatDateTime(info.first)} · {info.lines} үйлдэл
                  </span>
                </p>
              ))}
              {ips.size > 1 ? (
                <p className="mt-1 text-[12px] font-semibold text-amber-300">
                  ⚠ Шалгалтын явцад {ips.size} өөр IP хаягаас хандсан
                </p>
              ) : null}
            </dd>

            <dt className="text-white/50">Нээсэн төхөөрөмж</dt>
            <dd className="space-y-2">
              {visits.map((visit) => (
                <div key={visit.id}>
                  <p className="text-white/85">
                    <span className="font-mono text-[12px] text-white/50">
                      {formatDateTime(visit.at)}
                    </span>{" "}
                    {visit.type === "started" ? "Эхлүүлсэн" : "Дахин нээсэн"} ·{" "}
                    {describeUserAgent(visit.userAgent)}
                    {visit.ip ? <span className="font-mono text-[12px] text-white/45"> · {visit.ip}</span> : null}
                  </p>
                  {describeClientInfo(visit.metadata) ? (
                    <p className="text-[12px] text-white/45">{describeClientInfo(visit.metadata)}</p>
                  ) : null}
                  {visit.userAgent ? (
                    <p className="break-all font-mono text-[11px] text-white/30">{visit.userAgent}</p>
                  ) : null}
                </div>
              ))}
            </dd>

            <dt className="text-white/50">Дахин нээсэн</dt>
            <dd className={visits.length > 1 ? "text-amber-200" : "text-white/85"}>
              {Math.max(0, visits.length - 1)} удаа
            </dd>

            <dt className="text-white/50">Интернэт тасалдал</dt>
            <dd className={outages > 0 ? "text-amber-200" : "text-white/85"}>
              {outages === 0 ? "Тасраагүй" : `${outages} удаа · нийт ${formatDuration(offlineMs)}`}
            </dd>
          </dl>
        )}
      </Card>

      <h2 className="pt-2 text-lg font-semibold text-white">Асуулт бүрийн дэлгэрэнгүй</h2>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.04] text-left text-[11px] uppercase tracking-wider text-white/45">
              <tr>
                <th className="px-4 py-3 font-medium">№</th>
                <th className="px-4 py-3 font-medium">Асуулт</th>
                <th className="px-4 py-3 font-medium">Сонгосон</th>
                <th className="px-4 py-3 font-medium">Зөв хариулт</th>
                <th className="px-4 py-3 font-medium" title="Шалгалт эхэлснээс хойш">
                  Анх хариулсан
                </th>
                <th className="px-4 py-3 text-right font-medium">Өөрчилсөн</th>
                <th
                  className="px-4 py-3 font-medium"
                  title="Өмнөх хариултаас хойш энэ асуултад хариулах хүртэлх хугацаа (ойролцоо)"
                >
                  Хугацаа ≈
                </th>
                <th className="px-4 py-3 font-medium">Сонголтын түүх</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.map((row) => {
                const question = questions[row.index];
                return (
                  <tr key={row.index} className="border-t border-white/[0.06] align-top">
                    <td className="px-4 py-2 font-mono text-white/55">{row.index + 1}</td>
                    <td className="max-w-[280px] px-4 py-2 text-white/80" title={question?.prompt}>
                      {excerpt(question?.prompt ?? "", 70)}
                    </td>
                    <td
                      className={`px-4 py-2 ${
                        !answersKnown
                          ? "text-white/40"
                          : row.final === UNANSWERED
                            ? "text-amber-200"
                            : row.correct
                              ? "text-emerald-200"
                              : "text-rose-200"
                      }`}
                    >
                      {!answersKnown
                        ? "—"
                        : row.final === UNANSWERED
                          ? "Хариулаагүй"
                          : `${row.correct ? "✓" : "✗"} ${choiceTag(question, row.final)}`}
                    </td>
                    <td className="px-4 py-2 text-white/60">
                      {choiceTag(question, session.answerKey[row.index] ?? null)}
                    </td>
                    <td
                      className="whitespace-nowrap px-4 py-2 font-mono text-[12px] text-white/55"
                      title={formatDateTime(row.firstAnsweredAt)}
                    >
                      {row.firstAnsweredAt ? `+${sinceStart(row.firstAnsweredAt)}` : "—"}
                    </td>
                    <td
                      className={`px-4 py-2 text-right font-mono ${
                        row.changes >= 2 ? "text-amber-200" : "text-white/60"
                      }`}
                    >
                      {row.changes}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 font-mono text-[12px] text-white/55">
                      {row.history.length > 0 ? formatDuration(row.timeSpentMs) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-white/60">
                      {formatHistory(row.history) || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <h2 className="text-lg font-semibold text-white">Үйлдлийн бүрэн түүх</h2>
        <nav className="flex flex-wrap gap-2">
          <Link href={filterHref(null)} scroll={false} className={chipClass(category === null)}>
            Бүгд ({log.length})
          </Link>
          {LOG_CATEGORIES.map((value) => (
            <Link
              key={value}
              href={filterHref(value)}
              scroll={false}
              className={chipClass(category === value)}
            >
              {LOG_CATEGORY_LABELS[value]} (
              {log.filter((entry) => logCategory(entry) === value).length})
            </Link>
          ))}
        </nav>
      </div>
      <Card>
        <LogTable lines={lines} empty="Энэ ангилалд бүртгэл алга." />
      </Card>

      <h2 className="pt-2 text-lg font-semibold text-white">Асуулт ба хариултууд</h2>
      {session.status !== "SUBMITTED" && answered > 0 ? (
        <p className="text-[13px] text-white/50">
          Шалгалт илгээгдээгүй тул автоматаар хадгалагдсан сүүлийн сонголтуудыг харуулж байна.
        </p>
      ) : null}
      <div className="space-y-3">
        {questions.map((question, index) => {
          const given = answers[index] ?? UNANSWERED;
          const correct = session.answerKey[index];
          return (
            <Card key={question.id}>
              <div className="p-4">
                <p className="whitespace-pre-wrap font-medium text-white">
                  <span className="mr-2 text-violet-300">{index + 1}.</span>
                  {question.prompt}
                </p>
                <ul className="mt-3 space-y-1 text-sm">
                  {question.choices.map((choice, choiceIndex) => {
                    const isCorrect = choiceIndex === correct;
                    const isGiven = choiceIndex === given;
                    return (
                      <li
                        key={choiceIndex}
                        className={`whitespace-pre-wrap rounded-lg px-3 py-1.5 ${
                          isCorrect
                            ? "bg-emerald-500/10 text-emerald-200"
                            : isGiven
                              ? "bg-rose-500/10 text-rose-200"
                              : "text-white/65"
                        }`}
                      >
                        {CHOICE_LABELS[choiceIndex]}. {choice}
                        {isGiven ? " ← сонгосон" : ""}
                        {isCorrect ? " ✓" : ""}
                      </li>
                    );
                  })}
                </ul>
                {answersKnown && !view.running && given === UNANSWERED ? (
                  <p className="mt-2 text-xs text-amber-200">Хариулаагүй</p>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
