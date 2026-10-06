"use client";

import { useEffect, useState, type FormEvent } from "react";

import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "@/lib/auth-schemas";

type Mode = "login" | "register" | "verify" | "forgot" | "reset";

const TITLES: Record<Mode, string> = {
  login: "Нэвтрэх",
  register: "Бүртгүүлэх",
  verify: "Имэйл баталгаажуулах",
  forgot: "Нууц үг сэргээх",
  reset: "Шинэ нууц үг",
};

const SUBMIT_LABELS: Record<Mode, string> = {
  login: "Нэвтрэх",
  register: "Бүртгүүлэх",
  verify: "Баталгаажуулах",
  forgot: "Код авах",
  reset: "Нууц үг солих",
};

const RESEND_SECONDS = 60;

const inputClass =
  "mt-1 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-white placeholder:text-white/30 focus:border-violet-400/60 focus:outline-none";

type ApiReply = {
  ok?: boolean;
  message?: string;
  code?: string;
  retryAfterSeconds?: number;
};

async function post(path: string, body: unknown) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as ApiReply | null;
  return { res, data };
}

export function AuthForm({
  next,
  googleEnabled,
  initialMode,
  initialError,
}: {
  next: string;
  googleEnabled: boolean;
  initialMode: "login" | "register";
  initialError: string | null;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = window.setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => window.clearTimeout(id);
  }, [resendIn]);

  const go = (value: Mode, message: string | null = null) => {
    setMode(value);
    setError(null);
    setInfo(message);
    setCode("");
    if (value === "verify" || value === "reset") {
      setPassword("");
      setResendIn(RESEND_SECONDS);
    }
  };

  const signedIn = () => window.location.assign(next);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const requests = {
      login: { schema: loginSchema, path: "/api/auth/login", body: { email, password } },
      register: {
        schema: registerSchema,
        path: "/api/auth/register",
        body: { fullName, email, password },
      },
      verify: { schema: verifyEmailSchema, path: "/api/auth/verify-email", body: { email, code } },
      forgot: { schema: forgotPasswordSchema, path: "/api/auth/forgot-password", body: { email } },
      reset: {
        schema: resetPasswordSchema,
        path: "/api/auth/reset-password",
        body: { email, code, password },
      },
    } as const;
    const { schema, path, body } = requests[mode];
    const check = schema.safeParse(body);
    if (!check.success) {
      setError(check.error.issues[0]?.message ?? "Буруу өгөгдөл.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const { res, data } = await post(path, body);
      if (mode === "login" && data?.code === "EMAIL_NOT_VERIFIED") {
        go("verify", data.message ?? null);
        return;
      }
      if (!res.ok || !data?.ok) {
        setError(data?.message ?? "Алдаа гарлаа. Дахин оролдоно уу.");
        return;
      }
      if (mode === "register") {
        go("verify", `${email} хаяг руу 6 оронтой код илгээлээ.`);
      } else if (mode === "forgot") {
        go("reset", `${email} хаягаар бүртгэл байгаа бол 6 оронтой код илгээлээ.`);
      } else {
        // login / verify / reset sign the user in; reload so the header updates.
        signedIn();
      }
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError(null);
    setInfo(null);
    const { res, data } = await post("/api/auth/resend-code", {
      email,
      purpose: mode === "reset" ? "RESET_PASSWORD" : "VERIFY_EMAIL",
    });
    if (res.ok && data?.ok) {
      setInfo("Код дахин илгээлээ.");
      setResendIn(RESEND_SECONDS);
    } else {
      setError(data?.message ?? "Код илгээж чадсангүй.");
      if (data?.retryAfterSeconds) setResendIn(data.retryAfterSeconds);
    }
  };

  const tabClass = (value: Mode) =>
    `flex-1 rounded-lg px-3 py-2 text-sm font-bold transition ${
      mode === value ? "bg-violet-600 text-white" : "text-white/60 hover:text-white"
    }`;
  const entryMode = mode === "login" || mode === "register";
  const codeMode = mode === "verify" || mode === "reset";

  return (
    <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-2xl shadow-violet-950/30 md:p-8">
      <h1 className="text-2xl font-bold text-white">{TITLES[mode]}</h1>
      <p className="mt-1 text-sm text-white/55">Хуурлаас хамгаалалттай онлайн шалгалтын систем</p>

      {entryMode ? (
        <div className="mt-5 flex gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
          <button type="button" className={tabClass("login")} onClick={() => go("login")}>
            Нэвтрэх
          </button>
          <button type="button" className={tabClass("register")} onClick={() => go("register")}>
            Бүртгүүлэх
          </button>
        </div>
      ) : null}

      {entryMode && googleEnabled ? (
        <>
          <a
            href={`/api/auth/google?next=${encodeURIComponent(next)}`}
            className="mt-5 flex w-full items-center justify-center gap-3 rounded-xl border border-white/15 bg-white px-4 py-2.5 font-semibold text-[#1f1f1f] hover:bg-white/90"
          >
            <svg aria-hidden viewBox="0 0 48 48" className="h-5 w-5">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
            </svg>
            Google-ээр {mode === "login" ? "нэвтрэх" : "бүртгүүлэх"}
          </a>
          <div className="my-5 flex items-center gap-3 text-xs text-white/35">
            <span className="h-px flex-1 bg-white/10" />
            эсвэл имэйлээр
            <span className="h-px flex-1 bg-white/10" />
          </div>
        </>
      ) : (
        <div className="mt-5" />
      )}

      {info ? (
        <p className="mb-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
          {info}
        </p>
      ) : null}

      <form onSubmit={submit} className="space-y-3" noValidate>
        {mode === "register" ? (
          <label className="block text-sm text-white/70">
            Овог нэр
            <input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              autoComplete="name"
              className={inputClass}
            />
          </label>
        ) : null}

        {codeMode ? (
          <p className="text-sm text-white/60">
            Имэйл: <span className="font-semibold text-white">{email}</span>
          </p>
        ) : (
          <label className="block text-sm text-white/70">
            Имэйл
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              className={inputClass}
            />
          </label>
        )}

        {codeMode ? (
          <label className="block text-sm text-white/70">
            Имэйлд ирсэн 6 оронтой код
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              className={`${inputClass} text-center font-mono text-2xl tracking-[0.5em]`}
            />
          </label>
        ) : null}

        {mode === "login" || mode === "register" || mode === "reset" ? (
          <label className="block text-sm text-white/70">
            {mode === "reset" ? "Шинэ нууц үг" : "Нууц үг"}
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              className={inputClass}
            />
            {mode !== "login" ? (
              <span className="mt-1 block text-xs text-white/40">Дор хаяж 8 тэмдэгт</span>
            ) : null}
          </label>
        ) : null}

        {error ? (
          <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 font-bold text-white hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "Түр хүлээнэ үү…" : SUBMIT_LABELS[mode]}
        </button>
      </form>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
        {mode === "login" ? (
          <button type="button" onClick={() => go("forgot")} className="text-violet-300 hover:underline">
            Нууц үгээ мартсан уу?
          </button>
        ) : null}
        {codeMode ? (
          <button
            type="button"
            onClick={() => void resend()}
            disabled={resendIn > 0}
            className="text-violet-300 hover:underline disabled:text-white/35 disabled:no-underline"
          >
            {resendIn > 0 ? `Код дахин илгээх (${resendIn})` : "Код дахин илгээх"}
          </button>
        ) : null}
        {!entryMode ? (
          <button type="button" onClick={() => go("login")} className="text-white/55 hover:text-white">
            ← Нэвтрэх рүү буцах
          </button>
        ) : null}
      </div>
    </div>
  );
}
