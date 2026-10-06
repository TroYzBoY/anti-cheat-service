"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** `/exams/<id>` is the exam itself: it has its own header and goes fullscreen. */
const RUNNER_ROUTE = /^\/exams\/[^/]+$/;

export function AppHeader({
  user,
}: {
  user: { fullName: string; role: string } | null;
}) {
  const pathname = usePathname() ?? "/";
  const [signingOut, setSigningOut] = useState(false);
  if (RUNNER_ROUTE.test(pathname)) return null;

  const links = user
    ? [
        { href: "/exams", label: "Шалгалтууд" },
        ...(user.role === "ADMIN" ? [{ href: "/admin", label: "Админ" }] : []),
      ]
    : [];

  const signOut = async () => {
    setSigningOut(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.assign("/login");
  };

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0b0e18]/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link href="/" className="shrink-0 text-lg font-black tracking-tight text-white">
          Fenrir <span className="font-semibold text-white/50">· Шалгалт</span>
        </Link>
        <nav className="flex items-center gap-1">
          {links.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                  active
                    ? "bg-violet-500/15 text-white ring-1 ring-violet-400/30"
                    : "text-white/65 hover:bg-white/[0.05] hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        {user ? (
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden truncate text-sm text-white/60 sm:inline">{user.fullName}</span>
            <button
              type="button"
              onClick={() => void signOut()}
              disabled={signingOut}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/80 hover:bg-white/[0.06] disabled:opacity-50"
            >
              Гарах
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
