/**
 * CSV export. `RPT-001` says every report exports, and export means a file someone
 * opens in Excel — not a download that greets them with mojibake or a mangled column.
 *
 * Three things this gets right that a naive join does not:
 *
 *   - **Quoting.** A customer called `Ridgeline Plumbing, Inc.` splits a row in two
 *     without it, and shop names contain commas constantly.
 *   - **A BOM.** Excel on Windows reads a UTF-8 file as Latin-1 unless the file starts
 *     with one, which turns every `·` and `—` in our data into garbage.
 *   - **Formula injection.** A leading `=`, `+`, `-` or `@` makes Excel treat the cell
 *     as a formula. Customer names are user input, so they get prefixed with a tab.
 *     This is a security fix, not a formatting one.
 *
 * Money is exported as a plain number, never "$1,009.50". The string is for reading;
 * the file is for calculating, and a currency symbol makes the column text.
 */
export function toCSV(headers: string[], rows: (string | number | null)[][]): string {
  const cell = (v: string | number | null) => {
    if (v === null || v === undefined) return "";
    if (typeof v === "number") return String(v);
    const safe = /^[=+\-@]/.test(v) ? `\t${v}` : v;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  // CRLF: the line ending every spreadsheet agrees on.
  return [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
}

/** Triggers the download. Named so the file is identifiable a week later in Downloads. */
export function downloadCSV(name: string, csv: string) {
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name.endsWith(".csv") ? name : `${name}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** `ar-aging-2026-11-04.csv` — the report and the day it was run. */
export const csvName = (report: string, stamp: string) =>
  `${report.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${stamp}`;
