# Fenrir — standalone proctored exam app

Next.js 16 app deployed as its own Vercel project
(`https://fenrir-anticheat.vercel.app`). Learners register or sign in
(password or Google), pick a published exam and take it under browser
anti-cheat; admins build multiple-choice exams, import questions and read the
results. It is independent of the CodeQuest online-learning app: its own
users and its own Postgres database.

## Database

- This repo owns the schema and every migration in `prisma/migrations`.
- Schema change: edit `prisma/schema.prisma`, write the migration with
  `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`
  into a new `prisma/migrations/<timestamp>_<name>/migration.sql`, commit it,
  then apply it with `npm run db:migrate`.
- `db:migrate` and `db:seed-admins` need the session-mode URL (port 5432);
  the app itself runs on the transaction pooler (port 6543) on Vercel.

## Before you commit

- `npm run lint:check` (zero warnings)
- `npm run typecheck`
- `npm test`

## Conventions

- `lib/policy.ts` is shared by the browser SDK (`sdk/`) and the server. Keep
  it free of `server-only`, DOM and Node imports. So are `lib/exam-forms.ts`,
  `lib/exam-import.ts`, `lib/exam-build.ts`, `lib/auth-schemas.ts` and
  `lib/seb-urls.ts`, which the browser also runs.
- Server-only modules start with `import "server-only"`.
- New env vars go in `lib/env.ts`; don't read `process.env` elsewhere.
- Route handlers export `dynamic = "force-dynamic"`.
- `proxy.ts` gates `/exams` and `/admin` before anything renders, and every
  admin page and server action calls `requireAdmin()` itself. Never rely on a
  layout check alone: a page renders alongside its layout, so its data would
  still reach the browser.
- Bump `SDK_VERSION` (`lib/policy.ts`) on breaking SDK changes.
