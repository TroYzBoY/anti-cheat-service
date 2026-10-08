import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Safe Exam Browser" };

/**
 * The generated .seb file's quit URL: Safe Exam Browser closes instead of
 * loading it, so only other browsers ever render this.
 */
export default function SebQuitPage() {
  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4 py-10 text-[#ecedf6]">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/[0.03] p-6 md:p-8">
        <h1 className="text-2xl font-bold text-white">Safe Exam Browser</h1>
        <p className="mt-3 text-white/70">
          Энэ хаягаар Safe Exam Browser-ийг хаадаг. Энгийн browser-т хийх зүйлгүй.
        </p>
        <Link
          href="/exams"
          className="mt-6 inline-flex rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white/85 hover:bg-white/[0.05]"
        >
          ← Шалгалтын жагсаалт руу буцах
        </Link>
      </div>
    </main>
  );
}
