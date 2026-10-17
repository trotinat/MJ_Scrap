/** Keep a ranked feed useful without letting one search or brand fill every slot. */
export function pickVaried<T>(
  rows: T[],
  limit: number,
  get: { id: (row: T) => string; group: (row: T) => string; brand: (row: T) => string | null },
  brandLimit = 3,
): T[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = get.group(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const chosen: T[] = [], ids = new Set<string>(), brands = new Map<string, number>();
  const canAdd = (row: T, cap: number) => {
    const brand = get.brand(row)?.toLowerCase().trim();
    return !ids.has(get.id(row)) && (!brand || (brands.get(brand) ?? 0) < cap);
  };
  const add = (row: T) => {
    chosen.push(row);
    ids.add(get.id(row));
    const brand = get.brand(row)?.toLowerCase().trim();
    if (brand) brands.set(brand, (brands.get(brand) ?? 0) + 1);
  };
  while (chosen.length < limit) {
    let added = false;
    for (const bucket of groups.values()) {
      const row = bucket.find((item) => canAdd(item, brandLimit));
      if (row) { add(row); added = true; }
      if (chosen.length === limit) break;
    }
    if (!added) break;
  }
  for (const cap of [brandLimit, Infinity]) {
    for (const row of rows) {
      if (chosen.length === limit) break;
      if (canAdd(row, cap)) add(row);
    }
  }
  return chosen;
}
