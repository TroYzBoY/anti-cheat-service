"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { loadAntiCheatSdk } from "@/lib/anti-cheat-sdk";
import type { SessionQuestion } from "@/lib/exam-build";
import { CHOICE_LABELS } from "@/lib/exam-forms";
import type {
  AntiCheatSdk,
  AntiCheatSession,
  FullscreenState,
  Termination,
} from "@/sdk/types";

type AntiCheatTerminationReason = Termination["reason"];

/** Safe Exam Browser's JavaScript API (SEB 3.x on Windows, macOS, iOS). */
type SebApi = {
  security?: { configKey?: string; updateKeys?: (callback: () => void) => void };
};

function sebApi(): SebApi | undefined {
  return (window as Window & { SafeExamBrowser?: SebApi }).SafeExamBrowser;
}

function detectSeb() {
  return Boolean(sebApi()) || /\bSEB\//.test(navigator.userAgent);
}

const noSubscribe = () => () => undefined;

/**
 * What the server checks to confirm Safe Exam Browser: SEB's Config Key hash
 * for this page URL. `updateKeys` refreshes it after client-side navigation.
 */
async function sebProof(): Promise<{ configKeyHash: string; url: string } | null> {
  const security = sebApi()?.security;
  if (!security) return null;
  if (security.updateKeys) {
    await new Promise<void>((resolve) => {
      const timeout = window.setTimeout(resolve, 2000);
      security.updateKeys!(() => {
        window.clearTimeout(timeout);
        resolve();
      });
    });
  }
  return typeof security.configKey === "string"
    ? { configKeyHash: security.configKey, url: window.location.href.split("#")[0] }
    : null;
}

export type ExamSummary = {
  id: string;
  title: string;
  description: string;
  durationMinutes: number;
  passPercent: number;
  questionCount: number;
};

type Phase = "intro" | "starting" | "active" | "submitting" | "done" | "terminated";

type SdkState =
  | { status: "loading" }
  | { status: "ready"; sdk: AntiCheatSdk }
  | { status: "error"; message: string };

type Result = {
  correct: number;
  total: number;
  scorePercent: number;
  passPercent: number;
  passed: boolean;
};

const UNANSWERED = -1;

function storageKey(sessionId: string) {
  return `codequest.exam-form.${sessionId}`;
}

function readSavedAnswers(sessionId: string, count: number): number[] {
  const blank = Array.from({ length: count }, () => UNANSWERED);
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(storageKey(sessionId)) ?? "null");
    if (
      Array.isArray(parsed) &&
      parsed.length === count &&
      parsed.every((value) => Number.isInteger(value))
    ) {
      return parsed as number[];
    }
  } catch {
    /* private mode / corrupt value — start blank */
  }
  return blank;
}

function saveAnswers(sessionId: string, answers: number[]) {
  try {
    localStorage.setItem(storageKey(sessionId), JSON.stringify(answers));
  } catch {
    /* storage unavailable — answers still live in memory */
  }
}

function clearSavedAnswers(sessionId: string | null) {
  if (!sessionId) return;
  try {
    localStorage.removeItem(storageKey(sessionId));
  } catch {
    /* ignore */
  }
}

function exitFullscreen() {
  if (typeof document !== "undefined" && document.fullscreenElement) {
    void document.exitFullscreen().catch(() => undefined);
  }
}

function formatRemaining(ms: number) {
  const totalSeconds = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(hours > 0 ? 2 : 1, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

function terminationText(
  reason: AntiCheatTerminationReason,
  limits: { focus: number; fullscreen: number },
) {
  switch (reason) {
    case "focus-loss-limit":
      return `Та шалгалтын цонхноос ${limits.focus} удаа гарсан тул шалгалтаас хасагдлаа (ban).`;
    case "fullscreen-exit-limit":
      return `Fullscreen горимоос ${limits.fullscreen} удаа гарсан тул шалгалтаас хасагдлаа (ban).`;
    case "devtools":
      return "Developer tools нээгдсэн тул шалгалт цуцлагдлаа.";
    case "duplicate-tab":
      return "Шалгалтыг өөр tab-д давхар нээсэн тул цуцлагдлаа.";
    case "fetch-mitm":
    case "overlay-tampered":
      return "Хуудсанд гадны өөрчлөлт (extension гэх мэт) илэрсэн тул шалгалт цуцлагдлаа.";
    case "screenshot":
      return "Дэлгэцийн зураг (Print Screen) авах оролдлого илэрсэн тул шалгалтаас хасагдлаа (ban).";
    case "session-terminated":
      return "Энэ шалгалт аль хэдийн дууссан эсвэл цуцлагдсан байна.";
  }
}

export function ExamRunner({
  exam,
  seb,
  resumable,
}: {
  exam: ExamSummary;
  /** Safe Exam Browser requirement for this exam. */
  seb: { required: boolean; hasConfigFile: boolean };
  /** The learner already has a running attempt (e.g. after a reload). */
  resumable: boolean;
}) {
  const router = useRouter();
  // False on the server; read from the browser after hydration.
  const inSeb = useSyncExternalStore(noSubscribe, detectSeb, () => false);
  const [sdkState, setSdkState] = useState<SdkState>({ status: "loading" });
  const [loadAttempt, setLoadAttempt] = useState(0);

  const [phase, setPhase] = useState<Phase>("intro");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<SessionQuestion[]>([]);
  const [answers, setAnswers] = useState<number[]>([]);
  const [expiresAtMs, setExpiresAtMs] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [focusLosses, setFocusLosses] = useState(0);
  const [fullscreenExits, setFullscreenExits] = useState(0);
  const [warning, setWarning] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState<FullscreenState>({
    active: false,
    supported: true,
  });
  const [termination, setTermination] =
    useState<AntiCheatTerminationReason | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);

  const acSessionRef = useRef<AntiCheatSession | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const answersRef = useRef<number[]>([]);
  const submittingRef = useRef(false);
  const autoSubmittedRef = useRef(false);
  const submitRef = useRef<(auto: boolean) => void>(() => undefined);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const sdk = sdkState.status === "ready" ? sdkState.sdk : null;
  const limits = {
    focus: sdk?.policy.maxFocusLosses ?? 3,
    fullscreen: sdk?.policy.maxFullscreenExits ?? 3,
  };

  useEffect(() => {
    let cancelled = false;
    loadAntiCheatSdk().then(
      (loaded) => {
        if (!cancelled) setSdkState({ status: "ready", sdk: loaded });
      },
      (loadError: unknown) => {
        if (cancelled) return;
        setSdkState({
          status: "error",
          message:
            loadError instanceof Error
              ? loadError.message
              : "Хамгаалалтын модулийг ачаалж чадсангүй.",
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  useEffect(() => {
    if (!sdk) return;
    return sdk.watchFullscreen((state) => setFullscreen(state));
  }, [sdk]);

  // Detectors run only while the learner is answering; a failed submit
  // re-arms them with the counters intact.
  useEffect(() => {
    const session = acSessionRef.current;
    if (!session || phase !== "active") return;
    session.arm();
    return () => session.disarm();
  }, [phase]);

  // Block copy / paste / context menu over the questions.
  useEffect(() => {
    const element = containerRef.current;
    if (!sdk || !element || phase !== "active") return;
    return sdk.hardenElement(element);
  }, [sdk, phase]);

  // Once the attempt is over, drop the SDK session (which also gives the
  // keyboard back). Fullscreen stays until the learner presses the button.
  useEffect(() => {
    if (phase !== "done" && phase !== "terminated") return;
    acSessionRef.current?.destroy();
    acSessionRef.current = null;
  }, [phase]);

  useEffect(
    () => () => {
      acSessionRef.current?.destroy();
      acSessionRef.current = null;
    },
    [],
  );

  // Countdown; auto-submits once when the clock reaches zero.
  useEffect(() => {
    if (expiresAtMs === null || (phase !== "active" && phase !== "submitting")) {
      return;
    }
    const id = window.setInterval(() => {
      const remaining = Math.max(0, expiresAtMs - Date.now());
      setRemainingMs(remaining);
      if (remaining === 0 && !autoSubmittedRef.current) {
        autoSubmittedRef.current = true;
        submitRef.current(true);
      }
    }, 500);
    return () => window.clearInterval(id);
  }, [expiresAtMs, phase]);

  const finishTerminated = useCallback(
    (reason: AntiCheatTerminationReason) => {
      clearSavedAnswers(sessionIdRef.current);
      setTermination(reason);
      setPhase("terminated");
    },
    [],
  );

  const start = async () => {
    if (!sdk || phase !== "intro") return;
    setError(null);
    setWarning(null);
    setPhase("starting");

    // Must run inside the click's user activation, before any network wait.
    // SEB is already a locked-down full-screen kiosk.
    const fullscreenRequest = inSeb ? null : await sdk.requestFullscreen();
    if (fullscreenRequest?.blocked && fullscreenRequest.state.supported) {
      setError(
        "Fullscreen горимд орж чадсангүй. Browser-ийн зөвшөөрлийг шалгаад дахин оролдоно уу.",
      );
      setPhase("intro");
      return;
    }

    let data: Record<string, unknown> | null = null;
    try {
      const res = await fetch(`/api/exams/${exam.id}/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seb: await sebProof() }),
      });
      data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok || !data?.ok) {
        exitFullscreen();
        setError(
          typeof data?.message === "string"
            ? data.message
            : "Шалгалтыг эхлүүлж чадсангүй.",
        );
        setPhase("intro");
        if (data?.code === "EXAM_ALREADY_TAKEN") router.refresh();
        return;
      }
    } catch {
      exitFullscreen();
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
      setPhase("intro");
      return;
    }

    const token = (data.antiCheat as { token?: unknown } | undefined)?.token;
    const newSessionId = data.sessionId;
    if (typeof token !== "string" || typeof newSessionId !== "string") {
      exitFullscreen();
      setError("Сервер буруу хариу өглөө. Дахин оролдоно уу.");
      setPhase("intro");
      return;
    }

    const mcqs = data.questions as SessionQuestion[];
    const baseFocus = typeof data.focusLosses === "number" ? data.focusLosses : 0;
    const baseFullscreen =
      typeof data.fullscreenExits === "number" ? data.fullscreenExits : 0;

    acSessionRef.current?.destroy();
    acSessionRef.current = sdk.createSession({
      sessionId: newSessionId,
      token,
      onTerminate: ({ reason }) => finishTerminated(reason),
      onFocusLoss: ({ count, limit }) => {
        const total = Math.min(limit, baseFocus + count);
        setFocusLosses(total);
        setWarning(
          `Анхаар! Та шалгалтын цонхноос гарлаа (${total}/${limit}). ${limit} хүрвэл шалгалтаас хасагдана.`,
        );
      },
      onFullscreenExit: ({ count, limit }) => {
        const total = Math.min(limit, baseFullscreen + count);
        setFullscreenExits(total);
        setWarning(
          `Анхаар! Та fullscreen горимоос гарлаа (${total}/${limit}). Fullscreen руу буцна уу.`,
        );
      },
    });

    const restored = readSavedAnswers(newSessionId, mcqs.length);
    answersRef.current = restored;
    autoSubmittedRef.current = false;
    const expires = new Date(String(data.expiresAt)).getTime();
    sessionIdRef.current = newSessionId;
    setSessionId(newSessionId);
    setQuestions(mcqs);
    setAnswers(restored);
    setFocusLosses(baseFocus);
    setFullscreenExits(baseFullscreen);
    setExpiresAtMs(expires);
    setRemainingMs(Math.max(0, expires - new Date().getTime()));
    setPhase("active");
  };

  const choose = (questionIndex: number, choiceIndex: number) => {
    if (phase !== "active" || !sessionId) return;
    const next = [...answersRef.current];
    next[questionIndex] = choiceIndex;
    answersRef.current = next;
    setAnswers(next);
    saveAnswers(sessionId, next);
  };

  const submit = useCallback(
    async (auto: boolean) => {
      if (submittingRef.current || !sessionId) return;
      submittingRef.current = true;
      setConfirmingSubmit(false);
      setError(null);
      setPhase("submitting");
      try {
        const res = await fetch("/api/exams/submit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sessionId,
            answers: answersRef.current,
            seb: await sebProof(),
          }),
        });
        const data = (await res.json().catch(() => null)) as Record<
          string,
          unknown
        > | null;

        if (res.ok && data?.ok) {
          clearSavedAnswers(sessionId);
          setResult({
            correct: Number(data.correct ?? 0),
            total: Number(data.total ?? questions.length),
            scorePercent: Number(data.scorePercent ?? 0),
            passPercent: Number(data.passPercent ?? exam.passPercent),
            passed: data.passed === true,
          });
          setPhase("done");
          return;
        }
        if (data?.expired === true) {
          clearSavedAnswers(sessionId);
          setResult({
            correct: 0,
            total: questions.length,
            scorePercent: 0,
            passPercent: exam.passPercent,
            passed: false,
          });
          setPhase("done");
          return;
        }
        if (res.status === 409) {
          finishTerminated("session-terminated");
          return;
        }
        setError(
          typeof data?.message === "string"
            ? data.message
            : "Илгээж чадсангүй. Дахин оролдоно уу.",
        );
        setPhase("active");
      } catch {
        setError(
          auto
            ? "Хугацаа дууслаа, гэвч сүлжээний алдаанаас болж илгээж чадсангүй. «Илгээх» товчийг дарна уу."
            : "Сүлжээний алдаа гарлаа. Дахин илгээнэ үү.",
        );
        setPhase("active");
      } finally {
        submittingRef.current = false;
      }
    },
    [sessionId, questions.length, exam.passPercent, finishTerminated],
  );

  useEffect(() => {
    submitRef.current = (auto) => void submit(auto);
  }, [submit]);

  const answeredCount = answers.filter((answer) => answer !== UNANSWERED).length;
  const unansweredCount = questions.length - answeredCount;

  // ── Finished screens ────────────────────────────────────────────────────

  if (phase === "terminated" && termination) {
    return (
      <CenteredCard>
        <p className="text-[11px] font-black uppercase tracking-[0.24em] text-rose-300">
          Шалгалт цуцлагдлаа
        </p>
        <h1 className="mt-2 text-2xl font-bold text-white">{exam.title}</h1>
        <p className="mt-4 rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 text-rose-100">
          {terminationText(termination, limits)}
        </p>
        <p className="mt-3 text-sm text-white/55">
          Энэ шалгалтыг дахин өгөх боломжгүй. Алдаа гарсан гэж үзвэл админд хандана уу.
        </p>
        <FinishedActions inFullscreen={fullscreen.active} />
      </CenteredCard>
    );
  }

  if (phase === "done" && result) {
    return (
      <CenteredCard>
        <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[#a78bfa]">
          Шалгалт илгээгдлээ
        </p>
        <h1 className="mt-2 text-2xl font-bold text-white">{exam.title}</h1>
        <div className="mt-6 flex items-end gap-3">
          <span
            className={`text-6xl font-black tabular-nums ${
              result.passed ? "text-emerald-300" : "text-amber-300"
            }`}
          >
            {result.scorePercent}%
          </span>
          <span className="pb-2 text-white/60">
            {result.correct}/{result.total} зөв
          </span>
        </div>
        <p
          className={`mt-4 inline-flex rounded-full border px-3 py-1 text-sm font-bold ${
            result.passed
              ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
              : "border-amber-400/30 bg-amber-500/10 text-amber-200"
          }`}
        >
          {result.passed
            ? `Тэнцлээ (босго ${result.passPercent}%)`
            : `Тэнцсэнгүй (босго ${result.passPercent}%)`}
        </p>
        <FinishedActions inFullscreen={fullscreen.active} />
      </CenteredCard>
    );
  }

  // ── Intro ───────────────────────────────────────────────────────────────

  if (phase === "intro" || phase === "starting") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 text-[#ecedf6]">
        <Link href="/exams" className="text-sm text-white/55 hover:text-white">
          ← Шалгалтын жагсаалт
        </Link>
        <div className="mt-4 rounded-3xl border border-white/10 bg-white/[0.03] p-6 md:p-8">
          <h1 className="text-3xl font-bold text-white">{exam.title}</h1>
          {exam.description ? (
            <p className="mt-3 whitespace-pre-wrap text-white/70">{exam.description}</p>
          ) : null}
          <div className="mt-6 grid grid-cols-3 gap-3 text-center">
            <Stat label="Асуулт" value={exam.questionCount} />
            <Stat label="Хугацаа" value={`${exam.durationMinutes} мин`} />
            <Stat label="Тэнцэх" value={`${exam.passPercent}%`} />
          </div>

          <div className="mt-6 rounded-2xl border border-amber-400/25 bg-amber-500/[0.07] p-5">
            <p className="font-bold text-amber-200">Шалгалтын дүрэм</p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-white/80">
              {seb.required ? (
                <li>
                  Энэ шалгалтыг зөвхөн <strong>Safe Exam Browser (SEB)</strong>-ээр өгнө.
                </li>
              ) : null}
              <li>Шалгалт fullscreen горимд явагдана.</li>
              <li>
                Шалгалтын үеэр <strong>гарын товчлуур ажиллахгүй</strong> — хариултаа
                хулганаар сонгоно.
              </li>
              <li>
                <strong>Print Screen</strong> дарах эсвэл дэлгэцийн зураг авах оролдлого
                илэрвэл шууд хасагдана (ban).
              </li>
              <li>
                Өөр цонх, tab руу шилжих эсвэл browser-оос гарах бүр тоологдоно.{" "}
                <strong className="text-amber-200">
                  {limits.focus} удаа гарвал шууд хасагдана (ban).
                </strong>
              </li>
              <li>Fullscreen-ээс {limits.fullscreen} удаа гарвал мөн хасагдана.</li>
              <li>
                Developer tools нээх, өөр tab-д давхар нээх, хуулах/буулгах хориотой —
                илэрвэл шалгалт шууд цуцлагдана.
              </li>
              <li>
                Зөвхөн <strong>1 удаа</strong> өгөх боломжтой. Хугацаа дуусахад
                хариултууд автоматаар илгээгдэнэ.
              </li>
            </ul>
          </div>

          {sdkState.status === "error" ? (
            <div className="mt-5 rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100">
              <p>{sdkState.message}</p>
              <button
                type="button"
                onClick={() => {
                  setSdkState({ status: "loading" });
                  setLoadAttempt((n) => n + 1);
                }}
                className="mt-3 rounded-lg bg-rose-500/20 px-3 py-1.5 font-semibold hover:bg-rose-500/30"
              >
                Дахин оролдох
              </button>
            </div>
          ) : null}

          {error ? (
            <p className="mt-5 rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100">
              {error}
            </p>
          ) : null}

          {seb.required && !inSeb ? (
            <div className="mt-6 rounded-2xl border border-violet-400/30 bg-violet-500/[0.08] p-5 text-sm text-white/85">
              <p className="font-bold text-white">Safe Exam Browser шаардлагатай</p>
              <ol className="mt-3 list-decimal space-y-1.5 pl-5">
                <li>
                  Safe Exam Browser-ийг{" "}
                  <a
                    href="https://safeexambrowser.org/download_en.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-violet-300 underline"
                  >
                    safeexambrowser.org
                  </a>{" "}
                  сайтаас татаж суулгана (Windows, macOS, iPad).
                </li>
                <li>
                  {seb.hasConfigFile
                    ? "Доорх товчоор шалгалтын тохиргоог татаж нээнэ — SEB энэ шалгалтыг шууд нээнэ."
                    : "Админаас авсан .seb тохиргооны файлыг нээнэ — SEB энэ шалгалтыг шууд нээнэ."}
                </li>
                <li>SEB дотор дахин нэвтэрч, шалгалтаа эхлүүлнэ.</li>
              </ol>
              {seb.hasConfigFile ? (
                <a
                  href={`/exams/${exam.id}/seb`}
                  className="mt-4 inline-flex rounded-xl bg-violet-600 px-4 py-2.5 font-bold text-white hover:bg-violet-500"
                >
                  ↓ SEB тохиргоо татах (.seb)
                </a>
              ) : null}
            </div>
          ) : (
            <>
              <label className="mt-6 flex cursor-pointer items-start gap-3 text-sm text-white/85">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(event) => setAgreed(event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[#7c3aed]"
                />
                <span>Дүрмийг уншиж танилцсан бөгөөд зөвшөөрч байна.</span>
              </label>

              <button
                type="button"
                onClick={() => void start()}
                disabled={!agreed || !sdk || phase === "starting"}
                className="mt-5 w-full rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-3.5 text-lg font-bold text-white shadow-lg shadow-violet-900/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {phase === "starting"
                  ? "Эхлүүлж байна…"
                  : sdkState.status === "loading"
                    ? "Хамгаалалтын сервист холбогдож байна…"
                    : resumable
                      ? "Шалгалтаа үргэлжлүүлэх"
                      : "Шалгалт эхлүүлэх"}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Active exam ─────────────────────────────────────────────────────────

  const lowTime = remainingMs !== null && remainingMs <= 60_000;
  const needsFullscreen =
    phase === "active" && !inSeb && fullscreen.supported && !fullscreen.active;

  return (
    <div className="min-h-screen bg-[#070a12] text-[#ecedf6]">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0b0e18]/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <p className="min-w-0 flex-1 truncate font-bold text-white">{exam.title}</p>
          <div className="flex items-center gap-2 text-sm">
            <span className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 tabular-nums text-white/75">
              {answeredCount}/{questions.length} хариулсан
            </span>
            <span
              className={`rounded-lg border px-2.5 py-1 tabular-nums font-semibold ${
                focusLosses === 0
                  ? "border-white/10 bg-white/[0.04] text-white/75"
                  : focusLosses >= limits.focus - 1
                    ? "border-rose-400/40 bg-rose-500/15 text-rose-200"
                    : "border-amber-400/40 bg-amber-500/15 text-amber-200"
              }`}
              title="Шалгалтын цонхноос гарсан тоо"
            >
              Focus {focusLosses}/{limits.focus}
            </span>
            {remainingMs !== null ? (
              <span
                className={`rounded-lg border px-2.5 py-1 font-mono text-base font-bold tabular-nums ${
                  lowTime
                    ? "border-rose-400/40 bg-rose-500/15 text-rose-200"
                    : "border-white/10 bg-white/[0.04] text-white"
                }`}
              >
                {formatRemaining(remainingMs)}
              </span>
            ) : null}
          </div>
        </div>
        {warning ? (
          <div className="border-t border-amber-400/20 bg-amber-500/10">
            <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-2 text-sm text-amber-100">
              <span>{warning}</span>
              <button
                type="button"
                onClick={() => setWarning(null)}
                className="shrink-0 rounded-md px-2 py-0.5 text-amber-200 hover:bg-amber-500/20"
                aria-label="Хаах"
              >
                ✕
              </button>
            </div>
          </div>
        ) : null}
      </header>

      {needsFullscreen && sdk ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#070a12]/95 px-4">
          <div className="max-w-md rounded-2xl border border-amber-400/30 bg-[#11131f] p-6 text-center">
            <p className="text-lg font-bold text-amber-200">Fullscreen горимоос гарсан байна</p>
            <p className="mt-2 text-sm text-white/70">
              Шалгалтыг үргэлжлүүлэхийн тулд fullscreen руу буцна уу. Fullscreen-ээс гарсан
              тоо: {fullscreenExits}/{limits.fullscreen}.
            </p>
            <button
              type="button"
              onClick={() => void sdk.requestFullscreen()}
              className="mt-5 rounded-xl bg-violet-600 px-5 py-2.5 font-bold text-white hover:bg-violet-500"
            >
              Fullscreen руу буцах
            </button>
          </div>
        </div>
      ) : null}

      <main ref={containerRef} className="mx-auto max-w-3xl space-y-4 px-4 py-6 select-none">
        {questions.map((question, questionIndex) => (
          <section
            key={question.id}
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
          >
            <p className="whitespace-pre-wrap break-words text-[17px] font-semibold text-white">
              <span className="mr-2 text-[#a78bfa]">{questionIndex + 1}.</span>
              {question.prompt}
            </p>
            <div role="radiogroup" className="mt-4 space-y-2">
              {question.choices.map((choice, choiceIndex) => {
                const selected = answers[questionIndex] === choiceIndex;
                return (
                  <button
                    key={choiceIndex}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={phase !== "active"}
                    onClick={() => choose(questionIndex, choiceIndex)}
                    className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition ${
                      selected
                        ? "border-violet-400/60 bg-violet-500/15 text-white"
                        : "border-white/10 bg-white/[0.02] text-white/85 hover:border-white/25 hover:bg-white/[0.05]"
                    }`}
                  >
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                        selected
                          ? "border-violet-300 bg-violet-500 text-white"
                          : "border-white/25 text-white/60"
                      }`}
                    >
                      {CHOICE_LABELS[choiceIndex] ?? choiceIndex + 1}
                    </span>
                    <span className="whitespace-pre-wrap break-words">{choice}</span>
                  </button>
                );
              })}
            </div>
            {answers[questionIndex] !== UNANSWERED && phase === "active" ? (
              <button
                type="button"
                onClick={() => choose(questionIndex, UNANSWERED)}
                className="mt-2 text-xs text-white/45 hover:text-white/75"
              >
                Хариултаа арилгах
              </button>
            ) : null}
          </section>
        ))}

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          {error ? (
            <p className="mb-4 rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">
              {error}
            </p>
          ) : null}
          {confirmingSubmit ? (
            <div className="space-y-3">
              <p className="text-sm text-white/80">
                {unansweredCount > 0
                  ? `${unansweredCount} асуултад хариулаагүй байна. Илгээсний дараа өөрчлөх боломжгүй. Илгээх үү?`
                  : "Илгээсний дараа хариултаа өөрчлөх боломжгүй. Илгээх үү?"}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void submit(false)}
                  disabled={phase !== "active"}
                  className="flex-1 rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  Тийм, илгээх
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingSubmit(false)}
                  className="rounded-xl border border-white/15 px-4 py-3 text-white/80 hover:bg-white/[0.05]"
                >
                  Буцах
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingSubmit(true)}
              disabled={phase !== "active"}
              className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-3.5 text-lg font-bold text-white hover:brightness-110 disabled:opacity-50"
            >
              {phase === "submitting" ? "Илгээж байна…" : "Шалгалт илгээх"}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-4">
      <p className="text-2xl font-bold tabular-nums text-white">{value}</p>
      <p className="mt-1 text-xs uppercase tracking-widest text-white/45">{label}</p>
    </div>
  );
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-10 text-[#ecedf6]">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/[0.03] p-6 md:p-8">
        {children}
      </div>
    </div>
  );
}

/** Shown once the attempt is over: leave fullscreen, then go back to the list. */
function FinishedActions({ inFullscreen }: { inFullscreen: boolean }) {
  return (
    <div className="mt-6 flex flex-wrap gap-2">
      {inFullscreen ? (
        <button
          type="button"
          onClick={exitFullscreen}
          className="inline-flex rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-500"
        >
          ⤡ Fullscreen-ээс гарах
        </button>
      ) : null}
      <BackLink />
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/exams"
      className="inline-flex rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white/85 hover:bg-white/[0.05]"
    >
      ← Шалгалтын жагсаалт руу буцах
    </Link>
  );
}
