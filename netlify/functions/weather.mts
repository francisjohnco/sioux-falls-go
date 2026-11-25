// Current Sioux Falls weather from the National Weather Service station at
// the Sioux Falls airport (KFSD). Free, no key, and cached at the edge for
// 15 minutes so every visitor shares one lookup.

const STATION = 'https://api.weather.gov/stations/KFSD/observations/latest';
const json = (o: unknown, status = 200, cache = true) => new Response(JSON.stringify(o), {
  status,
  headers: {
    'Content-Type': 'application/json',
    ...(cache ? { 'Cache-Control': 'public, max-age=300', 'Netlify-CDN-Cache-Control': 'public, s-maxage=900, stale-while-revalidate=600' } : {}),
  },
});

export default async () => {
  try {
    const res = await fetch(STATION, { headers: { 'User-Agent': 'siouxfallsgo.com (hello@siouxfallsgo.com)', Accept: 'application/geo+json' } });
    if (!res.ok) return json({ error: 'Weather unavailable' }, 502, false);
    const p = (await res.json())?.properties || {};
    const c = p.temperature?.value;
    if (typeof c !== 'number') return json({ error: 'No temperature reported' }, 502, false);
    return json({
      tempF: Math.round(c * 9 / 5 + 32),
      sky: String(p.textDescription || '').trim(),
      observedAt: p.timestamp || null,
    });
  } catch {
    return json({ error: 'Weather unavailable' }, 502, false);
  }
};

export const config = { path: '/api/weather' };
