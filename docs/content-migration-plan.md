# Content Migration Plan — WordPress → Sioux Falls Go Platform

This maps every WP content type in the Phase 2 spec to the schema already
built in `src/content.config.ts`, and defines the process for migrating each
item without losing SEO value.

## Field mapping

### WP Posts/Pages → Articles
| WordPress field | New schema field | Notes |
|---|---|---|
| Title | `title` | direct |
| Permalink | route (`/guides/{id}`) | **decision needed**: keep old URL via redirect, or migrate to new structure? See redirect rule below. |
| Categories/Tags | `category` (single, required) | WP allows multiple categories per post; new schema requires exactly one. Pick the primary category per post during migration — this is a manual editorial pass, not automatable. |
| Featured image | `heroImage` | re-optimize on import (see Media below) |
| Content body | markdown body | convert from WP block/HTML to markdown; check for shortcodes that won't survive conversion (see Shortcode Audit below) |
| Author | `author` | direct |
| Publish date | `publishedAt` | direct |
| Modified date | `updatedAt` | direct |
| Yoast/RankMath meta title | `seo.title` | direct |
| Yoast/RankMath meta description | `seo.description` | direct |
| — (new field) | `aiAssisted`, `reviewedBy` | set `false`/blank for all migrated content — these are existing human-written articles, not Content Engine output |
| — (new field) | `evergreen` | default `true` unless the article is clearly time-bound (event recap, old news) |

### WP Categories → Categories
| WordPress field | New schema field | Notes |
|---|---|---|
| Category name | `name` | direct |
| Category slug | `slug` | **audit required**: check for near-duplicate categories (e.g. "Electrician" vs "Electricians") and merge into one canonical category + `aliases` entry, per the "no duplicate content" rule in Phase 1 |
| — (new field) | `playbook.topics`, `playbook.contentTypes` | not in WP — must be authored per category during migration (this is what makes it a "knowledge hub" instead of a flat archive page) |

### Business listings (GeoDirectory or custom post type) → Businesses
| WordPress field | New schema field | Notes |
|---|---|---|
| Business name | `name` | direct |
| Address | `address` | direct |
| Phone | `phone` | direct |
| Website | `website` | direct |
| Business hours | `hours` | direct |
| Category | `category` | same single-category constraint as articles |
| Logo/photos | `heroImage` | re-optimize on import |
| Claimed status | `claimed` | direct if GeoDirectory tracked this; default `false` otherwise |
| — (new field) | `verifiedAt` | set to migration date — this becomes the Data Engine's freshness baseline going forward |

### FAQs → FAQs
| WordPress field | New schema field | Notes |
|---|---|---|
| Question | `question` | direct |
| Answer | markdown body | direct |
| Category | `category` | direct |
| — (new field) | `hub` | assign which dynamic hub page(s) this should feed (e.g. `visitor-faqs`) — manual pass |

## Process per content item (required before publish)

1. Export from WP (title, body, meta, category, images, publish date)
2. Convert body HTML → markdown, flag any shortcodes for manual rewrite
3. Assign single canonical category (merge duplicates per the audit above)
4. Re-optimize and re-host images, preserve alt text
5. Fill new required fields (`aiAssisted: false`, `evergreen`, etc.)
6. **SEO check**: does the new URL match the old one?
   - Yes → no redirect needed
   - No → add a row to `data/redirects.csv`, regenerate `_redirects`
7. Spot-check rendered page against the live WP version for missing content

## Shortcode audit (do this before bulk migration)

List every shortcode currently in use on the WP site (search the database for
`[` patterns in post content) and decide, per shortcode:
- **Keep** → becomes a real Astro component
- **Replace** → becomes a new platform feature (e.g. a WP review shortcode → the future review engine)
- **Drop** → content rewritten without it

This can't be estimated without the actual list — send it over and I'll turn
it into a component-by-component plan.

## What I still need from you to execute this for real

- WP database export or admin access (to pull the actual post/category/business list)
- The current XML sitemap or a full URL list, so `data/redirects.csv` covers every real URL instead of the 4 samples in it now
- The shortcode list mentioned above
