import { AuthForm } from "@/components/auth-form";
import { safeNextPath } from "@/lib/auth";
import { isGoogleConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export const metadata = { title: "Нэвтрэх" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; mode?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="flex min-h-[calc(100vh-57px)] items-center justify-center px-4 py-10">
      <AuthForm
        next={safeNextPath(params.next)}
        googleEnabled={isGoogleConfigured()}
        initialMode={params.mode === "register" ? "register" : "login"}
        initialError={
          params.error === "google"
            ? "Google-ээр нэвтэрч чадсангүй. Дахин оролдоно уу."
            : null
        }
      />
    </main>
  );
}
