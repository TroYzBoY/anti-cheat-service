"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-runs the server component every `intervalMs` while mounted. */
export function AutoRefresh({ intervalMs }: { intervalMs: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => router.refresh(), intervalMs);
    return () => window.clearInterval(id);
  }, [router, intervalMs]);
  return null;
}
