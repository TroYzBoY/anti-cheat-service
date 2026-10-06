import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** `proxy.ts` normally routes `/` before this renders; this is the fallback. */
export default async function HomePage() {
  const user = await getCurrentUser();
  redirect(!user ? "/login" : user.role === "ADMIN" ? "/admin" : "/exams");
}
