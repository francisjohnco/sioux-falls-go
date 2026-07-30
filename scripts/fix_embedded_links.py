"""
Fixes embedded broken links: every migrated article's body content has
hardcoded absolute links to the dead siouxfallsgo.com WordPress URLs
(e.g. https://siouxfallsgo.com/tree-services-sioux-falls-guide/). These
were never touched by the redirect system, since redirects only handle
requests TO our own domain — not links embedded INSIDE content that point
to a domain that may not even resolve the same way anymore.

Resolution order for each embedded old link:
  1. Exact match against data/redirects.csv (old_url -> new_url)
  2. Exact match against any article's own sourceUrl field
  3. Fuzzy match: same last path segment ignoring trailing numbers/suffixes
  4. Fallback: link to the article's own category page (never leave a
     dead external link)

Run: python3 scripts/fix_embedded_links.py
"""
import csv
import re
from pathlib import Path

ROOT = Path(__file__).parent.parent
ARTICLES_DIR = ROOT / 'src/content/articles'
REDIRECTS_CSV = ROOT / 'data/redirects.csv'

OLD_DOMAIN_RE = re.compile(r'https?://siouxfallsgo\.com(/[^\s\)"]*)')


def normalize_path(p):
    return p.strip('/').lower()


def load_redirect_map():
    mapping = {}
    with open(REDIRECTS_CSV, newline='') as f:
        for row in csv.DictReader(f):
            mapping[normalize_path(row['old_url'])] = row['new_url']
    return mapping


def load_source_url_map():
    """Every article's own sourceUrl -> its real new /guides/{id} path."""
    mapping = {}
    for f in ARTICLES_DIR.glob('*.md'):
        text = f.read_text()
        m = re.search(r'^sourceUrl:\s*"([^"]+)"', text, re.MULTILINE)
        if m:
            old_path = re.sub(r'^https?://siouxfallsgo\.com', '', m.group(1))
            mapping[normalize_path(old_path)] = f'/guides/{f.stem}'
    return mapping


def load_category_map():
    """article filename -> its category slug, for the final fallback."""
    mapping = {}
    for f in ARTICLES_DIR.glob('*.md'):
        text = f.read_text()
        m = re.search(r'^category:\s*"([^"]+)"', text, re.MULTILINE)
        if m:
            mapping[f.stem] = m.group(1)
    return mapping


def main():
    redirect_map = load_redirect_map()
    source_url_map = load_source_url_map()
    category_map = load_category_map()

    total_fixed = 0
    total_fallback = 0
    files_touched = 0
    unresolved_log = []

    for f in ARTICLES_DIR.glob('*.md'):
        text = f.read_text()
        matches = list(OLD_DOMAIN_RE.finditer(text))
        if not matches:
            continue

        new_text = text
        file_had_fix = False

        for m in matches:
            full_match = m.group(0)
            old_path = normalize_path(m.group(1))

            resolved = redirect_map.get(old_path + '/') or redirect_map.get(old_path) \
                or source_url_map.get(old_path)

            if not resolved:
                # Fuzzy: strip trailing "-N" numeric suffixes and retry
                fuzzy_path = re.sub(r'-\d+$', '', old_path)
                resolved = redirect_map.get(fuzzy_path + '/') or redirect_map.get(fuzzy_path) \
                    or source_url_map.get(fuzzy_path)

            if resolved:
                new_text = new_text.replace(full_match, resolved)
                total_fixed += 1
                file_had_fix = True
            else:
                # Final fallback: this article's own category page
                cat = category_map.get(f.stem, '')
                fallback = f'/{cat}' if cat else '/guides'
                new_text = new_text.replace(full_match, fallback)
                total_fallback += 1
                file_had_fix = True
                unresolved_log.append(f'{f.stem}: {full_match} -> {fallback} (no exact match, used category fallback)')

        if file_had_fix:
            f.write_text(new_text)
            files_touched += 1

    print(f'Files touched: {files_touched}')
    print(f'Links resolved to a real match: {total_fixed}')
    print(f'Links sent to category fallback (no exact match found): {total_fallback}')
    if unresolved_log:
        print('\nFallback details (worth a manual look):')
        for line in unresolved_log:
            print(f'  {line}')


if __name__ == '__main__':
    main()
