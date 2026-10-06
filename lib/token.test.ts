import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";

import { createSessionToken } from "./session";
import {
  ANTI_CHEAT_TOKEN_AUDIENCE,
  ANTI_CHEAT_TOKEN_ISSUER,
  createAntiCheatToken,
  readBearerToken,
  verifyAntiCheatToken,
} from "./token";

const secret = new TextEncoder().encode(process.env.AUTH_SECRET);

function sign({
  issuer = ANTI_CHEAT_TOKEN_ISSUER,
  audience = ANTI_CHEAT_TOKEN_AUDIENCE,
  expiresIn = "10m",
  key = secret,
}: {
  issuer?: string;
  audience?: string;
  expiresIn?: string;
  key?: Uint8Array;
} = {}) {
  return new SignJWT({ sid: "session-123" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject("user-1")
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key);
}

describe("anti-cheat token", () => {
  it("round-trips a token minted for an exam session", async () => {
    const token = await createAntiCheatToken({
      userId: "user-1",
      sessionId: "session-123",
      expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(verifyAntiCheatToken(token)).resolves.toEqual({
      userId: "user-1",
      sessionId: "session-123",
    });
  });

  it("rejects the wrong audience, issuer, key or an expired token", async () => {
    await expect(verifyAntiCheatToken(await sign({ audience: "other" }))).resolves.toBeNull();
    await expect(verifyAntiCheatToken(await sign({ issuer: "other" }))).resolves.toBeNull();
    await expect(
      verifyAntiCheatToken(await sign({ key: new TextEncoder().encode("x".repeat(48)) })),
    ).resolves.toBeNull();
    await expect(verifyAntiCheatToken(await sign({ expiresIn: "-1m" }))).resolves.toBeNull();
    await expect(verifyAntiCheatToken("not-a-jwt")).resolves.toBeNull();
  });

  it("does not accept a session cookie token", async () => {
    const sessionToken = await createSessionToken({ id: "user-1", role: "ADMIN" });
    await expect(verifyAntiCheatToken(sessionToken)).resolves.toBeNull();
  });
});

describe("readBearerToken", () => {
  it("extracts the token from the Authorization header", () => {
    const request = new Request("http://x", {
      headers: { Authorization: "Bearer abc.def" },
    });
    expect(readBearerToken(request)).toBe("abc.def");
    expect(readBearerToken(new Request("http://x"))).toBeNull();
  });
});
