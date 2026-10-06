import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

/**
 * Routes by session before anything renders. Pages re-check against the
 * database, but this gate matters: a page renders alongside its layout, so a
 * layout-only check would still stream the page's data to the wrong user.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  const home = !session ? "/login" : session.role === "ADMIN" ? "/admin" : "/exams";
  const redirectTo = (path: string, next?: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = next ? `?next=${encodeURIComponent(next)}` : "";
    return NextResponse.redirect(url);
  };

  if (pathname === "/") return redirectTo(home);

  const needsAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  if (!session) return redirectTo("/login", `${pathname}${request.nextUrl.search}`);
  if (needsAdmin && session.role !== "ADMIN") return redirectTo("/");
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/exams/:path*", "/admin/:path*"],
};
