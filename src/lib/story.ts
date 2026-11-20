// Turns a profile story into a designed read: the highlighted quote, the
// owner's own words, and the business's photos are woven between sections
// instead of the story being one block of text. Works whether the story has
// subheadings or is plain paragraphs.

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface StoryExtras {
  businessName: string;
  pullQuote?: string;
  ownerQuote?: string;
  ownerName?: string;
  ownerRole?: string;
  photos: string[]; // gallery photos not used as the main photo
}

function quoteBlock(text: string, cite?: string, variant = 'pull') {
  const t = esc(text.replace(/^["“]|["”]$/g, ''));
  return `<figure class="story-quote story-quote--${variant}"><blockquote>“${t}”</blockquote>${cite ? `<figcaption>${esc(cite)}</figcaption>` : ''}</figure>`;
}

function photoBlock(src: string, alt: string) {
  return `<figure class="story-photo"><img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async" /></figure>`;
}

// Splits long paragraphs into short ones (about two sentences, never more
// than about 55 words) so the story reads easily on a phone. Never cuts
// inside a link or other tag.
export function shortenParagraphs(html: string, maxWords = 55, maxSentences = 2): string {
  return html.replace(/<p>([\s\S]*?)<\/p>/g, (whole, inner: string) => {
    if (/<(p|div|ul|ol|figure|blockquote|img)\b/i.test(inner)) return whole;
    const words = inner.replace(/<[^>]+>/g, '').split(/\s+/).length;
    if (words <= maxWords) return whole;
    // sentence ends: . ! ? (optionally followed by a closing quote or bracket), a space, then a capital or opening quote
    const cuts: number[] = [];
    const re = /[.!?]["”’)]?\s+(?=["“A-Z0-9])/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(inner))) {
      const at = m.index + m[0].length;
      const before = inner.slice(0, at);
      const openTags = (before.match(/<a\b/gi) || []).length - (before.match(/<\/a>/gi) || []).length;
      const insideTag = before.lastIndexOf('<') > before.lastIndexOf('>');
      if (openTags === 0 && !insideTag) cuts.push(at);
    }
    if (!cuts.length) return whole;
    const sentences: string[] = [];
    let last = 0;
    for (const c of cuts) { sentences.push(inner.slice(last, c).trim()); last = c; }
    sentences.push(inner.slice(last).trim());
    const out: string[] = [];
    let cur: string[] = [];
    const wc = (t: string) => t.replace(/<[^>]+>/g, '').split(/\s+/).filter(Boolean).length;
    for (const sentence of sentences.filter(Boolean)) {
      if (cur.length && (cur.length >= maxSentences || wc(cur.join(' ')) + wc(sentence) > maxWords)) { out.push(cur.join(' ')); cur = []; }
      cur.push(sentence);
    }
    if (cur.length) out.push(cur.join(' '));
    // a lone short last line reads better joined to the one before it
    if (out.length > 1 && wc(out[out.length - 1]) < 8) out.splice(-2, 2, `${out[out.length - 2]} ${out[out.length - 1]}`);
    return out.map((t) => `<p>${t}</p>`).join('\n');
  });
}

export function weaveStory(html: string, x: StoryExtras): { html: string; usedOwnerQuote: boolean; usedPhotos: number } {
  // The page already has the business name as its H1, so any H1 in the story becomes an H2.
  let body = shortenParagraphs(html.replace(/<h1(\s|>)/g, '<h2$1').replace(/<\/h1>/g, '</h2>'));
  // Drop a leading heading that only repeats the page title (common in imported stories).
  body = body.replace(/^\s*<h2[^>]*>[^<]*<\/h2>\s*/, (m) => (m.toLowerCase().includes(x.businessName.toLowerCase().slice(0, 12)) ? '' : m));

  const inserts: string[] = [];
  if (x.pullQuote) inserts.push(quoteBlock(x.pullQuote, undefined, 'pull'));
  if (x.photos[0]) inserts.push(photoBlock(x.photos[0], `${x.businessName} in Sioux Falls`));
  const ownerCite = x.ownerName ? `${x.ownerName}${x.ownerRole ? `, ${x.ownerRole}` : ''}` : undefined;
  if (x.ownerQuote) inserts.push(quoteBlock(x.ownerQuote, ownerCite, 'owner'));
  if (x.photos[1]) inserts.push(photoBlock(x.photos[1], `${x.businessName}, Sioux Falls`));
  if (!inserts.length) return { html: body, usedOwnerQuote: false, usedPhotos: 0 };

  // Break points: before each H2 after the first section, or else after every
  // second paragraph.
  const h2s = [...body.matchAll(/<h2[\s>]/g)].map((m) => m.index!).filter((i) => i > 0);
  let points: number[];
  if (h2s.length >= 2) points = h2s;
  else {
    const ends = [...body.matchAll(/<\/p>/g)].map((m) => m.index! + 4);
    points = ends.filter((_, i) => i % 2 === 1 && i < ends.length - 1);
  }
  if (!points.length) return { html: body + inserts.join(''), usedOwnerQuote: !!x.ownerQuote, usedPhotos: Math.min(2, x.photos.length) };

  // Spread the inserts across the available break points.
  const chosen = new Map<number, string>();
  inserts.forEach((block, i) => {
    const at = points[Math.min(points.length - 1, Math.floor(((i + 1) * points.length) / (inserts.length + 1)))];
    chosen.set(at, (chosen.get(at) || '') + block);
  });
  let out = '';
  let last = 0;
  for (const at of [...chosen.keys()].sort((a, b) => a - b)) {
    out += body.slice(last, at) + chosen.get(at);
    last = at;
  }
  out += body.slice(last);
  return { html: out, usedOwnerQuote: !!x.ownerQuote, usedPhotos: Math.min(2, x.photos.length) };
}
