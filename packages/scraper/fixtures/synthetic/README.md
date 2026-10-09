# Synthetic fixtures — NOT captured from the live site

These HTML files are **hand-written**. They reproduce the visible text and
price renderings that were observed on marjanemall.ma in October 2026
through a text-only page reader (raw markup was not accessible from the
build environment):

- product links `/p/<slug>-<id>`;
- current price split in two nodes (`4149` + `00DH`) or flattened (`89900DH`);
- old price `1299 DH` / `6500.00 DH`, discount `-31%`;
- seller line `Vendu par <vendeur>`, review count `(13 avis)`;
- "Description produit" followed by label / value lines.

The markup (tags, classes) is invented. Run `pnpm probe` on a server that can
reach the site: it saves the real HTML into `fixtures/live/` (git-ignored).
Copy representative pages into `fixtures/real/` and add tests against them
before relying on the extractor in production.
