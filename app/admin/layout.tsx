export const metadata = { title: "Админ" };

/** Each admin page calls `requireAdmin()` itself; see lib/auth.ts. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-6xl space-y-5 px-4 py-8">{children}</main>;
}
