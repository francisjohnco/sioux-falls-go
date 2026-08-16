import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import crypto from 'node:crypto';

function sign(value: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

// Real SFG brand colors, matching the actual site
const NAVY = rgb(0x1b / 255, 0x2a / 255, 0x4a / 255);
const ORANGE = rgb(0xf0 / 255, 0x7e / 255, 0x23 / 255);
const CHARCOAL = rgb(0x2b / 255, 0x26 / 255, 0x20 / 255);
const LIGHT_GRAY = rgb(0.55, 0.55, 0.55);

const CATEGORY_LABELS: Record<string, string> = { eat: 'Where to Eat', shop: 'Where to Shop', sight: 'What to See' };

export default async (req: Request) => {
  const cookieHeader = req.headers.get('cookie') || '';
  const match = cookieHeader.match(/sfg_host_session=([^;]+)/);
  const SESSION_SECRET = process.env.SESSION_SECRET;

  if (!match || !SESSION_SECRET) {
    return new Response('Not authenticated', { status: 401 });
  }
  const token = decodeURIComponent(match[1]);
  const parts = token.split(':');
  if (parts.length !== 3) return new Response('Not authenticated', { status: 401 });
  const [slug, expires, signature] = parts;
  if (signature !== sign(`${slug}:${expires}`, SESSION_SECRET) || Date.now() > Number(expires)) {
    return new Response('Session expired', { status: 401 });
  }

  const siteUrl = process.env.URL || process.env.DEPLOY_URL;
  const picksRes = await fetch(`${siteUrl}/community-picks.json`);
  const { picks } = picksRes.ok ? await picksRes.json() : { picks: [] };

  if (!picks || picks.length === 0) {
    return new Response(JSON.stringify({ error: 'No community picks published yet — check back once more hosts have contributed.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([360, 504]); // 5x7" at 72dpi
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const { width, height } = page.getSize();
  let y = height - 50;

  const eyebrow = 'RECOMMENDED BY LOCALS';
  page.drawText(eyebrow, {
    x: (width - fontBold.widthOfTextAtSize(eyebrow, 9)) / 2,
    y, size: 9, font: fontBold, color: ORANGE,
  });
  y -= 26;

  const title = 'Sioux Falls, From People Who Live Here';
  const titleLines = wrapText(title, fontBold, 17, width - 60);
  for (const line of titleLines) {
    page.drawText(line, { x: (width - fontBold.widthOfTextAtSize(line, 17)) / 2, y, size: 17, font: fontBold, color: NAVY });
    y -= 22;
  }
  y -= 8;

  page.drawLine({ start: { x: 40, y }, end: { x: width - 40, y }, thickness: 0.75, color: rgb(0.89, 0.86, 0.81) });
  y -= 26;

  for (const pick of picks.slice(0, 5)) {
    const category = (CATEGORY_LABELS[pick.category] || pick.category).toUpperCase();
    page.drawText(category, { x: 40, y, size: 8, font: fontBold, color: ORANGE });
    y -= 15;
    page.drawText(pick.name, { x: 40, y, size: 13, font: fontBold, color: NAVY });
    y -= 17;

    const descLines = wrapText(pick.description, fontRegular, 9.5, width - 80);
    for (const line of descLines) {
      page.drawText(line, { x: 40, y, size: 9.5, font: fontRegular, color: CHARCOAL });
      y -= 13;
    }

    if (pick.recommendedBy?.length > 0) {
      const attribution = `Recommended by ${pick.recommendedBy.length} Sioux Falls Go host${pick.recommendedBy.length > 1 ? 's' : ''}`;
      page.drawText(attribution, { x: 40, y: y - 2, size: 8.5, font: fontItalic, color: LIGHT_GRAY });
      y -= 14;
    }
    y -= 14;
  }

  // Footer band
  page.drawRectangle({ x: 0, y: 0, width, height: 46, color: NAVY });
  page.drawText('sioux falls go', { x: 40, y: 18, size: 12, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText('siouxfallsgo.com/stay', { x: 40, y: 6, size: 7.5, font: fontRegular, color: rgb(0.85, 0.85, 0.85) });

  const pdfBytes = await pdfDoc.save();

  return new Response(pdfBytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="sioux-falls-host-picks.pdf"',
    },
  });
};

function wrapText(text: string, font: any, size: number, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export const config = { path: '/api/download-host-picks' };
