import { extractFlightData } from './embedded';

/** Resolve only plain Flight records; never execute scripts or guess a related product's price. */
export function embeddedDetail(html: string, slug: string) {
  const records = new Map<string, unknown>();
  const flight = extractFlightData(html);
  for (const line of flight.split('\n')) {
    const m = /^([a-f0-9]+):(.*)$/i.exec(line);
    if (m) { try { records.set(m[1]!, JSON.parse(m[2]!)); } catch {} }
  }
  // Flight serializes long strings as byte-length-prefixed T records (hex length).
  // Magento's configurable-price JSON is often stored this way rather than as a JSON record.
  const textRecord = /(?:^|\n)([a-f0-9]+):T([a-f0-9]+),/gi;
  for (let m = textRecord.exec(flight); m; m = textRecord.exec(flight)) {
    const length = parseInt(m[2]!,16);
    if (length > 0 && length <= 2_000_000) records.set(m[1]!, Buffer.from(flight.slice(m.index + m[0].length),'utf8').subarray(0,length).toString('utf8'));
  }
  function resolve(v: unknown, depth = 0): any {
    if (depth > 12) return null;
    if (typeof v === 'string' && /^\$[a-f0-9]+$/i.test(v)) return resolve(records.get(v.slice(1)), depth + 1);
    if (Array.isArray(v)) return v.map(x => resolve(x, depth + 1));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k,x]) => [k,resolve(x, depth + 1)]));
    return v;
  }
  const objects: any[] = [];
  function visit(v: unknown, depth = 0) {
    if (depth > 16) return;
    if (typeof v === 'string' && v.startsWith('{')) { try { visit(JSON.parse(v), depth + 1); } catch {} }
    if (!v || typeof v !== 'object') return;
    if (!Array.isArray(v)) objects.push(v);
    for (const x of Object.values(v)) visit(x, depth + 1);
  }
  for (const v of records.values()) visit(resolve(v));
  const product = objects.find(p => typeof p.sku === 'string' && Array.isArray(p.custom_attributes) && p.custom_attributes.some((a: any) => a?.attribute_code === 'url_key' && a.value === slug));
  if (!product) return null;
  const ext = product.extension_attributes ?? {};
  const config = objects.find(p => String(p.productId) === String(product.id) && p.prices?.finalPrice);
  const optionPrices = config ? Object.values(config.optionPrices ?? {}).map((p: any) => p?.finalPrice?.amount).filter((n): n is number => typeof n === 'number' && n > 0) : [];
  // Different variant prices require a selected variant: a lowest price is not a firm quote.
  const common = optionPrices.length > 0 && optionPrices.every(n => n === optionPrices[0]);
  const amount = Number(ext.final_price) > 0 ? Number(ext.final_price) : product.type_id !== 'configurable' && Number(product.price) > 0 ? Number(product.price) : common ? optionPrices[0] : null;
  const old = Number(ext.regular_price) > 0 ? Number(ext.regular_price) : common ? config?.prices?.oldPrice?.amount : null;
  const specs: Record<string,string> = {};
  const flatten = (v: any) => { if (Array.isArray(v)) v.forEach(flatten); else if (v?.label && typeof v.value === 'string') specs[v.label] = v.value; };
  flatten(ext.product_attributes);
  const attributes = Object.values(config?.attributes ?? {}) as any[];
  const variants = Object.entries(config?.optionPrices ?? {}).slice(0,120).flatMap(([id,quote]:[string,any]) => {
    const selected:Record<string,string> = {};
    for (const attribute of attributes) {
      const option = attribute.options?.find((o:any) => Array.isArray(o.products) && o.products.some((p:any) => String(p)===id));
      if (!option || typeof option.label !== 'string' || typeof attribute.label !== 'string') return [];
      selected[attribute.label] = option.label;
    }
    const price = quote?.finalPrice?.amount;
    if (!attributes.length || typeof price !== 'number' || !Number.isFinite(price) || price<=0) return [];
    return [{attributes:selected,priceCents:Math.round(price*100),stock:'unknown'}];
  });
  if (variants.length) specs['Variantes observées (stock à confirmer)'] = JSON.stringify(variants);
  const images = Array.isArray(product.media_gallery_entries)
    ? product.media_gallery_entries.filter((p: any) => !p?.disabled && typeof p?.file === 'string').map((p: any) => p.file as string)
    : [];
  return {amount: typeof amount === 'number' && Number.isFinite(amount) ? amount : null, old: typeof old === 'number' ? old : null, specs, brand: ext.brand_name as string | undefined, seller: ext.seller_name as string | undefined, image: images[0], images};
}
