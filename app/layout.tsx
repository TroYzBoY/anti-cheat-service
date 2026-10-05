import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CodeQuest Anti-Cheat Service",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background: "#070a12",
          color: "#ecedf6",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
        }}
      >
        {children}
      </body>
    </html>
  );
}
