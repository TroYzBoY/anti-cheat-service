/**
 * The generated .seb file's quit URL: opening it closes Safe Exam Browser.
 * Must be a full page load (a plain link), not a client-side navigation.
 */
export const SEB_QUIT_PATH = "/seb-quit";

/** Where the exam's .seb file downloads from. */
export function sebConfigPath(examId: string) {
  return `/exams/${examId}/seb`;
}
