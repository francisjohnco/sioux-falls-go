# Content Strategy — Reference for the Content Engine

This is the operating doc the Content AI (admin dashboard's Content Engine) works from. It translates the research findings into concrete production rules. Update this file when the strategy changes; every generated article should be checked against it before publishing.

## The core architecture

Two content types, never confused:

1. **Category guides** — evergreen knowledge-base articles tied to a category. Planned in advance, part of the launch matrix below.
2. **Business spotlights** — tied to a specific business via `relatedBusinesses`, published only for Community Champion (premium) businesses. **Never counted against a category's article quota.** Scheduled on an independent lane, whenever a business earns/renews Champion status — not planned per-category.

## Category classification and launch article count

**Service categories (12) — 4 articles each, fixed template:**
appliance-repair-service, cleaning-services, electricians, flooring, home-watch-services, lawn-care, local-tree-services, marketing-agencies, painters, plumbers, real-estate-agents, window-cleaning

**Never write dedicated category articles for parent/umbrella categories.** `home-services` and `professional-services` are umbrella categories in the real taxonomy — Home Services covers Electricians, Plumbers, Painters, Lawn Care, Cleaning Services, etc.; Professional Services covers Marketing Agencies, Attorneys, Accountants, Financial Advisors, etc. A "how much does Home Services cost" article is meaningless — that content belongs on the specific trade category instead. If a business is tagged to a parent category with no more specific match, it still gets listed there, but the category doesn't get its own 4-article set. Watch for this pattern before adding any new category to the launch matrix — check whether it's actually an umbrella for categories that already exist.

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
6. **3 embedded FAQs per article** (`embeddedFaqs` field), distinct from the category's dedicated FAQ article — these should answer narrower questions specific to that article's angle (e.g. the cost guide's FAQs are about pricing mechanics, not general category questions already covered elsewhere). This renders as a visible FAQ section on the page and generates real `FAQPage` schema alongside the `Article` schema — do not duplicate questions already covered in the category's dedicated FAQ article.

## Two-phase launch split

Splitting ~80 articles into two phases, both backdated as if they'd been publishing steadily since December 2023:

- **Phase 1 (dated Dec 2023 – Dec 2024):** the highest-demand service categories first — Electricians, Plumbers, Painters, Flooring, Lawn Care, Home Services, Cleaning Services, Real Estate Agents — plus the two resident-general categories and Explore Sioux Falls. Roughly half the total matrix.
- **Phase 2 (dated Jan 2025 – Dec 2025):** the remaining service categories (Home Watch, Local Tree Services, Window Cleaning, Appliance Repair, Marketing Agencies, Professional Services) plus the three dual local+visitor categories (Coffee Shops, Restaurants & Dining, Shopping & Retail).

## Article Sponsorship (Community Champion perk)

Any article can carry a `sponsoredBy` field (a business reference) — this renders a clearly-labeled "Sponsored" banner between the byline and the article body, pulling the sponsor's image, name, and a link back to their profile. **Only Community Champion tier businesses are eligible to sponsor** — this is a paid-tier benefit, not something available to Community Listing (free) businesses.

Default copy (editable per placement if needed):
> "This article is made possible by [Business Name]. They serve Sioux Falls with excellence, and their support helps us keep bringing free, local content to our community."

The banner is intentionally styled distinctly from organic content — orange border, an explicit "SPONSORED" eyebrow label — so it's never mistaken for editorial endorsement. A sponsor doesn't need to be topically related to the article; sponsorship is about supporting the platform, not implying the article is about their specific service.

## Before writing any category's articles — check existing content first

**Real lesson from production:** Local Tree Services already had 5 substantial migrated articles (cost, winter prep, when-to-remove, emergency removal, general guide) before this launch batch started. Writing a fresh 4-article set blind would have cannibalized real existing content. The fix: before planning or writing a category's articles, run `grep -l "category: \"CATEGORY-SLUG\"" src/content/articles/*.md` to see what already exists, and only fill genuine gaps. For Local Tree Services, that meant adding just a choose/hire guide and a consolidated FAQ, then cross-linking all 7 articles together — not writing a redundant cost or seasonal piece.

## E-E-A-T checklist before publishing any article

- [ ] Named author with a real bio/persona, not "Sioux Falls Go Editorial" alone
- [ ] `aiAssisted: true` set honestly, `reviewedBy` filled in
- [ ] At least one genuinely local, non-genericizable fact
- [ ] No keyword-cannibalizing overlap with another article in the same category
- [ ] Resource CTA present, no sales language
- [ ] 3+ related articles linked
- [ ] Publish date follows the backdating rule above
