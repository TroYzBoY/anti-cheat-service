import "server-only";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import type { User } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

const BCRYPT_COST = 12;

export function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_COST);
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

async function userFromToken(token: string | undefined): Promise<User | null> {
  const claims = await verifySessionToken(token);
  if (!claims) return null;
  return prisma.user.findUnique({ where: { id: claims.userId } });
}

/** The signed-in user for a server component / action, or null. */
export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  return userFromToken(store.get(SESSION_COOKIE)?.value);
}

/** The signed-in user for a route handler, or null. */
export function getUserFromRequest(request: NextRequest): Promise<User | null> {
  return userFromToken(request.cookies.get(SESSION_COOKIE)?.value);
}

export async function requireUser(nextPath = "/"): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return user;
}

/**
 * Re-checks the role against the database. Every admin page and action calls
 * this itself: a layout check alone can't stop a page that renders alongside it.
 */
export async function requireAdmin(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  if (user.role !== "ADMIN") redirect("/");
  return user;
}

/** `/x` paths only — never another origin or `//host`. */
export function safeNextPath(value: string | null | undefined, fallback = "/") {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : fallback;
}
