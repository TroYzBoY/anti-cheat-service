"use client";

import { useState, type FormEvent } from "react";

import { loginSchema, registerSchema } from "@/lib/auth-schemas";

type Mode = "login" | "register";

const inputClass =
  "mt-1 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-white placeholder:text-white/30 focus:border-violet-400/60 focus:outline-none";

export function AuthForm({
  next,
  googleEnabled,
  initialMode,
  initialError,
}: {
  next: string;
  googleEnabled: boolean;
  initialMode: Mode;
  initialError: string | null;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [busy, setBusy] = useState(false);

  const switchMode = (value: Mode) => {
    setMode(value);
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const body = mode === "login" ? { email, password } : { fullName, email, password };
    const check = (mode === "login" ? loginSchema : registerSchema).safeParse(body);
    if (!check.success) {
      setError(check.error.issues[0]?.message ?? "Буруу өгөгдөл.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (!res.ok || !data?.ok) {
        setError(data?.message ?? "Алдаа гарлаа. Дахин оролдоно уу.");
        return;
      }
      // Full navigation so the header picks up the new session.
      window.location.assign(next);
    } catch {
      setError("Сүлжээний алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setBusy(false);
    }
  };

  const tabClass = (value: Mode) =>
    `flex-1 rounded-lg px-3 py-2 text-sm font-bold transition ${
      mode === value ? "bg-violet-600 text-white" : "text-white/60 hover:text-white"
    }`;

  return (
    <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-2xl shadow-violet-950/30 md:p-8">
      <h1 className="text-2xl font-bold text-white">
        {mode === "login" ? "Нэвтрэх" : "Бүртгүүлэх"}
      </h1>
      <p className="mt-1 text-sm text-white/55">
        Хуурлаас хамгаалалттай онлайн шалгалтын систем
      </p>

      <div className="mt-5 flex gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
        <button type="button" className={tabClass("login")} onClick={() => switchMode("login")}>
          Нэвтрэх
        </button>
        <button
          type="button"
          className={tabClass("register")}
          onClick={() => switchMode("register")}
        >
          Бүртгүүлэх
        </button>
      </div>

      {googleEnabled ? (
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
        <label className="block text-sm text-white/70">
          Нууц үг
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            className={inputClass}
          />
          {mode === "register" ? (
            <span className="mt-1 block text-xs text-white/40">Дор хаяж 8 тэмдэгт</span>
          ) : null}
        </label>

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
          {busy ? "Түр хүлээнэ үү…" : mode === "login" ? "Нэвтрэх" : "Бүртгүүлэх"}
        </button>
      </form>
    </div>
  );
}
