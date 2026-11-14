// Links a business's name, the first time it appears in their story, to
// their Google Business Profile. Uses the link saved on the listing, or
// builds one from their Google Place ID when no link is saved.

export function googleProfileUrl(d: { googleBusinessUrl?: string; placeId?: string }): string | null {
  if (d.googleBusinessUrl) return d.googleBusinessUrl;
  if (d.placeId) return `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(d.placeId)}`;
  return null;
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Name variants as they may appear in rendered HTML (ampersands, curly apostrophes).
function variants(name: string): string[] {
  const out = new Set<string>();
  for (const n of [name, name.replace(/'/g, '’'), name.replace(/’/g, "'")]) { out.add(n); out.add(n.replace(/&/g, '&amp;')); out.add(n.replace(/'/g, '&#39;')); }
  return [...out].sort((a, b) => b.length - a.length);
}

export function linkFirstMention(html: string, name: string, url: string): { html: string; linked: boolean } {
  const re = new RegExp(`(${variants(name).map(escapeRe).join('|')})`, 'i');
  const parts = html.split(/(<[^>]+>)/); // tags at odd indexes
  let skip = 0; // inside <a> or a heading
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (i % 2 === 1) {
      if (/^<(a|h[1-6])[\s>]/i.test(p)) skip++;
      else if (/^<\/(a|h[1-6])>/i.test(p)) skip = Math.max(0, skip - 1);
      continue;
    }
    if (skip || !re.test(p)) continue;
    parts[i] = p.replace(re, (m) => `<a href="${escapeHtml(url)}" class="gbp-link" target="_blank" rel="noopener" title="${escapeHtml(name)} on Google">${m}</a>`);
    return { html: parts.join(''), linked: true };
  }
  return { html, linked: false };
}
