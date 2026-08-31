import { defineCollection, reference, z } from 'astro:content';
import { glob, file } from 'astro/loaders';

/**
 * CATEGORIES
 * The Knowledge Engine's control list. "No category = no content" —
 * every article, business, and FAQ must reference a category defined here.
 * This is also where canonical-category rules live (e.g. "Electrical Contractor"
 * and "Residential Electrician" both resolve to "electricians").
 */
const categories = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/categories' }),
  schema: z.object({
    name: z.string(),
    slug: z.string(),
    parentCategory: reference('categories').optional(),
    aliases: z.array(z.string()).default([]),
    createdAt: z.coerce.date().optional(), // when this category was added — new categories get content priority // canonical merge targets
    playbook: z.object({
      topics: z.array(z.string()), // e.g. hiring, pricing, permits, seasonal concerns
      contentTypes: z.array(
        z.enum([
          'faq',
          'buying-guide',
          'cost-guide',
          'educational-article',
          'seasonal-guide',
          'visitor-guide',
          'local-resource',
          'checklist',
          'definition',
          'comparison',
          'safety-information',
          'maintenance-guide',
        ])
      ),
    }),
    seo: z.object({
      title: z.string(),
      description: z.string(),
    }),
    heroImage: z.string().optional(), // real photo, once available — falls back to a CSS-layered design
    icon: z.string().default('pin'), // semantic icon name, rendered via the Icon component — no emoji
  }),
});

/**
 * NEIGHBORHOODS
 * Real Sioux Falls geography — used to connect businesses, events, and
 * articles by location (per the internal-linking intelligence requirement).
 */
const neighborhoods = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/neighborhoods' }),
  schema: z.object({
    name: z.string(),
    slug: z.string(),
    summary: z.string(),
    heroImage: z.string().optional(),
  }),
});

/**
 * BUSINESSES
 */
const businesses = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/businesses' }),
  schema: z.object({
    name: z.string(),
    category: reference('categories'),
    neighborhood: reference('neighborhoods').optional(),
    address: z.string().optional(), // not always available at import — see migration report
    showAddress: z.boolean().default(false), // per-business privacy toggle — most businesses keep their street address private
    placeId: z.string().optional(), // Google Place ID — required for the automated review sync to work for this business
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    phone: z.string().optional(),
    website: z.string().url().optional(),
    hours: z.string().optional(),
    verifiedAt: z.date().optional(), // set once Sioux Falls Go has confirmed this listing is real and accurate — omitted entirely for newly-added, not-yet-verified businesses
    claimed: z.boolean().default(false),
    heroImage: z.string().optional(),
    sourceUrl: z.string().optional(), // original WP URL, for migration traceability

    // ── Invite-only partnership model ──
    // A business appearing in the directory at all implies it passed
    // qualification — there is no self-serve "add your business" path.
    partnershipTier: z.enum(['community-listing', 'community-champion']).optional(),
    googleRating: z.number().min(1).max(5).optional(), // qualification gate: 4.8+ required
    googleReviewCount: z.number().optional(),
    giveawaysPerYear: z.number().default(0), // up to 2 for Community Listing, more allowed for Champion
    onboardedAt: z.date().optional(), // when approved, distinct from verifiedAt (data freshness)

    // ── Interview-sourced profile ──
    // Profile narrative comes from an actual interview with the business,
    // not a self-submitted form. These fields track that provenance.
    interviewDate: z.date().optional(),
    interviewedBy: z.string().optional(),
    pullQuote: z.string().optional(), // curated quote for premium editorial layout
    ownerName: z.string().optional(), // powers the "Meet the Owner" card — omitted entirely if not provided, never inferred or guessed
    ownerQuote: z.string().optional(), // short personal line for that same card, distinct from pullQuote
    responseTime: z.string().optional(), // lowercase phrase completing "Usually responds ___", e.g. "within 1 hour", "within 24 hours" — set by the business owner to describe their own real response time, never a universal default
    excerpt: z.string().optional(), // 1-2 sentence summary, distinct from the full profile body — for card previews and social sharing
    seo: z.object({
      title: z.string(),
      description: z.string(),
    }).optional(), // real, hand-crafted meta title/description — omitted businesses fall back to a generated default, never silently blank

    // ── Profile enhancements ──
    gallery: z.array(z.string()).default([]), // additional photos beyond heroImage — Champion tier only, gated in the template
    hoursSchedule: z
      .object({
        mon: z.string().optional(),
        tue: z.string().optional(),
        wed: z.string().optional(),
        thu: z.string().optional(),
        fri: z.string().optional(),
        sat: z.string().optional(),
        sun: z.string().optional(),
      })
      .optional(), // structured day-by-day hours, e.g. "9:00 AM - 5:00 PM" or "Closed" — powers the live open/closed indicator
    reviews: z
      .array(
        z.object({
          author: z.string(),
          rating: z.number().min(1).max(5),
          text: z.string(),
          date: z.string().optional(),
        })
      )
      .default([]), // short real review excerpts, not the full Google review feed
  }),
});

/**
 * EVENTS
 */
const events = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/events' }),
  schema: z.object({
    title: z.string(),
    startDate: z.date(),
    endDate: z.date().optional(),
    neighborhood: reference('neighborhoods').optional(),
    relatedBusiness: reference('businesses').optional(),
    category: reference('categories').optional(),
    source: z.enum(['manual', 'data-engine-import']).default('manual'),
    heroImage: z.string().optional(),
  }),
});

/**
 * ARTICLES
 * Knowledge Engine output. Every article belongs to exactly one category
 * and carries the editorial-standards fields (helpful-first, local-expertise
 * signal, evergreen flag) so the site can enforce them, not just aspire to them.
 */
const articles = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/articles' }),
  schema: z.object({
    title: z.string(),
    category: reference('categories'),
    contentType: z.enum([
      'faq',
      'buying-guide',
      'cost-guide',
      'educational-article',
      'seasonal-guide',
      'visitor-guide',
      'local-resource',
      'checklist',
      'definition',
      'comparison',
      'safety-information',
      'maintenance-guide',
      'business-spotlight', // premium-tier feature: written by us about a Community Champion
      'press-release', // premium-tier feature: monthly press release for a Community Champion
    ]),
    relatedNeighborhoods: z.array(reference('neighborhoods')).default([]),
    relatedArticles: z.array(reference('articles')).default([]),
    relatedBusinesses: z.array(reference('businesses')).default([]),
    embeddedFaqs: z.array(z.object({ question: z.string(), answer: z.string() })).default([]),
    sponsoredBy: reference('businesses').optional(), // Community Champion perk — sponsor banner rendered on the article
    evergreen: z.boolean().default(true),
    author: z.string(),
    reviewedBy: z.string().optional(), // human editorial review — required if aiAssisted
    aiAssisted: z.boolean().default(false),
    publishedAt: z.date(),
    updatedAt: z.date(),
    staleCheckDue: z.date().optional(), // Content Engine monitoring hook
    seo: z.object({
      title: z.string(),
      description: z.string(),
    }),
    heroImage: z.string().optional(),
    heroImageCredit: z.object({ photographer: z.string(), profileUrl: z.string() }).optional(), // required attribution when heroImage comes from Unsplash
    sourceUrl: z.string().optional(), // original WP URL, for migration traceability
  }),
});

/**
 * KNOWLEDGE HUBS
 * The reusable engine the spec describes: "Local Service FAQs" is one
 * instance, not a special case. New hubs (Visitor FAQs, Moving to Sioux
 * Falls FAQs, Pet Owner FAQs...) are just new entries here — no new code.
 */
const hubs = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/hubs' }),
  schema: z.object({
    slug: z.string(), // matches the `hub` tag on FAQ entries
    title: z.string(),
    description: z.string(),
    featuredPerCategory: z.number().default(6), // "five to ten" from the spec
  }),
});

/**
 * FAQS
 * Feed dynamic knowledge hubs (e.g. "Local Service FAQs") by category —
 * hubs assemble these rather than being hand-maintained pages.
 */
const faqs = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/faqs' }),
  schema: z.object({
    question: z.string(),
    category: reference('categories'),
    hub: z.array(z.string()).default([]), // which dynamic hubs this feeds, e.g. "local-service-faqs"
    featured: z.boolean().default(false), // eligible for hub display, not just the category's full list
    canonicalOf: reference('faqs').optional(), // if set, this entry is a duplicate — render the canonical one instead
    relatedBusinesses: z.array(reference('businesses')).default([]),
    media: z
      .object({
        icon: z.string().optional(),
        image: z.string().optional(),
        video: z.string().url().optional(),
        downloadUrl: z.string().optional(),
      })
      .optional(),
  }),
});

/**
 * PAGES
 * Standalone content pages (About, Contact, Terms, FAQ...) that do not
 * belong to a category — the WP equivalent of static "page" post type.
 */
const pages = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/pages' }),
  schema: z.object({
    title: z.string(),
    seo: z.object({
      title: z.string(),
      description: z.string(),
    }),
    sourceUrl: z.string().optional(),
  }),
});

/**
 * STAYS
 * Individual host listings for the /stay hub — each one links out to book
 * on the host's real Airbnb page rather than handling booking ourselves.
 * Deliberately no rating/review-count fields: Airbnb doesn't offer a public
 * API for that data, and a number we can't keep current would go stale and
 * mislead rather than help. "See reviews on Airbnb" stays a live link instead.
 */
const stays = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/stays' }),
  schema: z.object({
    name: z.string(),
    stayType: z.enum(['entire-home', 'private-room', 'guest-suite']),
    neighborhood: reference('neighborhoods').optional(),
    locationLabel: z.string(), // e.g. "1 block from Phillips Ave, Downtown Sioux Falls"
    bedrooms: z.number(),
    bathrooms: z.number(),
    guestCapacityLabel: z.string(), // qualitative when an exact number isn't confirmed, e.g. "Ideal for couples or solo travelers"
    amenities: z.array(z.string()).default([]),
    amenityCount: z.number().optional(), // real total from the Airbnb listing, when the full amenities list isn't itemized here
    experienceCategories: z.array(z.enum(['downtown-walkable', 'riverside-nature', 'historic-charming', 'family-friendly', 'solo-budget'])).default([]),
    heroImage: z.string().optional(),
    gallery: z.array(z.string()).default([]),
    airbnbUrl: z.string(), // the real listing — booking happens there, not on this site
    hostName: z.string().optional(),
    hostEmail: z.string().optional(), // used for host login, alongside their access code
    hostAccessCode: z.string().optional(), // private per-host login credential — you generate and share this with each host directly
    hostResponseTime: z.string().optional(), // real data only, e.g. "within a day" — never a default, omit entirely if unknown
    pullQuote: z.string().optional(), // a real sentence pulled from the description, shown as an editorial highlight
    verifiedAt: z.date().optional(), // omitted entirely until independently confirmed
    insiderTips: z.array(z.object({
      tip: z.string(),
      category: z.enum(['eat', 'shop', 'sight', 'general']).default('general'), // 'eat'/'shop'/'sight' are the host's own picks, collected via the intake form; 'general' is practical local knowledge like this one
    })).default([]),
    // SEO pattern for every stay listing: lead with real search intent
    // ("Sioux Falls Vacation Rental"), not the property name — almost
    // nobody searches a specific listing by name yet. Title format:
    // "Sioux Falls Vacation Rental – [Name]", kept to ~45-50 characters —
    // BaseLayout automatically appends " | Sioux Falls Go" (17 more
    // chars), and going past ~65 total risks truncation in search results.
    // Description: use the full ~150-160 char budget, name a real nearby
    // landmark, and lead with what actually differentiates the stay.
    seo: z.object({
      title: z.string(),
      description: z.string(),
    }),
  }),
});

/**
 * COMMUNITY PICKS
 * The curated "multiple Sioux Falls hosts recommended this" list — not
 * auto-generated. When the host intake form exists and enough hosts have
 * submitted eat/shop/sight picks, you review them, decide which places
 * genuinely got recommended by more than one host (different hosts may
 * phrase the same place differently, so this needs a real human look),
 * and add them here. This single file becomes the one shared flyer every
 * logged-in host can download — not a personalized per-listing card.
 */
const communityPicks = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/community-picks' }),
  schema: z.object({
    title: z.string(),
    lastUpdated: z.date(),
    picks: z.array(z.object({
      category: z.enum(['eat', 'shop', 'sight']),
      name: z.string(),
      description: z.string(),
      recommendedBy: z.array(z.string()).default([]), // real host/listing names who recommended this, for transparency
    })),
  }),
});

export const collections = {
  categories,
  neighborhoods,
  businesses,
  events,
  articles,
  faqs,
  hubs,
  pages,
  stays,
  communityPicks,
};
