"""
Enrich migrated business content with real GeoDirectory data.
Run: python3 scripts/enrich_geodirectory.py

Fixes the single biggest gap from the original WXR migration: address,
phone, hours, and coordinates live in GeoDirectory's own CSV export, not
the standard WordPress export.
"""
import re
import json
from pathlib import Path
from datetime import datetime, timezone
import pandas as pd
from slugify import slugify

ROOT = Path(__file__).parent.parent
PLACES_CSV = "/mnt/user-data/uploads/gd_place_2907261620_a5448e11.csv"
CATEGORIES_CSV = "/mnt/user-data/uploads/gd_placecategory_2907261621_5778b22c.csv"

DAY_NAMES = {'Mo': 'Mon', 'Tu': 'Tue', 'We': 'Wed', 'Th': 'Thu', 'Fr': 'Fri', 'Sa': 'Sat', 'Su': 'Sun'}


def parse_hours(raw):
    """Convert GeoDirectory's '["Mo 09:00-17:00","Tu 09:00-17:00"]' format
    into a friendly string like 'Mon-Fri 9am-5pm'."""
    if pd.isna(raw):
        return None
    day_part = raw.split('],[')[0].strip('[]')
    entries = [e.strip('"') for e in day_part.split(',') if e.strip('"')]

    parsed = []
    for entry in entries:
        m = re.match(r'(\w\w) (\d\d):(\d\d)-(\d\d):(\d\d)', entry)
        if not m:
            continue
        day, sh, sm, eh, em = m.groups()
        parsed.append((DAY_NAMES.get(day, day), int(sh), int(sm), int(eh), int(em)))

    if not parsed:
        return None

    def fmt_time(h, m):
        period = 'am' if h < 12 else 'pm'
        h12 = h % 12
        if h12 == 0:
            h12 = 12
        return f"{h12}{':' + str(m).zfill(2) if m else ''}{period}"

    # Group consecutive days with identical hours
    groups = []
    for day, sh, sm, eh, em in parsed:
        time_str = f"{fmt_time(sh, sm)}-{fmt_time(eh, em)}"
        if groups and groups[-1][1] == time_str:
            groups[-1][0].append(day)
        else:
            groups.append(([day], time_str))

    parts = []
    for days, time_str in groups:
        day_label = f"{days[0]}-{days[-1]}" if len(days) > 2 else ', '.join(days)
        parts.append(f"{day_label} {time_str}")
    return '; '.join(parts)


def clean_phone(raw):
    if pd.isna(raw):
        return None
    return str(raw).strip()


def main():
    places = pd.read_csv(PLACES_CSV)
    published = places[places['post_status'] == 'publish']

    biz_dir = ROOT / 'src/content/businesses'
    updated, not_found = [], []

    for _, row in published.iterrows():
        name = row['post_title']
        slug = slugify(name)
        # a few names drifted between WP export and GeoDirectory export — handle known aliases
        candidates = [slug, slugify(name).replace('-cafe', '-cafe').replace('café', 'cafe')]
        biz_file = None
        for c in candidates:
            p = biz_dir / f'{c}.md'
            if p.exists():
                biz_file = p
                break
        if not biz_file:
            # try fuzzy match against existing files
            for f in biz_dir.glob('*.md'):
                if slugify(name.lower())[:12] in f.stem:
                    biz_file = f
                    break
        if not biz_file:
            not_found.append(name)
            continue

        content = biz_file.read_text()
        fm_match = re.match(r'^---\n(.*?)\n---\n(.*)$', content, re.DOTALL)
        if not fm_match:
            not_found.append(f"{name} (no frontmatter parsed)")
            continue
        frontmatter, body = fm_match.groups()

        address = f"{row['street']}, {row['city']}, {row['region']} {row['zip']}" if pd.notna(row['street']) else None
        phone = clean_phone(row['phone'])
        hours = parse_hours(row['business_hours'])
        claimed = bool(row['claimed'] == 1)
        lat, lng = row.get('latitude'), row.get('longitude')

        # Inject/replace fields in frontmatter
        def set_field(fm, key, value, quote=True):
            if value is None:
                return fm
            val_str = json.dumps(value) if quote else str(value)
            if re.search(rf'^{key}:.*$', fm, re.MULTILINE):
                return re.sub(rf'^{key}:.*$', f'{key}: {val_str}', fm, flags=re.MULTILINE)
            return fm + f'\n{key}: {val_str}'

        frontmatter = set_field(frontmatter, 'address', address)
        frontmatter = set_field(frontmatter, 'phone', phone)
        frontmatter = set_field(frontmatter, 'hours', hours)
        frontmatter = re.sub(r'^claimed:.*$', f'claimed: {"true" if claimed else "false"}', frontmatter, flags=re.MULTILINE)
        if pd.notna(lat) and pd.notna(lng):
            frontmatter = set_field(frontmatter, 'latitude', round(float(lat), 6), quote=False)
            frontmatter = set_field(frontmatter, 'longitude', round(float(lng), 6), quote=False)

        biz_file.write_text(f'---\n{frontmatter}\n---\n{body}')
        updated.append(name)

    print(f"Updated: {len(updated)}")
    for n in updated:
        print(f"  ✓ {n}")
    if not_found:
        print(f"\nNo matching file found for {len(not_found)}:")
        for n in not_found:
            print(f"  ✗ {n}")


if __name__ == '__main__':
    main()
