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

export function weaveStory(html: string, x: StoryExtras): { html: string; usedOwnerQuote: boolean; usedPhotos: number } {
  // The page already has the business name as its H1, so any H1 in the story becomes an H2.
  let body = html.replace(/<h1(\s|>)/g, '<h2$1').replace(/<\/h1>/g, '</h2>');
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
