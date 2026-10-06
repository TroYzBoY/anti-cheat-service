// Creates admin accounts, or promotes existing users to admin. Run it from a
// trusted machine against the app's database:
//
//   ADMIN_EMAILS="a@example.com,b@example.com" ADMIN_PASSWORD="..." npm run db:seed-admins
//
// An existing account keeps its password; new ones get ADMIN_PASSWORD.
// Seeded emails count as verified, so the owners can also sign in with Google.
import "dotenv/config";

import crypto from "node:crypto";

import bcrypt from "bcryptjs";
import pg from "pg";

const emails = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);
const password = process.env.ADMIN_PASSWORD ?? "";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing.");
if (emails.length === 0) throw new Error("Set ADMIN_EMAILS (comma-separated).");
if (password.length < 12) throw new Error("ADMIN_PASSWORD must be at least 12 characters.");

// Same `?schema=` convention as lib/prisma.ts and `prisma migrate`.
const schema = new URL(process.env.DATABASE_URL).searchParams.get("schema");
if (schema && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) throw new Error("Bad schema name.");

const passwordHash = await bcrypt.hash(password, 12);
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  if (schema) await client.query(`SET search_path TO "${schema}"`);
  for (const email of emails) {
    await client.query(
      `INSERT INTO "User" (id, email, "fullName", "passwordHash", role, "emailVerifiedAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, 'ADMIN', NOW(), NOW(), NOW())
       ON CONFLICT (email) DO UPDATE SET
         role = 'ADMIN',
         "emailVerifiedAt" = COALESCE("User"."emailVerifiedAt", NOW()),
         "passwordHash" = COALESCE("User"."passwordHash", EXCLUDED."passwordHash"),
         "updatedAt" = NOW()`,
      [crypto.randomUUID(), email, email.split("@")[0], passwordHash],
    );
    console.log(`Admin ready: ${email}`);
  }
} finally {
  await client.end();
}
