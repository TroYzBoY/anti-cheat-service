# CodeQuest Anti-Cheat Service

Standalone anti-cheat service for CodeQuest exams. It runs as its own Vercel
project and shares the Postgres database with the main CodeQuest app.

```
 learner's exam tab (main app origin)            anti-cheat service (this repo)
 ┌───────────────────────────────────┐           ┌──────────────────────────────┐
 │ /exam page                        │  <script> │ GET  /sdk/v1.js              │
 │  └─ window.CodeQuestAntiCheat ◄───┼───────────┤                              │
 │       DevTools · focus · fullscreen│  events   │ POST /api/v1/events          │
 │       duplicate tab · fetch MITM ──┼──────────►│  verify token → record →     │
 │       overlay · multi-monitor      │  Bearer   │  apply policy → terminate    │
 └───────────────┬───────────────────┘   token   └──────────────┬───────────────┘
                 │ POST /api/exam/start (mints token)            │
                 ▼                                               ▼
           main app API  ──────────────►  shared Postgres  ◄──────
```

## What lives here

| Path | Purpose |
|------|---------|
| `sdk/` | Browser SDK, bundled to `public/sdk/v1.js` (DevTools, focus loss, fullscreen exits, duplicate tab, fetch/XHR tampering, overlay, multi-monitor, input lockdown) |
| `lib/policy.ts` | Limits and rules, shared by the SDK and the server |
| `app/api/v1/events` | Records each signal in `ExamIntegrityEvent` and terminates the `ExamSession` server-side |
| `app/api/health` | DB connectivity check |

Camera proctoring (webcam snapshots, ID/face baseline, face matching) stays
in the main app.

## Authentication

Session cookies can't be shared between two `*.vercel.app` projects, so the
main app mints a short-lived JWT per exam at `POST /api/exam/start`
(HS256, `iss=codequest`, `aud=codequest-anti-cheat`, `sub`=user id,
`sid`=exam session id, expires 5 min after the exam). The SDK sends it as
`Authorization: Bearer …`. Both projects share `ANTI_CHEAT_TOKEN_SECRET`.

## Database

`prisma/schema.prisma` is a **read-only mirror**. The main repo owns all
migrations, including the `ExamIntegrityEvent` table this service writes.
Never run `prisma migrate` / `prisma db push` here.

## Local development

```bash
cp .env.example .env      # same DATABASE_URL as the main app
npm install               # also runs prisma generate
npm run dev               # http://localhost:3001
```

In the main app's `.env` set:

```env
ANTI_CHEAT_SERVICE_URL="http://localhost:3001"
ANTI_CHEAT_TOKEN_SECRET="<same value as here>"
```

## Deploy to Vercel

1. Apply the main repo's migrations to the shared database first
   (`npx prisma migrate deploy` from the main repo) so `ExamIntegrityEvent`
   exists.
2. Push this repo to GitHub → Vercel → **Add New Project** → import it.
   Framework preset: Next.js. No root-directory or build overrides needed.
3. Environment variables, added on the import screen before the first
   deploy: `lib/env.ts` validates them during `next build`, so a build
   without them fails.
   - `DATABASE_URL`: the main app's pooled connection string
   - `ANTI_CHEAT_TOKEN_SECRET`: `openssl rand -base64 48`, the same value in both projects
   - `ALLOWED_ORIGINS`: the main app's URL, e.g. `https://codequest.vercel.app`
4. Deploy, then open `https://<this-project>.vercel.app/api/health` and expect `200`.
5. In the **main** Vercel project set `ANTI_CHEAT_SERVICE_URL` to this
   project's production URL plus the same `ANTI_CHEAT_TOKEN_SECRET`, then
   redeploy the main app (the URL is read at build time).

Use the production domain: Vercel's deployment protection blocks preview
URLs from being loaded by other sites.

## Checks

```bash
npm run lint:check
npm run typecheck
npm test
npm run build
```
