import * as cheerio from 'cheerio';
import { SITE_ORIGIN } from '../url';
/** Only public, same-origin promotion routes; tracking and fragments are discarded. */
export function parseCampaignLinks(html: string): string[] {
  const $ = cheerio.load(html);
  const paths = new Set<string>();
  $('a[href]').each((_,a) => {
    try {
      const u = new URL($(a).attr('href')!, SITE_ORIGIN);
      if (u.origin !== SITE_ORIGIN || !/^\/(?:ventes-flash|destockage|panier-malin|trouvailles-marjane-mall|les-deals-[a-z0-9-]+|tout-a-moins-de-[a-z0-9-]+)(?:\/[a-z0-9-]+)?\/?$/.test(u.pathname)) return;
      paths.add(u.pathname.replace(/\/$/,''));
    } catch {}
  });
  return [...paths].slice(0,12);
}
