import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { safeCell, toCsv, toXlsx, type ExportColumn } from "../src/lib/export";
import { filtersToQuery, parseDealFilters } from "../src/lib/deal-filters";

type Row = { title: string; price: number | null };
const cols: ExportColumn<Row>[] = [
  { header: "Produit", value: (r) => r.title },
  { header: "Prix (MAD)", value: (r) => r.price },
];
const rows: Row[] = [
  { title: 'TV "QLED"; 55', price: 4149 },
  { title: "=HYPERLINK(\"http://evil\")", price: null },
];

describe("export", () => {
  it("produces Excel-friendly CSV (BOM, ';' separator, quoting)", () => {
    const csv = toCsv(rows, cols);
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.slice(1).trim().split("\r\n");
    expect(lines[0]).toBe("Produit;Prix (MAD)");
    expect(lines[1]).toBe('"TV ""QLED""; 55";4149');
  });

  it("neutralizes formula injection from scraped text", () => {
    expect(safeCell("=1+1")).toBe("'=1+1");
    expect(safeCell("+33")).toBe("'+33");
    expect(safeCell(-5)).toBe(-5);
    expect(toCsv(rows, cols)).toContain(`"'=HYPERLINK(""http://evil"")";`);
  });

  it("produces a valid XLSX workbook", async () => {
    const buf = await toXlsx(rows, cols);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Promotions")!;
    expect(ws.getRow(1).getCell(1).value).toBe("Produit");
    expect(ws.getRow(2).getCell(2).value).toBe(4149);
    expect(ws.getRow(3).getCell(1).value).toBe("'=HYPERLINK(\"http://evil\")");
  });
});

describe("deal filters from the URL", () => {
  it("validates and ignores bad values", () => {
    const f = parseDealFilters({ minPrice: "4000", maxPrice: "abc", sort: "drop", stock: "nope", criterionId: "x", category: "/tv-son-photo", page: "3" });
    expect(f).toMatchObject({ minPrice: 4000, sort: "drop", category: "/tv-son-photo", page: 3 });
    expect(f.maxPrice).toBeUndefined();
    expect(f.stock).toBeUndefined();
    expect(f.criterionId).toBeUndefined();
    expect(parseDealFilters({ category: "javascript:alert(1)" }).category).toBeUndefined();
  });
  it("round-trips to a query string", () => {
    expect(filtersToQuery({ minPrice: 4000, sort: "price", page: 1 })).toBe("minPrice=4000&sort=price");
  });
});
