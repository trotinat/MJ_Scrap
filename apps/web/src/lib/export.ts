import ExcelJS from "exceljs";

export interface ExportColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
  width?: number;
}

/**
 * Neutralizes spreadsheet formula injection: a scraped title such as
 * "=HYPERLINK(...)" must be shown as text, not evaluated.
 */
export function safeCell(v: string | number | null | undefined): string | number {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return v;
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

function csvEscape(v: string | number): string {
  const s = String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV with ";" separator and a UTF-8 BOM so Excel (French locale) opens it correctly. */
export function toCsv<T>(rows: T[], columns: ExportColumn<T>[]): string {
  const lines = [columns.map((c) => csvEscape(c.header)).join(";")];
  for (const row of rows) lines.push(columns.map((c) => csvEscape(safeCell(c.value(row)))).join(";"));
  return `﻿${lines.join("\r\n")}\r\n`;
}

export async function toXlsx<T>(rows: T[], columns: ExportColumn<T>[], sheetName = "Promotions"): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Marjane Deals Watcher";
  wb.created = new Date();
  const ws = wb.addWorksheet(sheetName);
  ws.columns = columns.map((c) => ({ header: c.header, width: c.width ?? 18 }));
  ws.getRow(1).font = { bold: true };
  for (const row of rows) ws.addRow(columns.map((c) => safeCell(c.value(row))));
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}
