import "server-only";

import crypto from "node:crypto";

import { env } from "@/lib/env";

/** OAuth 2.0 authorization-code flow with PKCE against Google. */
export const GOOGLE_STATE_COOKIE = "fenrir.google.state";
export const GOOGLE_VERIFIER_COOKIE = "fenrir.google.verifier";
export const GOOGLE_NEXT_COOKIE = "fenrir.google.next";

export type GoogleProfile = {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
};

const base64Url = (buffer: Buffer) => buffer.toString("base64url");

export function googleRedirectUri(origin: string) {
  return `${origin}/api/auth/google/callback`;
}

export function createGoogleAuthRequest(origin: string) {
  const state = base64Url(crypto.randomBytes(24));
  const verifier = base64Url(crypto.randomBytes(48));
  const challenge = base64Url(crypto.createHash("sha256").update(verifier).digest());

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID ?? "");
  url.searchParams.set("redirect_uri", googleRedirectUri(origin));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");
  return { url, state, verifier };
}

export async function fetchGoogleProfile(
  origin: string,
  code: string,
  verifier: string,
): Promise<GoogleProfile> {
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID ?? "",
      client_secret: env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: googleRedirectUri(origin),
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
    cache: "no-store",
  });
  if (!tokenResponse.ok) throw new Error("Google token exchange failed.");
  const { access_token: accessToken } = (await tokenResponse.json()) as {
    access_token?: string;
  };
  if (!accessToken) throw new Error("Google returned no access token.");

  const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!profileResponse.ok) throw new Error("Google profile request failed.");
  return (await profileResponse.json()) as GoogleProfile;
}
