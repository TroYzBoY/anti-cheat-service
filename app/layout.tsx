import type { Metadata } from "next";

import { AppHeader } from "@/components/app-header";
import { getCurrentUser } from "@/lib/auth";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Fenrir — Шалгалтын систем", template: "%s · Fenrir" },
  description: "Хуурлаас хамгаалалттай онлайн шалгалтын систем.",
  robots: { index: false, follow: false },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  return (
    <html lang="mn">
      <body className="min-h-screen antialiased">
        <AppHeader user={user ? { fullName: user.fullName, role: user.role } : null} />
        {children}
      </body>
    </html>
  );
}
