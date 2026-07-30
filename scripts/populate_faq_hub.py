"""
The FAQ hub (/faqs/local-service-faqs) was only backed by 2 placeholder
entries for a single category, even though 12 real category FAQ articles
now exist with genuine Q&A content. This extracts those Q&A pairs and
generates real faqs/*.md entries, so the hub actually has content across
every service category instead of one placeholder pair.

Run: python3 scripts/populate_faq_hub.py
"""
import re
from pathlib import Path

ROOT = Path(__file__).parent.parent
ARTICLES_DIR = ROOT / 'src/content/articles'
FAQS_DIR = ROOT / 'src/content/faqs'

MAX_PER_CATEGORY = 3  # matches hub.featuredPerCategory


def slugify(text):
    return re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-')[:60]


def parse_faq_article(path):
    text = path.read_text()
    fm_match = re.match(r'^---\n(.*?)\n---\n(.*)$', text, re.DOTALL)
    if not fm_match:
        return None, []
    frontmatter, body = fm_match.groups()

    category_match = re.search(r'^category:\s*"([^"]+)"', frontmatter, re.MULTILINE)
    related_biz_match = re.search(r'^relatedBusinesses:\s*(\[[^\]]*\])', frontmatter, re.MULTILINE)
    category = category_match.group(1) if category_match else None
    related_businesses = related_biz_match.group(1) if related_biz_match else '[]'

    qa_pairs = re.findall(r'^## (.+?)\n\n(.+?)(?=\n## |\Z)', body, re.DOTALL | re.MULTILINE)
    return category, related_businesses, qa_pairs


def main():
    # Remove the old sparse placeholders — real content replaces them
    for f in FAQS_DIR.glob('*-placeholder.md'):
        f.unlink()
        print(f'Removed placeholder: {f.name}')

    faq_articles = [f for f in ARTICLES_DIR.glob('*.md') if 'contentType: "faq"' in f.read_text()]
    total_created = 0

    for article_path in faq_articles:
        category, related_businesses, qa_pairs = parse_faq_article(article_path)
        if not category or not qa_pairs:
            continue

        for question, answer in qa_pairs[:MAX_PER_CATEGORY]:
            question = question.strip()
            answer = answer.strip().replace('"', '\\"')
            slug = slugify(question)
            out_path = FAQS_DIR / f'{category}-{slug}.md'

            frontmatter = f'''---
question: "{question.replace('"', chr(92) + chr(34))}"
category: "{category}"
hub: ["local-service-faqs"]
featured: true
relatedBusinesses: {related_businesses}
---

{answer.strip()}
'''
            out_path.write_text(frontmatter)
            total_created += 1

    print(f'\nTotal real FAQ hub entries created: {total_created}')


if __name__ == '__main__':
    main()
