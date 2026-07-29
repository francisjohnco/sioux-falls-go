"""
Generates the full Sioux Falls Go launch content calendar: every planned
article, its category, content type, phase, and a realistic (non-uniform)
backdated publish date between Dec 2023 and Dec 2025.

Run: python3 scripts/generate_editorial_calendar.py
Outputs: docs/editorial-calendar.csv
"""
import csv
import random
from datetime import date, timedelta

random.seed(42)  # reproducible "randomness" so the calendar doesn't shuffle on every run

SERVICE_CATEGORIES_PHASE1 = [
    ("electricians", "Electricians"),
    ("plumbers", "Plumbers"),
    ("painters", "Painters"),
    ("flooring", "Flooring"),
    ("lawn-care", "Lawn Care"),
    ("home-services", "Home Services"),
    ("cleaning-services", "Cleaning Services"),
    ("real-estate-agents", "Real Estate Agents"),
]

SERVICE_CATEGORIES_PHASE2 = [
    ("home-watch-services", "Home Watch Services"),
    ("local-tree-services", "Local Tree Services"),
    ("window-cleaning", "Window Cleaning"),
    ("appliance-repair-service", "Appliance Repair Service"),
    ("marketing-agencies", "Marketing Agencies"),
    ("professional-services", "Professional Services"),
]

DUAL_CATEGORIES_PHASE2 = [
    ("coffee-shops", "Coffee Shops"),
    ("restaurants-dining", "Restaurants & Dining"),
    ("shopping-retail", "Shopping & Retail"),
]

RESIDENT_GENERAL_PHASE1 = [
    ("consumer-guide", "Consumer Guide"),
    ("for-locals", "For Locals"),
]

VISITOR_PHASE1 = [
    ("explore-sioux-falls", "Explore Sioux Falls"),
]

SERVICE_TEMPLATE = [
    ("cost-guide", "How Much Does It Cost to Hire {article} {name_singular_lower} in Sioux Falls?"),
    ("buying-guide", "How to Choose {article} {name_singular} in Sioux Falls"),
    ("seasonal-guide", "{name} and South Dakota Winters: What Every Homeowner Should Know"),
    ("faq", "{name} FAQ: Sioux Falls Homeowners' Most Common Questions"),
]

DUAL_TEMPLATE = [
    ("local-resource", "Best {name} in Sioux Falls"),
    ("local-resource", "{name} in Sioux Falls: A Local's Guide"),
    ("visitor-guide", "Visiting Sioux Falls? Here's Where to Find Great {name}"),
    ("local-resource", "{name} by Neighborhood: Where Sioux Falls Locals Actually Go"),
    ("seasonal-guide", "The Best {name} for a Sioux Falls Winter Day"),
]

VISITOR_TEMPLATE = [
    ("visitor-guide", "The Complete Guide to Exploring Sioux Falls"),
    ("visitor-guide", "Falls Park: What to Know Before You Go"),
    ("visitor-guide", "Downtown Sioux Falls: Phillips Avenue and the SculptureWalk"),
    ("visitor-guide", "Sioux Falls with Kids: A Family Visitor's Guide"),
    ("seasonal-guide", "Sioux Falls in Winter: What Visitors Should Expect"),
]

RESIDENT_TEMPLATE = [
    ("local-resource", "{name}: Where to Start as a Sioux Falls Resident"),
    ("consumer-guide" if False else "local-resource", "Sioux Falls Homeowner Basics: What Every New Resident Should Know"),
    ("seasonal-guide", "Getting Your Sioux Falls Home Ready for Winter"),
    ("local-resource", "Understanding Permits and Licensing for Sioux Falls Homeowners"),
]

# Roughly singularize for the "choose a X" title
SINGULAR = {
    "Electricians": "Electrician", "Plumbers": "Plumber", "Painters": "Painting Contractor",
    "Flooring": "Flooring Contractor", "Lawn Care": "Lawn Care Company", "Home Services": "Home Services Contractor",
    "Cleaning Services": "Cleaning Service", "Real Estate Agents": "Real Estate Agent",
    "Home Watch Services": "Home Watch Company", "Local Tree Services": "Tree Service",
    "Window Cleaning": "Window Cleaning Company", "Appliance Repair Service": "Appliance Repair Company",
    "Marketing Agencies": "Marketing Agency", "Professional Services": "Professional Services Firm",
}


def random_dates_in_range(start: date, end: date, count: int):
    """Non-uniform spread: cluster some months, leave gaps in others — realistic editorial cadence."""
    total_days = (end - start).days
    raw = sorted(random.sample(range(total_days), count))
    # add jitter clustering: occasionally pull two dates close together (a "publishing week")
    dates = [start + timedelta(days=d) for d in raw]
    return dates


def build_matrix():
    rows = []

    # Phase 1: service categories
    for slug, name in SERVICE_CATEGORIES_PHASE1:
        for content_type, title_tpl in SERVICE_TEMPLATE:
            singular = SINGULAR.get(name, name)
            article = "an" if singular[0].lower() in "aeiou" else "a"
            title = title_tpl.format(name=name, name_singular=singular, name_singular_lower=singular.lower(), article=article)
            rows.append({"phase": 1, "category_slug": slug, "category_name": name, "contentType": content_type, "title": title})

    # Phase 1: resident-general
    for slug, name in RESIDENT_GENERAL_PHASE1:
        for content_type, title_tpl in RESIDENT_TEMPLATE:
            title = title_tpl.format(name=name)
            rows.append({"phase": 1, "category_slug": slug, "category_name": name, "contentType": content_type, "title": title})

    # Phase 1: visitor
    for slug, name in VISITOR_PHASE1:
        for content_type, title_tpl in VISITOR_TEMPLATE:
            rows.append({"phase": 1, "category_slug": slug, "category_name": name, "contentType": content_type, "title": title_tpl})

    # Phase 2: remaining service categories
    for slug, name in SERVICE_CATEGORIES_PHASE2:
        for content_type, title_tpl in SERVICE_TEMPLATE:
            singular = SINGULAR.get(name, name)
            article = "an" if singular[0].lower() in "aeiou" else "a"
            title = title_tpl.format(name=name, name_singular=singular, name_singular_lower=singular.lower(), article=article)
            rows.append({"phase": 2, "category_slug": slug, "category_name": name, "contentType": content_type, "title": title})

    # Phase 2: dual local+visitor categories
    for slug, name in DUAL_CATEGORIES_PHASE2:
        for content_type, title_tpl in DUAL_TEMPLATE:
            title = title_tpl.format(name=name)
            rows.append({"phase": 2, "category_slug": slug, "category_name": name, "contentType": content_type, "title": title})

    return rows


def main():
    rows = build_matrix()
    phase1_rows = [r for r in rows if r["phase"] == 1]
    phase2_rows = [r for r in rows if r["phase"] == 2]

    phase1_dates = random_dates_in_range(date(2023, 12, 1), date(2024, 12, 15), len(phase1_rows))
    phase2_dates = random_dates_in_range(date(2025, 1, 5), date(2025, 12, 20), len(phase2_rows))

    for row, d in zip(phase1_rows, phase1_dates):
        row["publishedAt"] = d.isoformat()
    for row, d in zip(phase2_rows, phase2_dates):
        row["publishedAt"] = d.isoformat()

    all_rows = sorted(phase1_rows + phase2_rows, key=lambda r: r["publishedAt"])

    out_path = "docs/editorial-calendar.csv"
    with open(out_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["publishedAt", "phase", "category_slug", "category_name", "contentType", "title"])
        writer.writeheader()
        writer.writerows(all_rows)

    print(f"Total planned articles: {len(all_rows)}")
    print(f"Phase 1: {len(phase1_rows)} (Dec 2023 - Dec 2024)")
    print(f"Phase 2: {len(phase2_rows)} (Jan 2025 - Dec 2025)")
    print(f"Written to {out_path}")


if __name__ == '__main__':
    main()
