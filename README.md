# Fenrir — онлайн шалгалтын систем

Хуурлаас хамгаалалттай, бие даасан онлайн шалгалтын web app
(`https://fenrir-anticheat.vercel.app`). Next.js 16 · Prisma 7 · Postgres (Supabase).

## Юу хийдэг вэ

**Суралцагч**
- Имэйл/нууц үгээр эсвэл Google-ээр бүртгүүлж нэвтэрнэ. Имэйлээр бүртгүүлбэл
  имэйлд ирсэн 6 оронтой кодоор баталгаажуулна; нууц үгээ мартвал мөн кодоор
  шинэчилнэ (код 10 минут хүчинтэй, 5 буруу оролдлогоор хүчингүй болно).
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
| `SMTP_USER`, `SMTP_PASS` | Кодыг Gmail-ээр илгээнэ: Gmail хаяг + Google App Password (домэйн шаардлагагүй) |
| `RESEND_API_KEY` | Эсвэл Resend-ээр (домэйн баталгаажуулсны дараа). SMTP байвал SMTP-г ашиглана |
| `EMAIL_FROM` | Илгээгч. Анхдагч нь `SMTP_USER`; Resend-д таны домэйн дээрх хаяг |

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

### Имэйл код: Gmail (домэйнгүй)

1. Google Account → **Security → 2-Step Verification**-ийг асаана.
2. https://myaccount.google.com/apppasswords → нэр `Fenrir` → **Create** →
   16 тэмдэгттэй нууц үг гарна.
3. Vercel: `SMTP_USER` = Gmail хаяг, `SMTP_PASS` = тэр 16 тэмдэгт → Redeploy.

Gmail өдөрт ~500 имэйл илгээнэ; эхэндээ spam хавтас руу орж магадгүй.

### Имэйл код: Resend (домэйнтэй бол)

1. resend.com → **API Keys → Create API Key** (Sending access) → `RESEND_API_KEY`.
2. **Domains → Add Domain** → өөрийн домэйноо нэмж DNS бичлэгүүдийг тавина →
   **Verified** болсны дараа `EMAIL_FROM="Fenrir <no-reply@таны-домэйн>"`.
   Домэйн баталгаажуулаагүй үед `onboarding@resend.dev` зөвхөн таны Resend
   бүртгэлийн имэйл рүү л илгээнэ — бусад хүмүүст код очихгүй.

Локалд `RESEND_API_KEY`-гүй ажиллуулбал имэйлийг серверийн консол руу хэвлэнэ.

### Safe Exam Browser (SEB)

Бүх шалгалтыг зөвхөн SEB-ээр эхлүүлж, илгээнэ: сервер SEB-ийн Config Key
hash-ийг шалгана. Энгийн browser-т «Эхлүүлэх» товчны оронд SEB суулгах заавар,
шалгалтын .seb файлыг татах товч гарна.

.seb файлыг апп өөрөө үүсгэдэг (`lib/seb-config.ts`), Config Key-г ч өөрөө
тооцоолно. Тиймээс SEB Config Tool, key хуулах шаардлагагүй. Тохиргоо:

- Kiosk: SEB өөрийн desktop дээр ажиллана. Бусад програмын цонх, overlay
  харагдахгүй. VM, remote desktop, дэлгэцийн бичлэг, Print Screen, олон дэлгэц
  хориотой.
- Хориотой програм: бусад browser (Google Meet, ChatGPT вэб), WhatsApp,
  Messenger зэргийг SEB эхлэхээс өмнө хаалгана. ChatGPT, Claude, Copilot,
  Perplexity, Cluely, Game Bar, ShareX зэргийг асуулгүй хаана. SEB for Windows
  өөрөө Discord, Zoom, Teams, Skype, Slack, Telegram, AnyDesk, TeamViewer, OBS,
  Remote Desktop гэх мэтийг хаадаг. Шалгалтын үеэр эдгээрийн аль нэг нээгдвэл
  SEB тэр даруй хаана.
- SEB-ийн taskbar нуугдсан. Гарахдаа хуудсан дээрх «SEB-ээс гарах» холбоосыг
  (`/seb-quit`) дарна.
- Шалгалтын цонх focus-оо нэг удаа алдахад (өөр програм, цонх гарч ирэх) л
  шалгалт шууд хасагдана (ban).

Админ өөрийн .seb файлыг байршуулж, Config Key-г нь оруулж болно. Тэгвэл
суралцагчид тэр файлыг татна (generated файл ч мөн хүчинтэй хэвээр).

Суралцагчдад SEB суулгах шаардлагатай (Windows, macOS, iPad). SEB дотор Google
нэвтрэлт ажиллахгүй байж магадгүй. Тэр үед «Нууц үгээ мартсан»-аар нууц үг
тохируулна.

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