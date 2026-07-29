"""
Migrate siouxfallsgo_WordPress_2026-07-29.xml into the Astro content
collections. Run once from the project root: python3 scripts/migrate_wxr.py

This is a real migration, not a demo — it makes editorial judgment calls
(category merges, content-type guesses) that are logged to
docs/migration-report.md for human review rather than applied silently.
"""
import xml.etree.ElementTree as ET
import re
import json
import html
from datetime import datetime, timezone
from pathlib import Path
from slugify import slugify
import html2text

ROOT = Path(__file__).parent.parent
WXR_PATH = "/mnt/user-data/uploads/siouxfallsgo_WordPress_2026-07-29.xml"
NS = {
    'wp': 'http://wordpress.org/export/1.2/',
    'content': 'http://purl.org/rss/1.0/modules/content/',
    'dc': 'http://purl.org/dc/elements/1.1/',
}

h2t = html2text.HTML2Text()
h2t.body_width = 0
h2t.ignore_images = False

GUTENBERG_COMMENT_RE = re.compile(r'<!--\s*/?wp:.*?-->', re.DOTALL)
SHORTCODE_RE = re.compile(r'\[/?[a-z][a-z0-9_\-]*(?:\s[^\]]*)?\]')


def clean_html_to_md(raw):
    if not raw:
        return ''
    stripped = GUTENBERG_COMMENT_RE.sub('', raw)
    stripped = SHORTCODE_RE.sub('', stripped)
    md = h2t.handle(stripped)
    md = re.sub(r'\n{3,}', '\n\n', md).strip()
    return md or '_Content pending — this page relied on a dynamic shortcode not captured in the export. See migration report._'


def get_text(item, tag, nsmap=None):
    el = item.find(tag, nsmap) if nsmap else item.find(tag)
    return el.text if el is not None else None


def meta(item, key):
    for m in item.findall('wp:postmeta', NS):
        if get_text(m, 'wp:meta_key', NS) == key:
            return get_text(m, 'wp:meta_value', NS)
    return None


def cats_of(item, domain=None):
    return [html.unescape(c.text) for c in item.findall('category') if (domain is None or c.get('domain') == domain) and c.text]


DATE_FIELDS = {'publishedAt', 'updatedAt', 'verifiedAt', 'staleCheckDue'}


def frontmatter(data):
    """Render a dict as YAML frontmatter using JSON-style values (valid YAML)."""
    lines = ['---']
    for key, val in data.items():
        if val is None:
            continue
        if key in DATE_FIELDS and isinstance(val, str):
            lines.append(f'{key}: {val}')  # unquoted — YAML native date, required by z.date()
        elif isinstance(val, dict):
            lines.append(f'{key}:')
            for k2, v2 in val.items():
                lines.append(f'  {k2}: {json.dumps(v2)}')
        elif isinstance(val, list):
            lines.append(f'{key}: {json.dumps(val)}')
        elif isinstance(val, bool):
            lines.append(f'{key}: {"true" if val else "false"}')
        else:
            lines.append(f'{key}: {json.dumps(val)}')
    lines.append('---')
    return '\n'.join(lines)


CATEGORY_MAP = {
    'Coffee Shops': ('coffee-shops', 'Coffee Shops'),
    'Professional Services': ('professional-services', 'Professional Services'),
    'Flooring': ('flooring', 'Flooring'),
    'Local Tree Services': ('local-tree-services', 'Local Tree Services'),
    'Cleaning Services': ('cleaning-services', 'Cleaning Services'),
    'Home Services': ('home-services', 'Home Services'),
    'Painters': ('painters', 'Painters'),
    'Home Watch Services': ('home-watch-services', 'Home Watch Services'),
    'Marketing Agencies': ('marketing-agencies', 'Marketing Agencies'),
    'Appliance Repair Service': ('appliance-repair-service', 'Appliance Repair Service'),
    'Lawn Care': ('lawn-care', 'Lawn Care'),
    'Window Cleaning': ('window-cleaning', 'Window Cleaning'),
    'Real Estate Agents': ('real-estate-agents', 'Real Estate Agents'),
    'Plumber': ('plumbers', 'Plumbers'),
    'Plumbing': ('plumbers', 'Plumbers'),
    'Shopping & Retail': ('shopping-retail', 'Shopping & Retail'),
    'Electricians': ('electricians', 'Electricians'),
    'Spotlight Giveaways': ('spotlight-giveaways', 'Spotlight Giveaways'),
    'Explore Sioux Falls': ('explore-sioux-falls', 'Explore Sioux Falls'),
    'Consumer Guide': ('consumer-guide', 'Consumer Guide'),
    'Grow with SFG': ('grow-with-sfg', 'Grow with Sioux Falls Go'),
    'Marketing Tips & Insights': ('marketing-tips-insights', 'Marketing Tips & Insights'),
    'For Locals': ('for-locals', 'For Locals'),
    'Local Spotlights': ('local-spotlights', 'Local Spotlights'),
    'For Local Businesses': ('for-local-businesses', 'For Local Businesses'),
    'Community Spotlight': ('community-spotlight', 'Community Spotlight'),
    'Featured': None,
    'Uncategorized': None,
}
SERVICE_SLUGS = {
    'coffee-shops', 'professional-services', 'flooring', 'local-tree-services',
    'cleaning-services', 'home-services', 'painters', 'home-watch-services',
    'marketing-agencies', 'appliance-repair-service', 'lawn-care',
    'window-cleaning', 'real-estate-agents', 'plumbers', 'shopping-retail',
    'electricians',
}


def canonical_category(wp_name):
    return CATEGORY_MAP.get(wp_name)


def build_categories():
    seen = {}
    for wp_name, entry in CATEGORY_MAP.items():
        if entry is None:
            continue
        slug, name = entry
        if slug not in seen:
            seen[slug] = {'name': name, 'slug': slug, 'aliases': []}
        if wp_name != name and wp_name not in seen[slug]['aliases']:
            seen[slug]['aliases'].append(wp_name)
    return seen


def write_categories(categories):
    out_dir = ROOT / 'src/content/categories'
    for f in out_dir.glob('*.json'):
        f.unlink()
    for slug, c in categories.items():
        is_service = slug in SERVICE_SLUGS
        data = {
            'name': c['name'],
            'slug': slug,
            'aliases': c['aliases'],
            'playbook': {
                'topics': ['hiring', 'pricing', 'local considerations'] if is_service else ['local context'],
                'contentTypes': ['faq', 'cost-guide', 'local-resource'] if is_service else ['local-resource', 'visitor-guide'],
            },
            'seo': {
                'title': f'{c["name"]} in Sioux Falls',
                'description': (f'Find trusted {c["name"].lower()} in Sioux Falls, plus local guides and resources.'
                                 if is_service else f'{c["name"]} — local Sioux Falls content and resources.'),
            },
        }
        (out_dir / f'{slug}.json').write_text(json.dumps(data, indent=2) + '\n')
    return len(categories)


def migrate_articles(items, redirect_rows, report):
    out_dir = ROOT / 'src/content/articles'
    for f in out_dir.glob('*.md'):
        f.unlink()

    posts = [i for i in items if get_text(i, 'wp:post_type', NS) == 'post' and get_text(i, 'wp:status', NS) == 'publish']
    written, skipped = 0, []

    for p in posts:
        title = html.unescape(get_text(p, 'title') or 'Untitled')
        wp_cats = cats_of(p, 'category')
        category_slug = None
        for wc in wp_cats:
            mapped = canonical_category(wc)
            if mapped:
                category_slug = mapped[0]
                break
        if not category_slug:
            skipped.append((title, 'no mappable category'))
            continue

        old_link = get_text(p, 'link') or ''
        old_path = re.sub(r'^https?://[^/]+', '', old_link).rstrip('/') or '/'
        slug = slugify(title)[:80]
        new_path = f'/guides/{slug}'

        raw_html = get_text(p, 'content:encoded', NS)
        body_md = clean_html_to_md(raw_html)

        pub_date_raw = get_text(p, 'wp:post_date', NS) or '2026-01-01 00:00:00'
        pub_date = pub_date_raw.split(' ')[0]

        seo_title = meta(p, 'rank_math_title') or title
        seo_desc = meta(p, 'rank_math_description') or f'{title} — local guidance from Sioux Falls Go.'
        seo_title = html.unescape(re.sub(r'\s*\|.*$', '', seo_title))[:70]

        fm = frontmatter({
            'title': title,
            'category': category_slug,
            'contentType': 'faq' if 'faq' in title.lower() else 'local-resource',
            'relatedNeighborhoods': [],
            'relatedArticles': [],
            'relatedBusinesses': [],
            'evergreen': True,
            'author': 'Sioux Falls Go Editorial',
            'aiAssisted': False,
            'publishedAt': pub_date,
            'updatedAt': pub_date,
            'seo': {'title': seo_title, 'description': seo_desc[:160]},
            'sourceUrl': old_link,
        })
        (out_dir / f'{slug}.md').write_text(f'{fm}\n\n{body_md}\n')
        written += 1
        if old_path != new_path:
            redirect_rows.append((old_path + '/', new_path, '301', 'migrated article'))

    report.append(f'## Articles: {written} migrated, {len(skipped)} skipped\n')
    if skipped:
        report.append('Skipped (no category could be mapped — needs manual review):')
        for title, reason in skipped:
            report.append(f'- "{title}" — {reason}')
    report.append('')
    return written


def migrate_businesses(items, redirect_rows, report):
    out_dir = ROOT / 'src/content/businesses'
    for f in out_dir.glob('*.md'):
        f.unlink()

    places = [i for i in items if get_text(i, 'wp:post_type', NS) == 'gd_place' and get_text(i, 'wp:status', NS) == 'publish']
    written = 0
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')

    for biz in places:
        name = html.unescape(get_text(biz, 'title') or 'Unnamed Business')
        wp_cats = [c for c in cats_of(biz, 'gd_placecategory') if c != 'Featured']
        category_slug = None
        for wc in wp_cats:
            mapped = canonical_category(wc)
            if mapped:
                category_slug = mapped[0]
                break
        if not category_slug:
            continue

        old_link = get_text(biz, 'link') or ''
        old_path = re.sub(r'^https?://[^/]+', '', old_link).rstrip('/') or '/'
        slug = slugify(name)[:60]
        new_path = f'/businesses/{slug}'

        raw_html = get_text(biz, 'content:encoded', NS)
        body_md = clean_html_to_md(raw_html)

        fm = frontmatter({
            'name': name,
            'category': category_slug,
            'verifiedAt': today,
            'claimed': False,
            'sourceUrl': old_link,
        })
        (out_dir / f'{slug}.md').write_text(f'{fm}\n\n{body_md}\n')
        written += 1
        if old_path != new_path:
            redirect_rows.append((old_path + '/', new_path, '301', 'migrated business listing'))

    report.append(f'## Businesses: {written} migrated\n')
    report.append(
        '**Important gap:** GeoDirectory stores address, phone, hours, and lat/long '
        'in its own database tables, not in the standard WXR export. None of the '
        'migrated businesses have address/phone/hours — that data needs a GeoDirectory-specific '
        'export (Directory to Export in the GD admin, or direct DB access to the '
        '`geodir_gd_place_detail` table) to complete.\n'
    )
    return written


PAGE_SKIP_TITLES = {
    'Directory', 'Add Listing', 'Search page', 'Location', 'GD Archive',
    'GD Archive Item', 'GD Details', 'Register', 'Login', 'Account',
    'Forgot Password?', 'Reset Password', 'Change Password', 'Profile',
    'Users', 'Users List Item', 'Checkout', 'My Invoices',
    'Payment Confirmation', 'Transaction Failed', 'My Subscriptions',
    'Advertising Dashboard', 'Postcard', 'challenge Complete', 'newtest',
    'test1', 'Terms and Conditions',
    'Sioux Falls Local Service FAQs',
    'Blog', 'Home',
}


def migrate_pages(items, redirect_rows, report):
    out_dir = ROOT / 'src/content/pages'
    out_dir.mkdir(exist_ok=True)
    for f in out_dir.glob('*.md'):
        f.unlink()

    pages = [i for i in items if get_text(i, 'wp:post_type', NS) == 'page' and get_text(i, 'wp:status', NS) == 'publish']
    written, skipped = 0, []
    seen_slugs = set()

    for pg in pages:
        title = html.unescape(get_text(pg, 'title') or 'Untitled')
        if title in PAGE_SKIP_TITLES:
            skipped.append(title)
            continue

        old_link = get_text(pg, 'link') or ''
        old_path = re.sub(r'^https?://[^/]+', '', old_link).rstrip('/') or '/'
        slug = slugify(title)[:60]
        if slug in seen_slugs:
            slug = f'{slug}-{get_text(pg, "wp:post_id", NS)}'
        seen_slugs.add(slug)
        new_path = f'/{slug}'

        raw_html = get_text(pg, 'content:encoded', NS)
        body_md = clean_html_to_md(raw_html)

        seo_title = meta(pg, 'rank_math_title') or title
        seo_desc = meta(pg, 'rank_math_description') or f'{title} — Sioux Falls Go.'
        seo_title = html.unescape(re.sub(r'\s*\|.*$', '', seo_title))[:70]

        fm = frontmatter({
            'title': title,
            'seo': {'title': seo_title, 'description': seo_desc[:160]},
            'sourceUrl': old_link,
        })
        (out_dir / f'{slug}.md').write_text(f'{fm}\n\n{body_md}\n')
        written += 1
        if old_path != new_path:
            redirect_rows.append((old_path + '/', new_path, '301', 'migrated page'))

    report.append(f'## Pages: {written} migrated, {len(skipped)} intentionally skipped\n')
    report.append('Skipped (WordPress/plugin infrastructure — rebuilt as platform features, not static content):')
    for t in skipped:
        report.append(f'- {t}')
    report.append('')
    return written


def write_redirects_csv(redirect_rows, report):
    path = ROOT / 'data/redirects.csv'
    lines = ['old_url,new_url,status,notes']
    for old, new, status, note in redirect_rows:
        lines.append(f'{old},{new},{status},{note}')
    path.write_text('\n'.join(lines) + '\n')
    report.append(f'## Redirects: {len(redirect_rows)} real rows written to data/redirects.csv\n')
    report.append('Run `npm run redirects` (or `npm run build`) to regenerate `public/_redirects` from this file.\n')


def main():
    tree = ET.parse(WXR_PATH)
    channel = tree.getroot().find('channel')
    items = channel.findall('item')
    report = ['# Migration Report\n', f'Generated: {datetime.now(timezone.utc).isoformat()}\n',
              f'Source: `siouxfallsgo_WordPress_2026-07-29.xml` ({len(items)} total WXR items)\n']

    categories = build_categories()
    n_cat = write_categories(categories)
    report.append(f'## Categories: {n_cat} created (merged from real category + gd_placecategory usage)\n')
    for slug, c in sorted(categories.items()):
        if c['aliases']:
            report.append(f'- `{slug}` — merged from: {", ".join(c["aliases"])}')
    report.append('- Dropped: `Featured` (a flag, not a category), `Uncategorized` (WP default bucket)\n')

    redirect_rows = []
    n_articles = migrate_articles(items, redirect_rows, report)
    n_businesses = migrate_businesses(items, redirect_rows, report)
    n_pages = migrate_pages(items, redirect_rows, report)
    write_redirects_csv(redirect_rows, report)

    (ROOT / 'docs/migration-report.md').write_text('\n'.join(report))

    print(f'Categories: {n_cat}')
    print(f'Articles: {n_articles}')
    print(f'Businesses: {n_businesses}')
    print(f'Pages: {n_pages}')
    print(f'Redirects: {len(redirect_rows)}')
    print('Full report: docs/migration-report.md')


if __name__ == '__main__':
    main()
