# CodeQuest anti-cheat service

Standalone Next.js 16 project, deployed as its own Vercel project. It shares
the Postgres database with the main CodeQuest app
(`online-learning-and-online-exam-anti-cheat`).

## Database — read this first

- `prisma/schema.prisma` is a **read-only mirror** of a few tables. The main
  repo owns every migration.
- Never run `prisma migrate` or `prisma db push` here: a subset schema would
  drop every table it doesn't list.
- Schema changes: add the migration in the main repo, then copy the model
  change into this mirror and run `npm run prisma:generate`.

## Before you commit

- `npm run lint:check` (zero warnings)
- `npm run typecheck`
- `npm test`

## Conventions

- `lib/policy.ts` is shared by the browser SDK (`sdk/`) and the server. Keep it
  free of `server-only`, DOM and Node imports.
- The SDK's public types live in `sdk/types.ts`; the main repo mirrors them in
  `lib/exam/anti-cheat-sdk.ts`. Bump `SDK_VERSION` on breaking changes.
- Server-only modules start with `import "server-only"`.
- New env vars go in `lib/env.ts`; don't read `process.env` elsewhere.
- Route handlers that read headers export `dynamic = "force-dynamic"`.
