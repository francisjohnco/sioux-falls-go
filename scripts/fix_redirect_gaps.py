"""
Fills the real redirect gaps found in the initial migration:
1. Blog category archive URLs (/category/{slug}/) — 38 real URLs from the
   WXR export, none were redirected in the original migration since that
   only covered posts/pages/businesses, not taxonomy archive pages.
2. Nested parent/child category URLs (7 real ones, e.g.
   /category/for-locals/explore-sioux-falls/).
3. WordPress infrastructure pages that were intentionally not migrated as
   content (Login, Register, Checkout, etc.) — these still need somewhere
   to go instead of a bare 404, since they may be indexed or linked.

Run: python3 scripts/fix_redirect_gaps.py
Appends new rows to data/redirects.csv (dedups against existing rows).
"""
import csv
from pathlib import Path

ROOT = Path(__file__).parent.parent
REDIRECTS_CSV = ROOT / 'data/redirects.csv'

# Same canonical mapping used in migrate_wxr.py — old category nicename to
# new flat category slug. Where no real equivalent exists on the new site,
# maps to None (handled as a fallback to /guides below).
CATEGORY_REDIRECT_MAP = {
    'appliance-repair-service': 'appliance-repair-service',
    'cleaning-services': 'cleaning-services',
    'coffee-shops': 'coffee-shops',
    'consumer-guide': 'consumer-guide',
    'electricians': 'electricians',
    'flooring': 'flooring',
    'for-local-businesses': 'for-local-businesses',
    'for-locals': 'for-locals',
    'grow-with-sioux-falls-go': 'grow-with-sfg',
    'home-services': 'home-services',
    'home-watch-services': 'home-watch-services',
    'lawn-care': 'lawn-care',
    'local-spotlights': 'local-spotlights',
    'local-tree-services': 'local-tree-services',
    'marketing-agencies': 'marketing-agencies',
    'marketing-tips-insights': 'marketing-tips-insights',
    'painters': 'painters',
    'plumber': 'plumbers',       # alias merge
    'plumbing': 'plumbers',      # alias merge
    'professional-services': 'professional-services',
    'real-estate-agents': 'real-estate-agents',
    'restaurants-dining': 'restaurants-dining',
    'shopping-retail': 'shopping-retail',
    'window-cleaning': 'window-cleaning',
    'community-spotlight': 'community-spotlight',
    'explore-sioux-falls': 'explore-sioux-falls',
    # No real equivalent on the new site — send to The Loop rather than 404.
    # These were either single-use tags, duplicates, or content that got
    # folded into a broader category during migration.
    'activities': None,
    'events-in-sioux-falls': None,
    'family-fun': None,
    'featured': None,
    'guardian-expert-advice': None,
    'guardian-expert-advice-2': None,
    'living-in-sioux-falls': None,
    'sioux-falls-in-the-news': None,
    'sioux-falls-stories': None,
    'spotlight-giveaways': 'spotlight-giveaways',
    'uncategorized': None,
    'visiting-sioux-falls': 'explore-sioux-falls',
}

# Nested parent/child category URLs confirmed from the real site
NESTED_CATEGORY_PATHS = [
    ('for-local-businesses/grow-with-sioux-falls-go', 'grow-with-sioux-falls-go'),
    ('for-local-businesses/guardian-expert-advice', 'guardian-expert-advice'),
    ('for-locals/local-spotlights', 'local-spotlights'),
    ('for-local-businesses/marketing-tips-insights', 'marketing-tips-insights'),
    ('for-locals/sioux-falls-stories', 'sioux-falls-stories'),
    ('for-locals/community-spotlight', 'community-spotlight'),
    ('for-locals/explore-sioux-falls', 'explore-sioux-falls'),
]

# WordPress infrastructure pages that were deliberately not migrated as
# content (see PAGE_SKIP_TITLES in migrate_wxr.py) — still need a sensible
# destination instead of a bare 404.
INFRASTRUCTURE_REDIRECTS = {
    '/directory/': '/businesses',
    '/add-listing/': '/get-featured',
    '/search/': '/businesses',
    '/location/': '/businesses',
    '/register/': '/get-featured',
    '/login/': '/',
    '/account/': '/',
    '/forgot-password/': '/',
    '/reset-password/': '/',
    '/change-password/': '/',
    '/profile/': '/',
    '/users/': '/businesses',
    '/checkout/': '/',
    '/my-invoices/': '/',
    '/payment-confirmation/': '/',
    '/transaction-failed/': '/',
    '/my-subscriptions/': '/',
    '/advertising-dashboard/': '/',
    '/terms-and-conditions/': '/terms-of-use',
    '/blog/': '/guides',
    '/roadmap/': '/',  # internal-facing content, not for public consumption
}


def load_existing_rows():
    with open(REDIRECTS_CSV, newline='') as f:
        return list(csv.DictReader(f))


def main():
    rows = load_existing_rows()
    existing_old_urls = {r['old_url'] for r in rows}
    added = 0

    # Flat category archives
    for old_slug, new_slug in CATEGORY_REDIRECT_MAP.items():
        old_url = f'/category/{old_slug}/'
        if old_url in existing_old_urls:
            continue
        new_url = f'/{new_slug}' if new_slug else '/guides'
        rows.append({'old_url': old_url, 'new_url': new_url, 'status': '301', 'notes': 'category archive'})
        existing_old_urls.add(old_url)
        added += 1

    # Nested category archives
    for old_path, _ in NESTED_CATEGORY_PATHS:
        old_url = f'/category/{old_path}/'
        if old_url in existing_old_urls:
            continue
        child_slug = old_path.split('/')[-1]
        new_slug = CATEGORY_REDIRECT_MAP.get(child_slug)
        new_url = f'/{new_slug}' if new_slug else '/guides'
        rows.append({'old_url': old_url, 'new_url': new_url, 'status': '301', 'notes': 'nested category archive'})
        existing_old_urls.add(old_url)
        added += 1

    # WP infrastructure pages
    for old_url, new_url in INFRASTRUCTURE_REDIRECTS.items():
        if old_url in existing_old_urls:
            continue
        rows.append({'old_url': old_url, 'new_url': new_url, 'status': '301', 'notes': 'WP infrastructure page, not content'})
        existing_old_urls.add(old_url)
        added += 1

    with open(REDIRECTS_CSV, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=['old_url', 'new_url', 'status', 'notes'])
        writer.writeheader()
        writer.writerows(rows)

    print(f'Added {added} new redirect rows. Total now: {len(rows)}')


if __name__ == '__main__':
    main()
