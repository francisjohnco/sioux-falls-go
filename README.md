# Sioux Falls Go — Platform

Phase 1 foundation. Not a WordPress migration — the first working slice of the
Sioux Falls Go platform, built to the "Foundation and Knowledge Engine" spec.

## Stack decisions (and why)

- **Astro** — static-first by default, ships zero JS unless a component
  explicitly needs it (islands architecture), first-class content collections
  with typed schemas, deploys natively to Netlify. Fits "static-first,
  SEO-first, serverless where appropriate" directly.
- **Content Collections (`src/content.config.ts`)** — this *is* the Knowledge
  Engine's schema backbone. Categories, articles, businesses, events,
  neighborhoods, and FAQs are typed and cross-referenced (`reference()`), so
  "no category = no content" and "no orphan pages" are enforced by the build,
  not by convention.
- **No framework (React/Vue) yet** — nothing in Phase 1 needs client-side
  interactivity. Adding one is a later, additive decision (e.g. for the
  Business Dashboard in Phase 3), not a Phase 1 dependency.

## What's built

- `src/content.config.ts` — schemas for all six content types, with the
  editorial-standards fields from the spec baked in (`aiAssisted`,
  `reviewedBy`, `evergreen`, `staleCheckDue`).
- `src/styles/global.css` — design system tokens (color, type, spacing),
  grounded in actual Sioux Falls materials — quartzite bedrock, the Big Sioux
  River, prairie harvest gold — rather than a generic template palette.
- `src/layouts/BaseLayout.astro` — SEO foundation on every page: canonical
  URL, Open Graph, Twitter card, JSON-LD slot, skip-to-content link.
- `src/components/SiteHeader.astro`, `SiteFooter.astro` — nav reflecting the
  IA (Things to Do / Directory / Events / Neighborhoods / Guides).
- `src/pages/index.astro` — homepage, pulling live category and article data
  from the collections (not hardcoded).
- `src/pages/guides/[...slug].astro` — the article template every Knowledge
  Engine article renders through, with Article schema, breadcrumbs back to
  its category, and a visible AI-assist/review disclosure when applicable.
- Sample content: 2 categories (`things-to-do`, `electricians`), 1
  neighborhood (`downtown`), 1 article (`falls-park-visitor-guide`) — enough
  to prove the schema and relationships end to end.

## Definition of Done — Phase 1 (Foundation)

- [x] Netlify-deployable static architecture — builds clean (`npm run build`)
- [x] Content Engine schema — collections + relationships defined and typed
- [x] Category playbooks — schema field exists, 2 sample categories populated
- [ ] Category playbooks — full playbook content for *every* real category
      (needs the actual content audit from the live WP site)
- [ ] Dynamic knowledge hubs (e.g. "Local Service FAQs") — schema has the
      `hub` field on FAQs; the hub-assembly page itself isn't built yet
- [ ] Media library import — pipeline not started; needs the real asset
      export from WordPress
- [x] Internal linking — category hub pages and business profiles now render
      real related-article links automatically
- [x] SEO foundation — canonical, OG, Twitter, JSON-LD, sitemap generation

## Definition of Done — Phase 2 (Migration + MVP Launch)

- [x] Business Directory MVP — listing page with category filter chips,
      single business profile page with map-ready address/hours/contact
      fields, related-guides section
- [x] Category hub pages (`src/pages/[category].astro`) — every category
      automatically lists its businesses and articles, no manual page needed
- [x] SEO Migration Layer — `@astrojs/sitemap` wired up and generating
      `sitemap-index.xml` on every build; `robots.txt` in place;
      `data/redirects.csv` → `public/_redirects` pipeline working end to end
- [x] Content migration plan — `docs/content-migration-plan.md` maps every
      WP content type to the new schema field-by-field, with the SEO-check
      step built into the per-item process
- [x] Local Service Knowledge Hub — `hubs` collection + `src/pages/faqs/[hub].astro`
      is a reusable hub engine: groups featured FAQs by category, canonical
      dedup (`canonicalOf`), surfaces related businesses, links back to each
      category's full FAQ list. New hubs (Visitor FAQs, Pet Owner FAQs) are
      just a new JSON file in `src/content/hubs/` — zero new code.
- [x] **Real content migrated** — ran `scripts/migrate_wxr.py` against the
      actual `siouxfallsgo_WordPress_2026-07-29.xml` export. 25 real
      categories, 35 articles, 17 businesses, 18 content pages, 54 real
      redirects. Full findings in `docs/migration-report.md`.
- [ ] Search system — not started
- [ ] Real content migrated — the plan and pipeline exist; running it needs
      the actual WP export (database access or admin export + sitemap/URL
      list — see "What I still need" in the migration plan doc)
- [ ] "Claim your listing" flow — CTA link exists on directory/profile pages,
      target page not built (needs an auth decision first)
- [x] Real WP content migrated — 35 articles, 17 businesses, 18 pages, 25
      categories, all from the actual export, not samples
- [ ] WordPress no longer required — real content is in; still missing
      business address/phone/hours (GeoDirectory gap) and real FAQ content
      before this is a true 1:1 replacement

**Bottom line:** every *system* from the Phase 2 spec exists and has run
against real data — directory, category hubs, sitemap, redirects, and the
actual WordPress export are all connected end to end. Two real gaps surfaced
by running it for real (not hypothetical anymore):

1. **Business address/phone/hours is missing platform-wide.** GeoDirectory
   stores this in its own DB tables, not in the WXR export. Every migrated
   business needs this filled in via a GeoDirectory-specific export or DB
   access — see `docs/migration-report.md`.
2. **FAQ hub content is placeholder.** The live site's FAQ page rendered via
   a `[tae_faq_hub]` shortcode whose underlying Q&A data isn't in the export
   either. The hub *system* works (see `/faqs/local-service-faqs`); the real
   questions and answers still need to be authored or extracted from
   wherever that plugin actually stored them.

## Migration artifacts

- `scripts/migrate_wxr.py` — the real migration script, re-runnable if the
  WP export is refreshed (`python3 scripts/migrate_wxr.py` from project root)
- `docs/migration-report.md` — generated fresh each run: category merges
  applied, articles/businesses/pages migrated vs. skipped and why, redirect
  count
- `docs/content-migration-plan.md` — the field-mapping plan this script
  implements
- `data/redirects.csv` — 54 real old-URL → new-URL rows, generated from
  actual WordPress permalinks

## Running it

```bash
npm install
npm run dev       # local dev server
npm run build     # static build to dist/
npm run preview   # serve the built site locally
python3 scripts/migrate_wxr.py  # re-run migration if the WP export changes
```

## Next steps (pick one)

1. **GeoDirectory address export.** The single highest-value next input —
   unblocks real address/phone/hours on all 17 businesses and the map on
   business profile pages.
2. **FAQ content authoring.** Real Q&A pairs for the Local Service Knowledge
   Hub — the system is ready, it just has placeholder content.
3. **Search system.** Not started — needs a decision on approach (client-side
   index like Pagefind for a static site, vs. a hosted search service).
4. **"Claim your listing" flow.** Needs an auth decision first (magic link?
   Google login? Netlify Identity?) — relevant now that UsersWP shortcodes
   (`uwp_login`, `uwp_register`, etc.) were found in the real export as the
   thing this needs to replace.
2. **Search system.** Not started — needs a decision on approach (client-side
   index like Pagefind for a static site, vs. a hosted search service).
3. **"Claim your listing" flow.** Needs an auth decision first (magic link?
   Google login? Netlify Identity?) before it can be built.
4. **Homepage MVP polish.** Current homepage is functional but was built
   before the directory/category pages existed — worth a pass to surface
   featured businesses and category tiles per the Phase 2 spec.
