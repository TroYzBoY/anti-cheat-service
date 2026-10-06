# Fenrir — онлайн шалгалтын систем

Хуурлаас хамгаалалттай, бие даасан онлайн шалгалтын web app
(`https://fenrir-anticheat.vercel.app`). Next.js 16 · Prisma 7 · Postgres (Supabase).

## Юу хийдэг вэ

**Суралцагч**
- Имэйл/нууц үгээр эсвэл Google-ээр бүртгүүлж нэвтэрнэ.
- Нээлттэй шалгалтуудаас сонгоод **нэг удаа** өгнө: fullscreen, таймер,
  хариулт автоматаар хадгалагдана (refresh хийсэн ч үргэлжилнэ), хугацаа
  дуусахад автоматаар илгээгдэнэ, оноо шууд гарна.

**Хуурлаас хамгаалалт** (`sdk/` → `/sdk/v1.js`, шийдвэрийг сервер гаргана)
- Цонх/tab-аас гарах бүр тоологдоно, **3 дахь удаад шууд хасагдана (ban)**.
- Fullscreen-ээс 3 удаа гарвал хасагдана.
- DevTools, давхар tab, хуудас/сүлжээний API өөрчлөх → шууд цуцлагдана.
- Олон дэлгэц → зөвхөн бүртгэнэ.

**Админ** (`/admin`)
- Google Form шиг шалгалт бэлдэнэ: 2–8 сонголт, зөв хариулт, дараалал холих.
- Excel (.xlsx), CSV эсвэл Word-оос хуулсан текстээс асуулт импортлоно.
- Шалгалт бүрийн үр дүн: хэдэн хүн өгсөн, хүн бүрийн оноо, focus алдсан тоо
  (`2/3`), бусад зөрчил, CSV татах, «Дахин өгүүлэх».

## Орчны хувьсагч

| Нэр | Тайлбар |
|---|---|
| `DATABASE_URL` | Энэ app-ийн Postgres. Vercel дээр Supabase **Transaction pooler** (6543) |
| `AUTH_SECRET` | 32+ тэмдэгт. Session cookie болон шалгалтын token-ийг гарын үсэглэнэ |
| `APP_URL` | `https://fenrir-anticheat.vercel.app` (Google redirect URI-д) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Заавал биш. Байвал «Google-ээр нэвтрэх» гарна |

## Локалд ажиллуулах

```bash
cp .env.example .env            # DATABASE_URL = Session pooler (5432)
npm install
npm run db:migrate              # хүснэгтүүдийг үүсгэнэ
ADMIN_EMAILS="you@example.com" ADMIN_PASSWORD="..." npm run db:seed-admins
npm run dev                     # http://localhost:3001
```

## Vercel-д deploy хийх

1. Supabase дээр project үүсгээд `npm run db:migrate`, `npm run db:seed-admins`-ийг
   Session pooler (5432) URL-аар ажиллуулна.
2. Vercel → энэ repo → Environment Variables: `DATABASE_URL` (Transaction pooler,
   6543), `AUTH_SECRET`, `APP_URL`, шаардлагатай бол `GOOGLE_*`.
3. Deploy. `/api/health` → `200`.

### Google OAuth

Google Cloud Console → Google Auth Platform → **Clients → Web application**:
- Authorized JavaScript origin: `https://fenrir-anticheat.vercel.app`
- Authorized redirect URI: `https://fenrir-anticheat.vercel.app/api/auth/google/callback`

Audience-ийг **Publish app** болгоно, эс бөгөөс зөвхөн test user-ууд нэвтэрнэ.

## Импортын формат

Excel/CSV — мөр бүр нэг асуулт, сүүлийн нүд нь зөв хариулт (үсэг, дугаар эсвэл текст):

```
Асуулт | Сонголт А | Сонголт Б | Сонголт В | Зөв хариулт
```

Текст:

```
1. Монгол Улсын нийслэл аль нь вэ?
А. Дархан
*Б. Улаанбаатар
В. Эрдэнэт
```

## Шалгалтууд

```bash
npm run lint:check
npm run typecheck
npm test
npm run build
```
