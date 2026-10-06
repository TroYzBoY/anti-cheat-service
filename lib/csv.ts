function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = value instanceof Date ? value.toISOString() : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV with a UTF-8 BOM so Excel opens Cyrillic text correctly. */
export function buildCsv(
  headers: readonly string[],
  rows: readonly (readonly unknown[])[],
): string {
  const lines = [headers, ...rows].map((row) => row.map(csvEscape).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}
