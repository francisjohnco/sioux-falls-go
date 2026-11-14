// Read and update a business profile file in GitHub, safely: fetch the
// current file and its sha, change only the named fields, and write it back
// with the sha so GitHub refuses a write based on a stale copy.

import { explainGitHubError } from './article-file.mts';

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

// What an owner may change and see go live right away.
export const OWNER_INSTANT_FIELDS = ['phone', 'website', 'hours', 'responseTime', 'couponStyle', 'googleBusinessUrl'] as const;

// Accepts the links Google gives for a Business Profile: Maps, the short
// share links, and search knowledge panel links.
export function isGoogleProfileUrl(u: string): boolean {
  try {
    const url = new URL(u);
    if (url.protocol !== 'https:') return false;
    const h = url.hostname.replace(/^www\./, '');
    return h === 'maps.app.goo.gl' || h === 'g.page' || h === 'goo.gl' || h === 'share.google' || h === 'business.google.com' || h === 'g.co'
      || (/^google\.[a-z.]+$/.test(h) && (url.pathname.startsWith('/maps') || url.pathname.startsWith('/search')))
      || h === 'maps.google.com';
  } catch { return false; }
}
// What an owner may change but you approve first, because it is the
// written voice of the profile.
export const OWNER_REVIEW_FIELDS = ['body', 'pullQuote', 'ownerQuote', 'ownerName', 'excerpt'] as const;

export const COUPON_STYLES = ['ticket-stub', 'torn-corner', 'rubber-stamp', 'clip-coupon', 'price-tag'];

function gh() {
  const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) throw new Error('GITHUB_TOKEN / GITHUB_OWNER / GITHUB_REPO not configured');
  return {
    base: `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents`,
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' },
  };
}

export function splitFile(raw: string): { frontmatter: string; body: string } {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error('Business file does not have valid frontmatter');
  return { frontmatter: m[1], body: m[2] };
}

// Reads a top-level field's raw value (strings unquoted). Good enough for the
// flat fields this module touches.
export function readField(frontmatter: string, field: string): string | undefined {
  const line = frontmatter.split('\n').find((l) => l.startsWith(`${field}:`));
  if (!line) return undefined;
  const v = line.slice(field.length + 1).trim();
  if (v.startsWith('"') && v.endsWith('"')) {
    try { return JSON.parse(v); } catch { return v.slice(1, -1); }
  }
  return v;
}

export function readList(frontmatter: string, field: string): string[] {
  const v = frontmatter.split('\n').find((l) => l.startsWith(`${field}:`));
  if (!v) return [];
  try { const arr = JSON.parse(v.slice(field.length + 1).trim()); return Array.isArray(arr) ? arr.map(String) : []; } catch { return []; }
}

export function readHours(frontmatter: string): Record<string, string> {
  const lines = frontmatter.split('\n');
  const start = lines.findIndex((l) => /^hoursSchedule:/.test(l));
  const out: Record<string, string> = {};
  if (start === -1) return out;
  for (let i = start + 1; i < lines.length && /^\s/.test(lines[i]); i++) {
    const m = lines[i].match(/^\s+(\w+):\s*"?(.*?)"?\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

// Replaces a top-level field (and any indented lines under it). A null or
// empty value removes the field.
export function setField(frontmatter: string, field: string, value: string | number | boolean | string[] | null): string {
  const lines = frontmatter.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`${field}:`));
  let end = start + 1;
  if (start !== -1) while (end < lines.length && /^\s/.test(lines[end])) end++;
  const remove = value === null || value === '' || (Array.isArray(value) && value.length === 0);
  const newLines = remove ? [] : [`${field}: ${typeof value === 'string' || Array.isArray(value) ? JSON.stringify(value) : String(value)}`];
  if (start !== -1) lines.splice(start, end - start, ...newLines);
  else if (!remove) {
    const cat = lines.findIndex((l) => l.startsWith('category:'));
    lines.splice(cat !== -1 ? cat + 1 : 1, 0, ...newLines);
  }
  return lines.join('\n');
}

export function setHours(frontmatter: string, hours: Record<string, string>): string {
  const lines = frontmatter.split('\n');
  const start = lines.findIndex((l) => /^hoursSchedule:/.test(l));
  let end = start + 1;
  if (start !== -1) while (end < lines.length && /^\s/.test(lines[end])) end++;
  const clean = DAY_KEYS.filter((k) => typeof hours[k] === 'string' && hours[k].trim());
  const block = clean.length ? ['hoursSchedule:', ...clean.map((k) => `  ${k}: ${JSON.stringify(hours[k].trim().slice(0, 60))}`)] : [];
  if (start !== -1) lines.splice(start, end - start, ...block);
  else lines.push(...block);
  return lines.join('\n');
}

export async function readBusinessFile(slug: string): Promise<{ raw: string; sha: string; frontmatter: string; body: string }> {
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error('Invalid business');
  const { base, headers } = gh();
  const res = await fetch(`${base}/src/content/businesses/${slug}.md`, { headers });
  if (!res.ok) throw new Error(res.status === 404 ? 'Business not found' : explainGitHubError(res.status));
  const data = await res.json();
  const raw = Buffer.from(data.content, 'base64').toString('utf-8');
  return { raw, sha: data.sha, ...splitFile(raw) };
}

export async function writeBusinessFile(slug: string, frontmatter: string, body: string, sha: string, message: string): Promise<void> {
  const { base, headers } = gh();
  const raw = `---\n${frontmatter}\n---\n${body}`;
  splitFile(raw); // sanity check before writing
  const res = await fetch(`${base}/src/content/businesses/${slug}.md`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content: Buffer.from(raw).toString('base64'), sha }),
  });
  if (!res.ok) {
    if (res.status === 409) throw new Error('This profile was changed by someone else a moment ago. Refresh and try again.');
    throw new Error(explainGitHubError(res.status));
  }
}

// Writes any file (images, deal JSON). sha is required to replace an existing file.
export async function putFile(path: string, base64Content: string, message: string, sha?: string): Promise<void> {
  const { base, headers } = gh();
  const res = await fetch(`${base}/${path}`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content: base64Content, ...(sha ? { sha } : {}) }),
  });
  if (!res.ok) throw new Error(explainGitHubError(res.status));
}

export async function getFile(path: string): Promise<{ sha: string; text: string } | null> {
  const { base, headers } = gh();
  const res = await fetch(`${base}/${path}`, { headers });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(explainGitHubError(res.status));
  const d = await res.json();
  return { sha: d.sha, text: Buffer.from(d.content, 'base64').toString('utf-8') };
}

export async function deleteFile(path: string, sha: string, message: string): Promise<void> {
  const { base, headers } = gh();
  const res = await fetch(`${base}/${path}`, { method: 'DELETE', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ message, sha }) });
  if (!res.ok) throw new Error(explainGitHubError(res.status));
}

export async function listDir(path: string): Promise<{ name: string; path: string }[]> {
  const { base, headers } = gh();
  const res = await fetch(`${base}/${path}`, { headers });
  if (!res.ok) return [];
  return res.json();
}

// Applies owner or admin changes to the parsed file. Unknown fields are ignored.
export function applyChanges(frontmatter: string, body: string, changes: Record<string, any>): { frontmatter: string; body: string } {
  let fm = frontmatter;
  let b = body;
  for (const [k, v] of Object.entries(changes)) {
    if (k === 'body') { if (typeof v === 'string') b = v.endsWith('\n') ? v : v + '\n'; continue; }
    if (k === 'hoursSchedule') { if (v && typeof v === 'object') fm = setHours(fm, v); continue; }
    if (k === 'gallery') { if (Array.isArray(v)) fm = setField(fm, 'gallery', v.map(String).slice(0, 12)); continue; }
    if (k === 'heroImage') { if (typeof v === 'string') fm = setField(fm, 'heroImage', v); continue; }
    if ((OWNER_INSTANT_FIELDS as readonly string[]).includes(k) || (OWNER_REVIEW_FIELDS as readonly string[]).includes(k)) {
      if (k === 'couponStyle' && v && !COUPON_STYLES.includes(v)) continue;
      fm = setField(fm, k, typeof v === 'string' ? v.trim().slice(0, k === 'excerpt' || k.endsWith('Quote') ? 400 : k === 'googleBusinessUrl' ? 600 : 200) : null);
    }
  }
  return { frontmatter: fm, body: b };
}
