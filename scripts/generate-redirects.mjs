// Generates public/_redirects from data/redirects.csv
// Run: node scripts/generate-redirects.mjs
//
// Netlify reads public/_redirects at deploy time and applies these as real
// 301s at the edge — this is how "every WP URL that's changing gets a
// redirect, no broken links" actually gets enforced, not just documented.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const csvPath = join(__dirname, '../data/redirects.csv');
const outPath = join(__dirname, '../public/_redirects');

const csv = readFileSync(csvPath, 'utf-8').trim().split('\n');
const [header, ...rows] = csv;
const cols = header.split(',');

const oldUrlIdx = cols.indexOf('old_url');
const newUrlIdx = cols.indexOf('new_url');
const statusIdx = cols.indexOf('status');

if (oldUrlIdx === -1 || newUrlIdx === -1 || statusIdx === -1) {
  throw new Error('redirects.csv must have old_url, new_url, status columns');
}

const lines = rows
  .filter(Boolean)
  .map((row) => {
    // naive CSV split — fine for this file since notes never contain commas
    // that aren't the last column; swap for a real CSV parser if that changes
    const parts = row.split(',');
    const from = parts[oldUrlIdx].trim();
    const to = parts[newUrlIdx].trim();
    const status = parts[statusIdx].trim();
    return `${from}  ${to}  ${status}`;
  });

const output = [
  '# Generated from data/redirects.csv — do not hand-edit, edit the CSV instead',
  `# Regenerated: ${new Date().toISOString()}`,
  '',
  ...lines,
  '',
].join('\n');

writeFileSync(outPath, output);
console.log(`Wrote ${lines.length} redirects to public/_redirects`);
