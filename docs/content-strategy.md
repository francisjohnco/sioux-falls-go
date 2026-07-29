# Content Strategy — Reference for the Content Engine

This is the operating doc the Content AI (admin dashboard's Content Engine) works from. It translates the research findings into concrete production rules. Update this file when the strategy changes; every generated article should be checked against it before publishing.

## The core architecture

Two content types, never confused:

1. **Category guides** — evergreen knowledge-base articles tied to a category. Planned in advance, part of the launch matrix below.
2. **Business spotlights** — tied to a specific business via `relatedBusinesses`, published only for Community Champion (premium) businesses. **Never counted against a category's article quota.** Scheduled on an independent lane, whenever a business earns/renews Champion status — not planned per-category.

## Category classification and launch article count

**Service categories (14) — 4 articles each, fixed template:**
appliance-repair-service, cleaning-services, electricians, flooring, home-services, home-watch-services, lawn-care, local-tree-services, marketing-agencies, painters, plumbers, professional-services, real-estate-agents, window-cleaning

Each gets exactly these four, one per intent (never two articles competing for the same intent — that's cannibalization):
1. **Cost guide** — "How much does [X] cost in Sioux Falls?" (informational/highest search volume)
2. **Choose/hire guide** — "How to choose a [X] in Sioux Falls" (commercial-comparison intent — what to check, licensing/permits, red flags)
3. **Seasonal/local guide** — tied to a real Sioux Falls specific (winter freeze-thaw, hard water, expansive clay soil, hail season, frost depth) — this is where "expert neighbor" voice lives, not genericizable
4. **FAQ guide** — consolidated Q&A article for the category, feeds the Local Service Knowledge Hub via the `hub` field

**Dual local+visitor categories (3) — 5 articles each, different template:**
coffee-shops, restaurants-dining, shopping-retail

Template: (1) anchor/overview "Best [X] in Sioux Falls," (2) a resident-angle deep-dive (e.g. "best coffee shops for remote work"), (3) a visitor-angle guide (e.g. "where to eat downtown if you're just passing through"), (4) a neighborhood-specific piece, (5) a seasonal piece.

**Visitor-primary (1) — 5 articles:**
explore-sioux-falls — anchor overview, Falls Park deep-dive, downtown/Phillips Ave + SculptureWalk, family/kids guide, seasonal (winter or summer) guide.

**Resident-general (2) — 4 articles each:**
consumer-guide, for-locals — broad resident-interest pieces, not tied to one service category.

**Not in this launch batch — flagged for a separate content decision, not forced into the 4-article template:**
- `for-local-businesses`, `grow-with-sfg`, `marketing-tips-insights` — these three overlap significantly (all business-owner-facing marketing content) and were merged from near-duplicate WP categories. Recommend consolidating into one lane before planning dedicated articles, rather than writing 12 articles across three categories that compete with each other.
- `community-spotlight`, `local-spotlights`, `spotlight-giveaways` — these are where spotlight/giveaway content lives, not evergreen guide categories. No dedicated launch articles; they fill naturally as spotlights and giveaways publish.

## Publish dates — backdating rule

**All newly generated launch content gets a backdated `publishedAt` between December 2023 and December 2025.** No new article gets a date later than December 2025, except:
- **Migrated articles keep their real original WordPress publish date** (already set correctly from the WXR export — do not touch).
- Dates must be **spread naturally, not evenly** — realistic editorial cadence has clusters and gaps, not one article every N days like a script. See `scripts/generate_editorial_calendar.py` for the actual date assignment.
- Phase 1 content (see below) gets earlier dates (Dec 2023–Dec 2024); Phase 2 gets later dates (Jan 2025–Dec 2025).
- `updatedAt` can be later than `publishedAt` (a real refresh), but still not later than the actual present-day equivalent when this is really launched.

## Every article must have

1. **A named author byline** (already a schema field — never leave as generic "Editorial" for launch content if avoidable; use a consistent small set of named local-editor personas rather than one anonymous byline).
2. **At least 3 related articles** — the template auto-fills to 3 using same-category articles if fewer than 3 are explicitly set via `relatedArticles`, but explicit curation is better than the automatic fallback.
3. **A resource-style CTA, never a sales CTA** — every article ends with a link to the category page (browse the directory) or another article. Never "buy now" / "call today" language in the CTA itself — that belongs on business profile pages, not editorial content.
4. **Business chips when relevant** — if the article names specific businesses, link them via `relatedBusinesses` so they render as clickable chips.
5. **Real Sioux Falls specificity in at least one paragraph** — a named place, a real climate/soil/water fact, a real local regulation. Generic content that could describe any city fails review.

## Two-phase launch split

Splitting ~80 articles into two phases, both backdated as if they'd been publishing steadily since December 2023:

- **Phase 1 (dated Dec 2023 – Dec 2024):** the highest-demand service categories first — Electricians, Plumbers, Painters, Flooring, Lawn Care, Home Services, Cleaning Services, Real Estate Agents — plus the two resident-general categories and Explore Sioux Falls. Roughly half the total matrix.
- **Phase 2 (dated Jan 2025 – Dec 2025):** the remaining service categories (Home Watch, Local Tree Services, Window Cleaning, Appliance Repair, Marketing Agencies, Professional Services) plus the three dual local+visitor categories (Coffee Shops, Restaurants & Dining, Shopping & Retail).

## E-E-A-T checklist before publishing any article

- [ ] Named author with a real bio/persona, not "Sioux Falls Go Editorial" alone
- [ ] `aiAssisted: true` set honestly, `reviewedBy` filled in
- [ ] At least one genuinely local, non-genericizable fact
- [ ] No keyword-cannibalizing overlap with another article in the same category
- [ ] Resource CTA present, no sales language
- [ ] 3+ related articles linked
- [ ] Publish date follows the backdating rule above
