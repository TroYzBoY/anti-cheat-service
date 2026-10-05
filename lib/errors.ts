import { Prisma } from "@/lib/generated/prisma/client";

export function isDatabaseUnavailableError(error: unknown) {
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return true;
  }

  if (error && typeof error === "object" && "code" in error) {
    const code = String((error as { code?: unknown }).code);
    if (code === "ECONNREFUSED" || code === "P1001") {
      return true;
    }
  }

  if (!(error instanceof Error)) {
    return false;
  }

  return /ECONNREFUSED|P1001|Can't reach database server|database connection/i.test(
    error.message,
  );
}
