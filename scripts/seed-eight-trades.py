"""One-time seed: 8 new home service categories and a 15-article series for each.
Run from the repo root. Safe to re-run: it skips categories and queues that exist."""
import json, os, datetime as dt

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TODAY = '2026-11-25'

VOICE = ("AUDIENCE AND VOICE: Every article is for a Sioux Falls HOMEOWNER, never for contractors. Start from the real situations and worries "
 "in the voice-of-the-customer notes and answer them directly. Be specific and practical: what to do, what to ask, what to watch for, what it "
 "usually means. Use the verified facts with their sources named. Never name or recommend any company. Do not invent statistics, prices, code "
 "requirements, measurements, timelines in days, or warranty terms; do not state dollar figures except fees or penalties given in the verified facts. "
 "When something depends on the home or the contractor, say so and tell the reader what to ask. Write for phones: paragraphs of 1 to 3 sentences, "
 "never more than about 50 words, with bulleted lists where a reader would scan.")

LICENSE = ("City of Sioux Falls: a Residential Building Contractor's License is required of all contractors working on residential one and two family "
 "homes and townhomes within city limits, and the City does not accept licenses from other states. A Residential Roofing and Repair Contractor license "
 "(created in 2024) covers re-shingling, re-siding and window or door replacement with no structural changes. The City publishes a Currently Licensed "
 "Contractors list at siouxfalls.gov/licensed-contractors.")
PERMIT_LIST = ("City of Sioux Falls Building Permit FAQs: projects that need a building permit include additions and remodels, decks, window and exterior door "
 "replacement, and re-shingling and re-siding. Painting and similar finish work and kitchen cabinets do not. Building permits do not cover electrical, "
 "plumbing or mechanical work unless licensed electrical, plumbing and mechanical contractors do that work; homeowners who own and live in a single-family "
 "home and do it themselves need separate homeowner permits.")
NO_25C = "IRS: the federal Energy Efficient Home Improvement Credit (Section 25C), which covered insulation, windows and doors, does not apply to property placed in service after December 31, 2025. Never tell readers this credit is available."
HARD = "City of Sioux Falls 2020 finished water quality report: total hardness was about 15 grains per gallon for water treated at the City's own plant and about 10 grains per gallon for Lewis and Clark water."

def link(url, what):
    return (f" Somewhere past the first section where a reader would want more depth, include exactly one natural link with descriptive anchor text to "
            f"{url} ({what}; do not call it a company or name any business).")
def sfg(path, title, where):
    return f" {where}, include exactly one natural link with descriptive anchor text to this related Sioux Falls Go guide: [{title}](/guides/{path})."

def T(slug, title, ctype, kw, brief):
    return {'slug': slug, 'title': title, 'contentType': ctype, 'keywords': kw, 'brief': brief}

TRADES = [
 dict(slug='siding', name='Siding', parent='home-services', icon='home',
  show='house siding as the clear subject (a home exterior with visible siding, or siding being installed)', query='house exterior vinyl siding',
  seo=('Siding Contractors in Sioux Falls, SD', 'Planning new siding in Sioux Falls? Local guides on hail damage, materials for South Dakota weather, permits, quotes and what to ask a siding contractor.'),
  intro="Siding in Sioux Falls takes a beating most of the country never sees. Hail, hard prairie wind, subzero cold and summer sun all work on it in the same year.\n\nA good siding job starts with knowing whether you have damage, wear or both, then picking a material and an installer that fit how our weather actually behaves.",
  tips=["Ask whether the contractor is licensed with the City of Sioux Falls, since re-siding needs a permit and a licensed contractor to pull it.",
        "After hail, have the siding inspected and photographed before you call your insurer, and keep every photo and report.",
        "Ask what goes under the new siding, such as house wrap and flashing around windows, because that layer keeps water out of the walls.",
        "Get the material, color, trim and disposal written into the quote so bids compare fairly.",
        "Ask how they match a partial repair to the siding that stays, because discontinued colors are a common headache."],
  faqs=[("Do I need a permit to replace siding in Sioux Falls?","Yes. The City of Sioux Falls lists re-siding among the projects that need a building permit, and the work must be done by a contractor licensed with the City. Homes outside city limits go through Minnehaha or Lincoln County."),
        ("How do I know if hail damaged my siding?","Look for cracks, holes, chips and dents, especially on the side that faced the storm, plus damage to window wraps and gutters. Photograph everything with something for scale and have a contractor inspect before you file a claim."),
        ("Can I replace just part of my siding?","Often, yes, if the damaged area is limited and matching material is available. Ask the contractor to show you the closest match before work starts, because faded or discontinued colors may not blend."),
        ("What siding holds up best in South Dakota weather?","It depends on budget, look and how much upkeep you want. Vinyl, fiber cement, engineered wood and metal all handle cold differently, so ask each contractor how their product handles hail, expansion and sun."),
        ("How long does a siding replacement take?","It depends on the size of the house, the material and the weather. Ask for a written schedule and how they protect windows, landscaping and the inside of the walls while the old siding is off."),
        ("Should siding and roof be done together after hail?","Often it makes sense to inspect both after the same storm and file one claim if both are damaged. Ask your insurer how they handle a claim that covers more than one part of the house.")],
  voc="VOICE OF THE CUSTOMER, paraphrased from Sioux Falls homeowners' public reviews of local siding and exterior contractors (never quote or name them): bad hail damage that meant new siding, roof, basement window wells and gutters all at once; praise for crews who walked them through the insurance claim; wanting quick, economical vinyl replacement; worry about matching new siding to what stays; being kept informed start to finish; frustration with storm chasers knocking on doors after hail.",
  facts=[LICENSE, PERMIT_LIST],
  pillar=T('siding-guide-sioux-falls','New Siding in Sioux Falls, the Homeowner\'s Guide','buying-guide',['siding Sioux Falls','siding replacement Sioux Falls'],"Roadmap: hail damage, repair or replace, materials for our climate, what goes under siding, permits and licensed contractors, quotes, insurance, color matching, timing and care. Each section points to the supporting article."),
  past=[T('hail-damaged-siding','Hail Damaged Siding, What to Check First','checklist',['hail damage siding','siding hail damage Sioux Falls'],"Walk the house after a storm, what damage looks like on each material, photos, temporary fixes, when to call the insurer, and storm chaser warning signs."+sfg('hail-damage-roof-sioux-falls-first-steps','Hail Damage on Your Sioux Falls Roof, First Steps','In the section about checking the rest of the house')),
        T('siding-repair-or-replace','Siding Repair or Replacement? How to Decide','buying-guide',['siding repair','replace siding'],"Cracks, warping, loose panels, rot underneath, moisture in walls, matching, and when replacement is the better money. No prices."),
        T('vinyl-vs-fiber-cement-siding','Vinyl, Fiber Cement or Engineered Wood Siding?','comparison',['vinyl vs fiber cement siding','best siding for cold climate'],"How each handles hail, wind, deep cold, sun and moisture; upkeep, look, resale. No brand names, no prices."),
        T('siding-insurance-claim','Siding and Your Insurance Claim After a Storm','educational-article',['siding insurance claim','hail claim siding'],"Documenting damage, adjuster visit, having your contractor present, matching disputes, depreciation questions, and what to ask your insurer. No invented policy terms."+sfg('roof-insurance-claim-south-dakota','How a Roof Insurance Claim Works in South Dakota','In the section about how claims move forward')),
        T('siding-permits-licensed-contractors','Siding Permits and Licensed Contractors in Sioux Falls','educational-article',['siding permit Sioux Falls','licensed siding contractor'],"Use the City facts: re-siding needs a permit, which license covers it, checking the licensed list, and homes outside city limits. Tell readers to confirm with City Building Services.")],
  future=[T('what-goes-under-siding','What Goes Under Your Siding and Why It Matters','educational-article',['house wrap','siding underlayment'],"House wrap, flashing at windows and doors, insulation board, and the problems a skipped layer causes."),
          T('comparing-siding-quotes','How to Compare Siding Quotes','buying-guide',['siding quote','siding estimate Sioux Falls'],"Square footage, trim and soffit, removal and disposal, wrap and flashing, warranty, and why bids differ. No prices."),
          T('matching-siding-colors','Matching New Siding to Old After a Repair','buying-guide',['match siding color','siding repair match'],"Fading, discontinued colors, sample boards, which walls to redo, and how insurers view matching. No invented policy terms."),
          T('siding-in-winter','Can Siding Be Installed in Winter?','seasonal-guide',['winter siding installation','install siding cold weather'],"How cold affects vinyl and other materials, installer practices, scheduling, and questions to ask."),
          T('siding-cleaning-maintenance','Siding Care Through a Sioux Falls Year','maintenance-guide',['siding maintenance','clean vinyl siding'],"Seasonal checks, gentle washing, mildew, caulk, and what to watch for after storms."),
          T('soffit-and-fascia','Soffit and Fascia, the Trim That Protects Your Roofline','educational-article',['soffit and fascia','fascia repair'],"What they do, ventilation, rot, critters, and when to replace them with siding."),
          T('siding-and-energy','Does New Siding Make Your Home Warmer?','educational-article',['insulated siding','siding energy efficiency'],"What siding does and does not do for comfort, insulated siding, air sealing, and where insulation matters more. Never claim a tax credit."),
          T('storm-chasers-siding','Spotting Storm Chasers After a Hail Storm','checklist',['storm chaser contractors','hail scam'],"Door knockers, pressure tactics, signing over claims, checking the City licensed list, and taking your time."),
          T('siding-colors-resale','Choosing a Siding Color That Ages Well','buying-guide',['siding colors','exterior color choice'],"Fading, heat, neighborhood fit, trim contrast, and covenants. No brand names.")]),

 dict(slug='gutters', name='Gutters', parent='home-services', icon='home',
  show='house gutters or downspouts as the clear subject', query='house gutter downspout',
  seo=('Gutter Installation and Repair in Sioux Falls, SD','Gutter help for Sioux Falls homes: overflowing gutters, ice dams, downspouts, guards, seamless gutters and what to ask an installer.'),
  intro="Gutters are easy to ignore until water shows up in the basement or ice hangs off the roof. In Sioux Falls, summer downpours, spring thaw and winter ice all test them.\n\nMost gutter problems come down to size, slope, clogs and where the downspouts send the water. Fix those and a lot of foundation and siding trouble never starts.",
  tips=["Ask where every downspout will discharge, because water dumped next to the foundation is how basements get wet.",
        "Ask whether the gutters and downspouts are sized for the roof area they drain, especially on steep or large roofs.",
        "Ask how hangers are spaced and fastened, since snow and ice load gutters heavily here.",
        "If you are considering guards, ask how they handle ice and what cleaning they still need.",
        "Get the material, gauge or thickness, color and warranty written into the quote."],
  faqs=[("Do I need a permit for gutters in Sioux Falls?","No. The City of Sioux Falls lists gutters and fascia among aesthetic projects that do not require a permit. Other work done at the same time, like re-siding or roofing, can."),
        ("Why do my gutters overflow in heavy rain?","Usually a clog, too little slope, downspouts that are too few or too small, or gutters undersized for the roof area. A contractor can check each one before you replace anything."),
        ("Do gutters cause ice dams?","Ice dams start with heat escaping into the attic and melting snow on the roof. Gutters full of ice make them worse, but the fix is usually insulation and ventilation, not just new gutters."),
        ("Are gutter guards worth it?","They can cut down on cleaning, but none are maintenance free and some struggle with ice and fine debris. Ask how a guard handles your trees and winter before buying."),
        ("Where should downspouts drain?","Well away from the foundation, onto ground that slopes away from the house. Extensions or underground lines help. Make sure the discharge does not freeze across a sidewalk or driveway in winter."),
        ("How often should gutters be cleaned?","At least spring and fall, and more under heavy trees. Check after big storms and before winter so meltwater has somewhere to go.")],
  voc="VOICE OF THE CUSTOMER, paraphrased from Sioux Falls homeowners' public reviews of local gutter and exterior companies (never quote or name them): new gutters and screens after hail with no problems years later; gutters replaced along with roof and siding after a bad storm; overflowing gutters in summer downpours; ice in gutters and icicles every winter; water pooling by the foundation; wanting crews who are quick, tidy and explain the options.",
  facts=["City of Sioux Falls (April 2025 home improvement reminders): aesthetic projects like painting, flooring, cabinets and countertops, and gutters and fascia do not require a permit.", "City of Sioux Falls: when shoveling, place snow in your yard, not on sidewalks, streets or the right of way; depositing snow in the street violates City ordinance.", LICENSE],
  pillar=T('gutter-guide-sioux-falls','Gutters for a Sioux Falls Home, the Homeowner\'s Guide','buying-guide',['gutters Sioux Falls','gutter installation Sioux Falls'],"Roadmap: what gutters protect, overflow problems, ice, downspouts and drainage, seamless gutters, guards, hail, cleaning, and choosing an installer. Each section points to the supporting article."),
  past=[T('overflowing-gutters','Why Your Gutters Overflow and How to Fix It','checklist',['gutters overflowing','gutter overflow fix'],"Clogs, slope, downspout count and size, undersized gutters, roof valleys, and what to try before replacing."),
        T('downspouts-and-foundation','Downspouts, Drainage and a Dry Basement','educational-article',['downspout extension','gutter drainage foundation'],"Where water should go, extensions, underground lines, grading, and signs drainage is failing."+sfg('water-damage-guide-sioux-falls','Water Damage in Your Sioux Falls Home, What to Do','In the section about water already getting inside')),
        T('gutters-and-ice-dams','Gutters, Icicles and Ice Dams','educational-article',['ice in gutters','gutters ice dams'],"Why ice forms, what gutters do and do not cause, heat cables, safe removal, and the attic fix."+sfg('ice-dams-sioux-falls-roof','Ice Dams on Sioux Falls Roofs','In the section about where ice dams really start')),
        T('seamless-vs-sectional-gutters','Seamless or Sectional Gutters?','comparison',['seamless gutters','seamless vs sectional'],"Leaks at seams, materials, sizes, install, repairs. No prices, no brands."),
        T('gutter-guards-worth-it','Are Gutter Guards Worth It in Sioux Falls?','buying-guide',['gutter guards','gutter guards worth it'],"Screens, micro mesh, reverse curve, foam; ice and snow; trees; cleaning still needed; warranty questions. No brands, no prices.")],
  future=[T('gutter-cleaning-schedule','A Gutter Cleaning Schedule for Sioux Falls','maintenance-guide',['gutter cleaning','when to clean gutters'],"Spring, fall, before winter, after storms, ladder safety, and when to hire it out."),
          T('hail-damaged-gutters','Hail Damaged Gutters and What Insurance Looks At','checklist',['hail damage gutters','dented gutters'],"Dents, splits, bent hangers, photos, and including gutters in a storm claim. No invented policy terms."),
          T('gutter-sizing','Gutter Size and Why It Matters','educational-article',['gutter size','5 inch vs 6 inch gutters'],"Roof area, pitch, downspout size and count. Describe the tradeoffs without stating code numbers."),
          T('sagging-gutters','Sagging or Pulling Away Gutters','checklist',['sagging gutters','gutter pulling away'],"Hangers, rotted fascia, ice weight, and repair versus replace."),
          T('gutter-materials','Aluminum, Steel or Copper Gutters','comparison',['gutter materials','aluminum vs steel gutters'],"Strength against ice and hail, rust, look, and upkeep. No prices."),
          T('gutters-and-siding','How Gutters Protect Your Siding and Trim','educational-article',['gutters siding damage','fascia rot'],"Splash-back, staining, rot, and what to fix first."),
          T('winter-gutter-prep','Getting Gutters Ready for Winter','seasonal-guide',['winterize gutters','gutters before winter'],"Clean, check slope and hangers, extend downspouts, and avoid ice traps."),
          T('rain-chains-and-barrels','Rain Barrels and Rain Chains in a Cold Climate','buying-guide',['rain barrel','rain chain'],"What works here, freezing, overflow, and putting them away for winter."),
          T('choosing-gutter-installer','Questions to Ask a Gutter Installer','checklist',['gutter installer','gutter contractor'],"Sizing, hangers, downspout plan, guards, cleanup, warranty, licensing when combined with siding or roofing.")]),

 dict(slug='insulation', name='Insulation', parent='home-services', icon='layers',
  show='home insulation as the clear subject (attic insulation, insulation being installed, or an attic)', query='attic insulation installation',
  seo=('Insulation Contractors in Sioux Falls, SD','Cold rooms, ice dams or high heating bills in Sioux Falls? Local guides on attic insulation, air sealing, spray foam, basements and what to ask an installer.'),
  intro="In a Sioux Falls winter, insulation is the difference between a house that holds heat and one that leaks it into the attic. Cold rooms, ice dams and frost on attic nails are often the same problem showing up in different places.\n\nThe best results usually start with air sealing and the attic, then move to walls and the basement as the house tells you where it is losing heat.",
  tips=["Ask whether they will air seal the attic floor before adding insulation, because insulation alone does not stop air leaks.",
        "Ask how they will keep soffit vents open so the attic can still breathe.",
        "Ask what depth or R-value they will reach and how you can see it afterward, such as rulers or markers in the attic.",
        "Ask how they handle bath fans that vent into the attic, since that moisture causes frost and mold.",
        "Get the material, coverage, and cleanup in writing, and ask about any utility rebates rather than federal tax credits."],
  faqs=[("Why are some rooms in my house so cold?","Common causes are thin or missing attic insulation, air leaks around lights and plumbing, rooms over garages, and ducts in cold spaces. An energy assessment or a contractor with a thermal camera can find which one it is."),
        ("Does insulation prevent ice dams?","It helps a lot. Ice dams form when heat leaks into the attic and melts snow on the roof. Air sealing, insulation and ventilation together keep the roof cold so snow stays put."),
        ("Is blown-in or spray foam better?","They do different jobs. Blown-in is common for open attic floors, while spray foam seals and insulates tight spots like rim joists. Many homes use both."),
        ("Is there still a federal tax credit for insulation?","Not for work placed in service now. According to the IRS, the Energy Efficient Home Improvement Credit does not apply to property placed in service after December 31, 2025. Ask your utility about current rebates."),
        ("Why is there frost in my attic?","Warm, moist air from the house is reaching the cold attic and freezing on the roof boards and nails. Air sealing and venting bath fans outside are usually the fix."),
        ("Can I add insulation over what I already have?","Usually, if the old insulation is dry and not moldy. A contractor should check for wet spots, critters and blocked vents first.")],
  voc="VOICE OF THE CUSTOMER, paraphrased from Sioux Falls homeowners' public reviews and project requests for local insulation contractors (never quote or name them): wet spots on upstairs bedroom ceilings in January and ice on the attic framing; rooms that stay cold no matter the thermostat; rooms over an attached garage that never feel warm; praise for blown-in attic jobs done in a single visit; wanting crews who explain what they found in the attic and show photos.",
  facts=[NO_25C],
  pillar=T('insulation-guide-sioux-falls','Insulating a Sioux Falls Home, the Homeowner\'s Guide','buying-guide',['insulation Sioux Falls','attic insulation Sioux Falls'],"Roadmap: where homes lose heat, attic first, air sealing, ventilation, ice dams, frost in the attic, walls, basements and rim joists, materials, and choosing an installer. Each section points to the supporting article."),
  past=[T('cold-rooms-causes','Why One Room Is Always Cold','checklist',['cold room in house','rooms colder than others'],"Attic gaps, air leaks, rooms over garages, windows, ducts; how to narrow it down; when to call."),
        T('attic-insulation-first','Why the Attic Comes First','educational-article',['attic insulation','add attic insulation'],"Heat rises, air sealing the attic floor, depth, keeping vents open, and what to expect on install day."),
        T('frost-in-attic','Frost and Wet Spots in the Attic in January','educational-article',['frost in attic','attic condensation winter'],"VOC: wet ceiling spots and ice on framing. Air leaks, bath fans, ventilation, and what to fix first."),
        T('insulation-and-ice-dams','Insulation, Ventilation and Ice Dams','educational-article',['prevent ice dams insulation','attic ventilation'],"How a warm attic melts snow, what air sealing and venting do, and why gutters are not the cure."+sfg('ice-dams-sioux-falls-roof','Ice Dams on Sioux Falls Roofs','In the section about what ice dams do to a roof')),
        T('blown-in-vs-spray-foam','Blown-In, Batts or Spray Foam?','comparison',['blown in vs spray foam','insulation types'],"Where each fits, air sealing, moisture, and mixing types. No prices, no brands.")],
  future=[T('air-sealing-basics','Air Sealing, the Cheapest Comfort Upgrade','educational-article',['air sealing','seal air leaks'],"Where leaks hide, what gets sealed, and testing."),
          T('rim-joist-insulation','Basement Rim Joists, the Hidden Cold Spot','educational-article',['rim joist insulation','basement insulation'],"Why rim joists leak, materials, moisture, and DIY versus pro."),
          T('room-over-garage','Warming a Room Over the Garage','checklist',['cold room over garage','bonus room insulation'],"Floor insulation, air sealing, ducts, and what to ask."),
          T('wall-insulation-older-homes','Adding Insulation to Walls in an Older Home','buying-guide',['wall insulation older home','blown in wall insulation'],"Dense pack, checking for wiring, moisture, and siding projects as a chance to insulate."),
          T('energy-assessment','What a Home Energy Assessment Shows','educational-article',['home energy audit','blower door test'],"Blower door, thermal camera, report, and how to use it. Ask your utility about programs. Never claim a federal tax credit."),
          T('insulation-quotes','How to Compare Insulation Quotes','buying-guide',['insulation quote','attic insulation estimate'],"Depth or R-value, air sealing, vent baffles, old insulation removal, cleanup. No prices."),
          T('bath-fans-and-attic','Bath Fans Venting Into the Attic','checklist',['bathroom fan vent attic','bath fan venting'],"Why it causes frost and mold, how to tell, and the fix."),
          T('insulation-and-critters','Mice, Squirrels and Old Insulation','checklist',['rodents in insulation','attic insulation removal'],"Signs, removal, sealing entry points, and starting fresh."),
          T('choosing-insulation-contractor','Questions to Ask an Insulation Contractor','checklist',['insulation contractor','insulation installer'],"Air sealing, ventilation, depth markers, photos, cleanup, warranty.")]),

 dict(slug='fencing', name='Fencing', parent='home-services', icon='home',
  show='a residential fence as the clear subject (a backyard fence, or a fence being built)', query='backyard wood fence',
  seo=('Fence Companies in Sioux Falls, SD','Building or replacing a fence in Sioux Falls? Local guides on permits, height limits, materials for our winters, property lines and what to ask a fence company.'),
  intro="Every fence in Sioux Falls needs a permit, and that surprises a lot of homeowners. Height limits depend on where the fence sits, and covenants in many neighborhoods add their own rules.\n\nGet the permit, the property line and the post depth right, and the material choice becomes the fun part.",
  tips=["Ask who pulls the fence permit and schedules the final inspection, since the City requires both.",
        "Confirm where the property line is before anyone digs; the City's fence guide says a licensed surveyor should locate it.",
        "Ask how deep posts are set and how they handle frost heave in our clay soil.",
        "Check your neighborhood covenants for height, style and material rules before you choose.",
        "Call 811 before digging, and ask the contractor to confirm utilities are marked."],
  faqs=[("Do I need a permit to build a fence in Sioux Falls?","Yes. According to the City of Sioux Falls, you need a permit to build, move, replace or repair a fence. The City's fence pamphlet lists the permit fee as $20, and a final inspection is required after the fence is finished."),
        ("How tall can my fence be?","It depends on which yard it is in. The City's residential fence guide allows fences up to four feet in front yards, with taller limits in side and rear yards. Check the current rules with the Zoning Office before you buy materials."),
        ("How do I know where my property line is?","Do not guess from the old fence. The City's fence guide says property lines should be located by a licensed surveyor. Pins or a survey save expensive mistakes."),
        ("Which fence material lasts best here?","Wood, vinyl, aluminum, steel and chain link each handle cold, wind and sun differently. Ask each contractor how their product handles frost heave, wind load and upkeep."),
        ("How long is a fence permit good for?","The City's fence pamphlet says permits expire six months after they are issued, and extensions are available from the Zoning Office."),
        ("Can I build a fence in winter?","Sometimes, if the ground can be dug and set. Ask how they handle frozen soil and whether posts will be set properly before snow.")],
  voc="VOICE OF THE CUSTOMER, paraphrased from Sioux Falls homeowners' public reviews of local fence installers (never quote or name them): wanting a fence for dogs and kids quickly; posts that heaved or leaned after a winter; gates that sag and stop latching; neighbors disagreeing about the property line; HOA rules on height and style; praise for crews who handled the permit and cleaned up.",
  facts=["City of Sioux Falls: a permit is needed to build, move, replace or repair a fence. The City's fence permit pamphlet lists a $20 fee, a required final inspection after construction (call the Zoning Office at 605-367-8254), and permits that expire six months after issue with extensions available.", "City of Sioux Falls residential fence guide: on corner and interior lots, fences can be up to four feet tall in the front yard, and locating property lines should be done by a licensed surveyor.", "Many Sioux Falls neighborhoods have covenants that restrict fence height, style or material beyond City rules; check yours."],
  pillar=T('fence-guide-sioux-falls','Building a Fence in Sioux Falls, the Homeowner\'s Guide','buying-guide',['fence Sioux Falls','fence installation Sioux Falls'],"Roadmap: permits and inspection, height rules, property lines, covenants, materials for our winters, posts and frost, gates, dogs and kids, quotes, and choosing an installer. Each section points to the supporting article."),
  past=[T('fence-permit-sioux-falls','Fence Permits in Sioux Falls, What to Know','educational-article',['fence permit Sioux Falls','fence permit cost'],"Use the City facts: every fence needs a permit, the fee, inspection, expiration, and where to apply. Tell readers to confirm with the Zoning Office."),
        T('fence-height-rules','Fence Height Rules by Yard','educational-article',['fence height Sioux Falls','front yard fence height'],"Front, side and rear yards, corner lots and sight lines, covenants. Only state limits given in the facts and tell readers to confirm the rest."),
        T('property-line-fence','Property Lines, Surveys and Your Neighbor','checklist',['property line fence','fence survey'],"Finding pins, surveys, talking to neighbors, setbacks, and putting agreements in writing."),
        T('fence-materials-cold-climate','Wood, Vinyl, Aluminum or Chain Link?','comparison',['fence materials','vinyl vs wood fence'],"Cold, wind, sun, upkeep, privacy, look. No prices, no brands."),
        T('fence-posts-frost-heave','Why Fence Posts Heave and Lean','educational-article',['fence post frost heave','leaning fence post'],"Frost, clay soil, post depth and footing, drainage, and fixes. Do not state code depths.")],
  future=[T('fence-for-dogs','Choosing a Fence for Dogs','buying-guide',['dog fence','fence for dogs'],"Height, gaps, digging, climbing, gates, and visibility."),
          T('sagging-fence-gate','Fixing a Sagging Fence Gate','checklist',['sagging gate','gate not latching'],"Hinges, posts, bracing, frost, and when to rebuild."),
          T('privacy-fence-options','Privacy Fences That Still Look Good','buying-guide',['privacy fence','privacy fence ideas'],"Styles, height limits, wind, and neighbors."),
          T('fence-quotes','How to Compare Fence Quotes','buying-guide',['fence quote','fence estimate'],"Linear feet, posts, gates, removal, permit, cleanup, warranty. No prices."),
          T('fence-and-hoa','Fences, Covenants and HOA Approval','checklist',['HOA fence rules','fence covenants'],"Finding covenants, approval steps, and what happens if you skip it."),
          T('wood-fence-care','Making a Wood Fence Last','maintenance-guide',['wood fence maintenance','stain fence'],"Staining, sealing, snow piles, sprinklers, and repairs."),
          T('fence-in-winter','Can a Fence Go In During Winter?','seasonal-guide',['winter fence installation','frozen ground fence'],"Frozen ground, scheduling, and what to ask."),
          T('call-811-before-digging','Call 811 Before You Dig a Fence Line','checklist',['call 811','utility locate'],"How locates work, timing, private lines, and safety."),
          T('choosing-fence-company','Questions to Ask a Fence Company','checklist',['fence company','fence installer'],"Permit, inspection, posts, gates, cleanup, warranty, and timeline.")]),

 dict(slug='deck-builders', name='Deck Builders', parent='home-services', icon='home',
  show='a residential deck as the clear subject (a backyard deck or a deck being built)', query='backyard wood deck',
  seo=('Deck Builders in Sioux Falls, SD','Building or replacing a deck in Sioux Falls? Local guides on permits, footings and frost, wood or composite, safety checks and what to ask a deck builder.'),
  intro="A deck in Sioux Falls spends half the year under snow and the other half in hard sun. The parts you never see, footings below the frost line and a solid connection to the house, decide whether it lasts.\n\nStart with a permit and a builder who explains the structure, then choose the boards and railings you will enjoy looking at.",
  tips=["Ask who pulls the building permit, since decks are on the City's list of projects that need one.",
        "Ask how deep the footings go and how they protect against frost heave.",
        "Ask how the deck attaches to the house and how that connection is flashed to keep water out.",
        "Ask what fasteners and hardware they use, because hidden corrosion is a common failure.",
        "Get the material, railing, stairs, permit and cleanup written into the quote."],
  faqs=[("Do I need a permit to build a deck in Sioux Falls?","Yes. The City of Sioux Falls lists decks among the projects that need a building permit. A licensed residential contractor or a homeowner pulling their own permit can apply."),
        ("Why do footings matter so much here?","Footings that do not reach below the frost line can be lifted by freezing soil, which twists and loosens a deck. Ask your builder and the City what depth your project needs."),
        ("Wood or composite?","Wood costs less up front and needs more upkeep. Composite and PVC need less maintenance but handle heat and cold differently. Ask each builder how their product handles our temperature swings."),
        ("How do I know if my old deck is safe?","Look for soft or split boards, wobbly railings, rusted hardware and a loose connection to the house. Have a builder inspect it before a big gathering."),
        ("Can I shovel snow off my deck?","Yes, gently, with a plastic shovel and without chipping boards. Ask your board maker what ice melt is safe for your surface."),
        ("How long does a deck take to build?","It depends on size, permits, weather and materials. Ask for a written schedule that includes inspections.")],
  voc="VOICE OF THE CUSTOMER, paraphrased from Sioux Falls homeowners' public reviews and project requests for local deck builders (never quote or name them): a 20-year-old deck they want checked to see if it needs a rebuild; replacing an old deck before retirement summers; wanting upper and lower decks quoted together; praise for builders who were on time, polite and cleaned up; composite deck projects; contractors who stopped returning calls.",
  facts=[PERMIT_LIST, LICENSE, "Footings must reach below the local frost line to avoid frost heave; tell readers to confirm the required depth with City Building Services rather than stating a number."],
  pillar=T('deck-guide-sioux-falls','Building a Deck in Sioux Falls, the Homeowner\'s Guide','buying-guide',['deck builder Sioux Falls','deck Sioux Falls'],"Roadmap: permits, footings and frost, ledger connection, wood or composite, railings and stairs, safety checks on old decks, winter care, quotes, and choosing a builder. Each section points to the supporting article."),
  past=[T('deck-permit-sioux-falls','Deck Permits in Sioux Falls, What to Know','educational-article',['deck permit Sioux Falls','building permit deck'],"Use the City facts: decks need a permit, who can pull it, inspections, homes outside city limits. Tell readers to confirm with Building Services."),
        T('old-deck-safety-check','Is Your Old Deck Safe? A Spring Checklist','checklist',['deck safety inspection','old deck repair'],"VOC: a 20-year-old deck. Boards, joists, ledger, posts, hardware, railings, stairs, and when to rebuild."),
        T('wood-vs-composite-deck','Wood or Composite Decking in Sioux Falls?','comparison',['wood vs composite deck','composite decking'],"Cold and heat, upkeep, look, slip, snow, lifespan. No prices, no brands."),
        T('deck-footings-frost','Deck Footings and Frost Heave','educational-article',['deck footings','frost heave deck'],"Why depth matters, signs of heave, fixes. Do not state code depths."),
        T('deck-repair-or-replace','Repair or Replace Your Deck?','buying-guide',['deck repair','replace deck'],"Frame versus boards, resurfacing, rot, and costs to ask about. No prices.")],
  future=[T('deck-ledger-flashing','The Ledger Board, Where Decks Fail','educational-article',['deck ledger','deck flashing'],"Attachment, flashing, rot, and inspection."),
          T('deck-railings-stairs','Choosing Deck Railings and Stairs','buying-guide',['deck railing','deck stairs'],"Materials, safety, snow, and look. Do not state code dimensions."),
          T('deck-winter-care','Caring for a Deck Through Winter','seasonal-guide',['deck snow removal','ice melt deck'],"Shoveling, ice melt, furniture, and spring checks."),
          T('deck-quotes','How to Compare Deck Quotes','buying-guide',['deck quote','deck builder estimate'],"Size, footings, materials, railings, stairs, permit, demolition, warranty. No prices."),
          T('deck-stain-seal','Staining and Sealing a Wood Deck','maintenance-guide',['deck stain','seal deck'],"Timing, prep, products in general, and frequency."),
          T('covered-deck-pergola','Adding a Roof or Pergola to Your Deck','buying-guide',['covered deck','pergola deck'],"Snow load questions, permits, and shade. No code numbers."),
          T('deck-or-patio','Deck or Patio for Your Yard?','comparison',['deck vs patio','patio or deck'],"Grade, cost questions, upkeep, and use."+sfg('concrete-guide-sioux-falls','Concrete Work in Sioux Falls','In the section about patios')),
          T('hot-tub-on-deck','Can Your Deck Hold a Hot Tub?','checklist',['hot tub on deck','deck weight hot tub'],"Load, footings, engineer, electrical permit. No numbers."),
          T('choosing-deck-builder','Questions to Ask a Deck Builder','checklist',['deck builder questions','hire deck builder'],"Permit, footings, ledger, hardware, schedule, cleanup, warranty, licensing.")]),

 dict(slug='basement-waterproofing', name='Basement Waterproofing', parent='home-services', icon='layers',
  show='a residential basement or foundation as the clear subject (basement walls, a sump pump, or foundation work)', query='basement foundation wall',
  seo=('Basement Waterproofing and Foundation Repair in Sioux Falls, SD','Wet basement or foundation cracks in Sioux Falls? Local guides on drainage, sump pumps, cracks, bowing walls, radon and what to ask a contractor.'),
  intro="Sioux Falls basements deal with spring thaw, heavy summer rain and clay soil that swells and shrinks. A little water in the corner is a message worth listening to.\n\nMany wet basements start outside with gutters, grading and downspouts. Some need drain tile, a sump or structural repair. Knowing which is which keeps you from paying for the wrong fix.",
  tips=["Check grading, gutters and downspouts first, since many wet basements start outside the house.",
        "Ask whether the contractor recommends interior drainage, exterior work or a simple crack repair, and why.",
        "For cracks or bowing walls, ask whether an engineer should look before anyone sells you a system.",
        "Test for radon; the eastern part of South Dakota, including Sioux Falls, is in EPA Radon Zone 1.",
        "Get the warranty in writing and ask whether it transfers if you sell."],
  faqs=[("Why is my basement wet only in spring?","Snowmelt and spring rain saturate the soil around the foundation. Gutters, downspouts and grading that send water toward the house make it worse. Fix the outside first and watch what changes."),
        ("Are foundation cracks always a problem?","No. Thin, dry cracks are common as concrete cures. Cracks that leak, widen, or come with bowing walls or sticking doors should be checked by a professional or engineer."),
        ("Do I need a sump pump?","If water collects under the floor or a drain tile system is installed, a sump pump moves it out. Ask about a backup in case power fails during a storm."),
        ("Should I test my basement for radon?","Yes. South Dakota's Department of Agriculture and Natural Resources says the eastern part of the state is EPA Radon Zone 1, and the only way to know your level is to test. The state has offered free test kits to residents."),
        ("Interior or exterior waterproofing?","Interior drain tile and a sump manage water that gets in. Exterior work stops it at the wall but means digging. Ask each contractor why they recommend one for your home."),
        ("Can I finish a basement that has had water?","Only after the cause is fixed and the space stays dry through a wet season. Finishing over a moisture problem traps it behind walls.")],
  voc="VOICE OF THE CUSTOMER, paraphrased from Sioux Falls homeowners' public reviews of local basement and foundation companies (never quote or name them): water in one corner every spring; cracks in the basement wall that grew; bowing walls and sticking doors; a sump pump that failed during a storm; worry about being oversold a whole system when one crack needed sealing; strong frustration with a company that left a bad experience; praise for crews who explained the cause before selling a fix.",
  facts=["South Dakota Department of Agriculture and Natural Resources: the eastern portion of South Dakota is EPA Radon Zone 1 and the balance is Zone 2; the only way to know a building's radon level is to test, and DANR has offered free radon test kits to residents.", "Dakota News Now (April 2023), citing state data for 2008 to 2017: Minnehaha County, with 1,920 tests, had an estimated mean radon level of 6.5 pCi/L. The EPA recommends action at or above 4.0 pCi/L.", LICENSE],
  pillar=T('basement-waterproofing-guide-sioux-falls','A Dry Basement in Sioux Falls, the Homeowner\'s Guide','buying-guide',['basement waterproofing Sioux Falls','foundation repair Sioux Falls'],"Roadmap: where water comes from, outside fixes first, cracks, bowing walls, drain tile and sumps, window wells, radon, finishing a basement, and choosing a contractor. Each section points to the supporting article."),
  past=[T('wet-basement-spring','Why Your Basement Gets Wet in Spring','educational-article',['wet basement spring','basement leak after rain'],"VOC: water in a corner every spring. Snowmelt, grading, gutters, window wells, cove joint, and what to try first."),
        T('foundation-cracks','Foundation Cracks, Which Ones Matter','checklist',['foundation crack','basement wall crack'],"Hairline, leaking, widening, stair-step, horizontal; when to call an engineer. No prices."),
        T('sump-pump-guide','Sump Pumps, Backups and Storm Season','buying-guide',['sump pump','sump pump backup'],"How they work, testing, backups, alarms, and discharge location."),
        T('radon-testing-sioux-falls','Radon Testing in a Sioux Falls Basement','educational-article',['radon Sioux Falls','radon test'],"Use the radon facts with sources. Testing, results, mitigation basics, and selling a home."),
        T('grading-and-downspouts','Grading and Downspouts, the Cheapest Basement Fix','checklist',['yard grading basement','downspout basement water'],"Slope, extensions, window wells, landscaping, and checking after rain."+sfg('water-damage-guide-sioux-falls','Water Damage in Your Sioux Falls Home, What to Do','In the section about water that already got inside'))],
  future=[T('interior-vs-exterior-waterproofing','Interior or Exterior Waterproofing?','comparison',['interior vs exterior waterproofing','drain tile'],"How each works, disruption, and why one is recommended. No prices."),
          T('bowing-basement-walls','Bowing Basement Walls','educational-article',['bowing basement wall','wall anchors'],"Clay soil pressure, signs, engineers, repair approaches in general."),
          T('window-wells','Window Wells That Leak','checklist',['window well leak','window well cover'],"Drains, covers, gravel, and egress."),
          T('basement-dehumidifier','Basement Humidity, Musty Smells and Dehumidifiers','buying-guide',['basement dehumidifier','musty basement'],"Causes, sizing questions, draining, and when it is a water problem instead."),
          T('finishing-a-wet-basement','Before You Finish a Basement That Has Been Wet','checklist',['finish basement moisture','basement finishing water'],"Fix first, wait a season, materials, and permits."),
          T('waterproofing-quotes','How to Compare Waterproofing Quotes','buying-guide',['basement waterproofing quote','foundation repair estimate'],"Cause diagnosis, scope, warranty transfer, and oversell warning signs. No prices."),
          T('settling-concrete-floor','Cracked or Settling Basement Floors','educational-article',['basement floor crack','settling slab'],"Shrinkage cracks, heaving, settling, and what to watch."),
          T('basement-backup-vs-seepage','Sewer Backup or Groundwater?','comparison',['basement water source','floor drain backup'],"How to tell the difference and who to call."),
          T('choosing-waterproofing-contractor','Questions to Ask a Waterproofing Contractor','checklist',['waterproofing contractor','foundation repair company'],"Diagnosis, engineer, warranty, licensing, and references.")]),

 dict(slug='kitchen-remodeling', name='Kitchen Remodeling', parent='home-remodeling', icon='home',
  show='a residential kitchen as the clear subject (cabinets, counters, or a kitchen being remodeled)', query='modern home kitchen interior',
  seo=('Kitchen Remodeling in Sioux Falls, SD','Planning a kitchen remodel in Sioux Falls? Local guides on budgets, layouts, cabinets, counters, permits, timelines and what to ask a remodeler.'),
  intro="A kitchen remodel touches almost every trade in the house: cabinets, counters, plumbing, electrical, flooring and often walls. That is why the planning matters more than the finishes.\n\nKnow what needs a permit, how long you will cook without a kitchen, and where the budget really goes, and the rest gets easier.",
  tips=["Ask for an itemized bid that separates cabinets, counters, plumbing, electrical, flooring and labor.",
        "Ask which parts of your plan need permits, since cabinets alone do not but plumbing, electrical and walls do.",
        "Ask how long you will be without a working sink and stove, and plan a temporary kitchen.",
        "Order cabinets early and ask about lead times before demolition starts.",
        "Ask how change orders are priced and approved in writing."],
  faqs=[("Do I need a permit for a kitchen remodel in Sioux Falls?","It depends on the work. The City of Sioux Falls says kitchen cabinets and countertops do not need a permit, but electrical, plumbing and structural changes do, and that work must be done by licensed contractors or a homeowner with homeowner permits."),
        ("How long does a kitchen remodel take?","It depends on scope and material lead times, especially cabinets and counters. Ask for a written schedule that shows when the kitchen will be out of service."),
        ("Where does most of a kitchen budget go?","Cabinets, counters and labor are usually the big pieces, and moving plumbing or walls adds more. An itemized bid shows you where yours goes."),
        ("Should I refinish or replace cabinets?","If the boxes are solid and the layout works, refacing or painting can save a lot. Replace when the layout fails you or the boxes are damaged."),
        ("What counter material holds up best?","Quartz, granite, laminate and butcher block each have tradeoffs for heat, stains and upkeep. Ask to see samples in your own light."),
        ("Does hard water matter in a kitchen?","Yes. The City reports hard water, which leaves scale on faucets, sinks and dishwashers. Choose finishes that wipe clean and ask a plumber about a softener.")],
  voc="VOICE OF THE CUSTOMER, paraphrased from Sioux Falls homeowners' public reviews of local kitchen remodelers and cabinet shops (never quote or name them): a detailed estimate and timeline that stayed on target; regular communication about what the homeowner needed to do; replacing cabinet fronts and hardware instead of whole cabinets; a designer who planned every inch of the kitchen; living without a kitchen longer than expected; wanting to see work similar to theirs before hiring.",
  facts=["City of Sioux Falls (April 2025 home improvement reminders): cabinets and countertops, flooring and painting do not require a permit; projects involving building, electrical, mechanical or plumbing systems do.", PERMIT_LIST, HARD],
  pillar=T('kitchen-remodel-guide-sioux-falls','Remodeling a Kitchen in Sioux Falls, the Homeowner\'s Guide','buying-guide',['kitchen remodel Sioux Falls','kitchen remodeling Sioux Falls'],"Roadmap: scope, budget, layout, cabinets, counters, appliances, lighting, permits, timeline and living without a kitchen, and choosing a remodeler. Each section points to the supporting article."),
  past=[T('kitchen-remodel-budget','Where a Kitchen Remodel Budget Really Goes','cost-guide',['kitchen remodel cost Sioux Falls','kitchen budget'],"Cabinets, counters, labor, moving plumbing, surprises, contingency, itemized bids. No dollar figures."+link('https://siouxfallsrevamp.com/category/kitchen/','a Sioux Falls homeowner renovation guide covering kitchen projects')),
        T('reface-or-replace-cabinets','Refinish, Reface or Replace Kitchen Cabinets?','comparison',['reface cabinets','replace kitchen cabinets'],"VOC: replacing fronts and hardware. When each makes sense. No prices."),
        T('kitchen-layout-basics','Kitchen Layouts That Work Day to Day','buying-guide',['kitchen layout','kitchen design ideas'],"Work zones, aisles, storage, island questions, and common mistakes. Do not state clearance numbers."),
        T('kitchen-permits-sioux-falls','Kitchen Remodel Permits in Sioux Falls','educational-article',['kitchen remodel permit Sioux Falls','permit for kitchen'],"Use the City facts: what needs a permit and what does not, licensed trades, homeowner permits."),
        T('living-without-a-kitchen','Living Without a Kitchen During a Remodel','checklist',['temporary kitchen','kitchen remodel timeline'],"Temporary kitchen setup, schedule stages, dust, and keeping sane.")],
  future=[T('countertop-materials','Choosing Countertops You Will Still Like','comparison',['countertop materials','quartz vs granite'],"Heat, stains, seams, upkeep, look. No prices, no brands."),
          T('kitchen-lighting','Kitchen Lighting That Actually Helps','buying-guide',['kitchen lighting','under cabinet lighting'],"Task, ambient, under-cabinet, electrical permit."),
          T('cabinet-lead-times','Ordering Cabinets and Avoiding Delays','checklist',['cabinet lead time','kitchen cabinets order'],"Measuring, ordering, damage on delivery, and sequencing."),
          T('hard-water-kitchen','Hard Water and Your New Kitchen','buying-guide',['hard water kitchen faucet','hard water dishwasher'],"Use the City water fact. Finishes, faucets, dishwashers, softener questions."),
          T('kitchen-flooring','Flooring Under Kitchen Cabinets or Around Them?','educational-article',['kitchen flooring','floor under cabinets'],"Order of work, water resistance, and future changes."+sfg('lvp-vs-laminate-vs-hardwood','LVP, Laminate, or Hardwood? Choosing for a Sioux Falls Home','In the section about choosing the floor material')),
          T('kitchen-remodel-quotes','How to Compare Kitchen Remodel Quotes','buying-guide',['kitchen remodel quote','kitchen contractor estimate'],"Itemizing, allowances, change orders, payment schedule, warranty. No prices."),
          T('small-kitchen-updates','Small Kitchen Updates With Big Impact','buying-guide',['kitchen refresh','small kitchen update'],"Hardware, lighting, backsplash, faucet, paint, and what not to bother with."),
          T('kitchen-ventilation','Range Hoods and Kitchen Ventilation','buying-guide',['range hood','kitchen ventilation'],"Venting outside, makeup air questions, noise, and permits in general."),
          T('choosing-kitchen-remodeler','Questions to Ask a Kitchen Remodeler','checklist',['kitchen remodeler questions','hire kitchen contractor'],"VOC: estimates and timelines on target. Licensing, permits, subs, schedule, communication, warranty.")]),

 dict(slug='snow-removal', name='Snow Removal', parent='home-services', icon='sparkles',
  show='snow removal at a home (a snowy driveway or sidewalk, a snow blower, shoveling, or a small plow)', query='snow blower driveway',
  seo=('Snow Removal in Sioux Falls, SD','Snow removal for Sioux Falls homes: the 48-hour sidewalk rule, snow alerts, hiring a service, per-push or seasonal contracts and protecting your driveway.'),
  intro="In Sioux Falls, clearing snow is not just about getting the car out. The City requires sidewalks cleared within 48 hours after snow stops, edge to edge and down to the concrete.\n\nWhether you shovel, run a snow blower or hire a service, knowing the rules and what a good contract covers saves fines, sore backs and arguments in February.",
  tips=["Ask exactly what triggers a visit, such as a set snowfall depth, and whether sidewalks are included every time.",
        "Ask what time they arrive after overnight snow, and whether you are early or late on their route.",
        "Ask where they will pile snow, since pushing it into the street is against City ordinance.",
        "Ask how they protect lawn edges, landscaping and concrete, and what ice melt they use.",
        "Get the pricing method in writing: per push, per inch or seasonal."],
  faqs=[("How long do I have to clear my sidewalk in Sioux Falls?","According to the City of Sioux Falls, sidewalks must be cleared of snow and ice within 48 hours after snow stops falling, edge to edge and down to the concrete. Corner curb ramps count too."),
        ("Can I push snow into the street?","No. The City says placing snow from your driveway or sidewalk onto the street violates City ordinance. Pile it in your yard."),
        ("What happens if I do not clear my sidewalk?","The City can follow up on reports after the 48-hour window, and its ordinance allows the City to have the snow removed and charge the property owner."),
        ("What is a snow alert?","The City declares a snow alert when it plans to plow all streets. Vehicles parked on city streets during a snow alert may be ticketed or towed, so check the City's snow alert tracker."),
        ("Per push or seasonal contract?","Per push can cost less in a light winter, while seasonal gives a fixed price no matter how much falls. Ask what each includes, especially sidewalks and ice."),
        ("Is ice melt bad for my concrete?","Some products can damage newer concrete and plants. Ask your service what they use and follow your concrete installer's advice.")],
  voc="COMMON HOMEOWNER CONCERNS about hiring snow removal in Sioux Falls (general, not quotes from specific reviews): wanting the driveway open before leaving for work; services that skip the sidewalk or come back late after a second storm; plows tearing up lawn edges and landscaping; snow piles blocking the mailbox or sight lines at the end of the driveway; confusion about per push versus seasonal pricing; older homeowners who cannot shovel worried about the City's sidewalk rule.",
  facts=["City of Sioux Falls: sidewalks must be cleared of snow and ice within 48 hours after snow stops falling, edge to edge and down to the concrete, including curb ramps on corner lots (City Ordinance 96.100). Reports filed before the 48-hour mark are not investigated. Residents can report concerns and track violations online, and Property Maintenance can be reached at 605-978-6900.", "City of Sioux Falls: when shoveling or using a snow blower, place snow in your yard, not on sidewalks, streets or the right of way; depositing snow in the street violates City ordinance. City ordinance 96.103 allows the City to remove snow and ice and 96.104 to specially assess the cost.", "City of Sioux Falls: a snow alert is declared when the City plans to plow all streets; vehicles parked on city streets during a snow alert may be ticketed and/or towed. The City runs a Snow Alert Tracker with zone maps and plow progress.", "Dakota News Now, as reported by KSOO in 2025: an uncleared sidewalk can bring a $100 penalty, and the City can hire a snow removal company at the owner's cost."],
  pillar=T('snow-removal-guide-sioux-falls','Snow Removal in Sioux Falls, the Homeowner\'s Guide','buying-guide',['snow removal Sioux Falls','sidewalk snow rules Sioux Falls'],"Roadmap: the 48-hour sidewalk rule, snow alerts and parking, where snow can go, DIY versus hiring, contracts, protecting concrete and lawns, ice, and helping neighbors. Each section points to the supporting article."),
  past=[T('sidewalk-snow-48-hours','The 48-Hour Sidewalk Rule, Explained','educational-article',['Sioux Falls sidewalk snow rule','48 hour snow removal'],"Use the City facts with sources: timing, edge to edge, curb ramps, reports, penalties, City removal."),
        T('snow-alert-parking','Snow Alerts and Where to Park','educational-article',['Sioux Falls snow alert','snow alert parking'],"What a snow alert means, ticketing and towing, the tracker, and planning ahead."),
        T('hiring-snow-removal','Hiring a Snow Removal Service','checklist',['hire snow removal','snow removal service Sioux Falls'],"Triggers, arrival times, sidewalks, piles, damage, insurance, contracts."),
        T('per-push-vs-seasonal','Per Push or Seasonal Snow Contract?','comparison',['per push snow removal','seasonal snow contract'],"How each works, light versus heavy winters, what is included. No dollar figures."),
        T('where-to-put-snow','Where to Put All That Snow','checklist',['where to pile snow','snow pile rules'],"Not in the street, sight lines, drainage in spring, mailboxes and hydrants.")],
  future=[T('snow-blower-buying','Choosing a Snow Blower for a Sioux Falls Driveway','buying-guide',['snow blower','best snow blower'],"Single or two stage, size, storage, and maintenance. No brands, no prices."),
          T('ice-melt-concrete','Ice Melt Without Ruining Your Concrete','buying-guide',['ice melt concrete','safe ice melt'],"Types in general, new concrete, pets, plants."+sfg('concrete-guide-sioux-falls','Concrete Work in Sioux Falls','In the section about protecting concrete')),
          T('shoveling-safely','Shoveling Without Hurting Yourself','checklist',['safe shoveling','shoveling tips'],"Warm up, lifting, breaks, and when to stop. Tell readers with heart or back conditions to ask a doctor."),
          T('fire-hydrant-snow','Clearing Snow Around Fire Hydrants and Mailboxes','checklist',['clear fire hydrant snow','mailbox snow'],"Why it matters and how to help."),
          T('snow-removal-damage','When a Plow Damages Your Lawn or Driveway','checklist',['snow plow damage lawn','driveway damage plow'],"Marking edges, documenting, contract language, and spring repair."),
          T('helping-neighbors-snow','Helping Neighbors Who Cannot Shovel','educational-article',['help neighbors shovel','snow help seniors'],"Being a snow angel, organizing a block, and services."),
          T('roof-snow-removal','Should You Clear Snow Off Your Roof?','checklist',['roof snow removal','roof rake'],"Roof rakes, ice dams, safety, and when to call a pro."+sfg('ice-dams-sioux-falls-roof','Ice Dams on Sioux Falls Roofs','In the section about ice dams')),
          T('winter-storm-prep','Getting Your Home Ready Before a Big Storm','seasonal-guide',['winter storm prep','blizzard checklist'],"Supplies, cars, snow alert parking, sidewalks, and generators safety."),
          T('snow-removal-contract-checklist','What a Good Snow Removal Contract Says','checklist',['snow removal contract','snow plow agreement'],"Triggers, timing, sidewalks, ice, piles, damage, payment, and cancellation.")]),
]

def add_days(d, n):
    return (dt.date.fromisoformat(d) + dt.timedelta(days=n)).isoformat()

cat_dir = os.path.join(ROOT, 'src/content/categories')
qpath = os.path.join(ROOT, 'data/topic-queue.json')
queue = json.load(open(qpath))
have = {q.get('category') for q in queue['queues']}
made = []
for i, t in enumerate(TRADES):
    cpath = os.path.join(cat_dir, f"{t['slug']}.json")
    if not os.path.exists(cpath):
        cat = {'name': t['name'], 'slug': t['slug'], 'aliases': [], 'createdAt': TODAY, 'parentCategory': t['parent'],
               'playbook': {'topics': ['hiring', 'pricing', 'local considerations'], 'contentTypes': ['faq', 'cost-guide', 'buying-guide', 'comparison', 'checklist', 'seasonal-guide']},
               'seo': {'title': t['seo'][0], 'description': t['seo'][1]}, 'icon': t['icon'], 'intro': t['intro'], 'tips': t['tips'],
               'faqs': [{'q': q, 'a': a} for q, a in t['faqs']], 'contentUpdatedAt': TODAY}
        json.dump(cat, open(cpath, 'w'), indent=2, ensure_ascii=False); open(cpath, 'a').write('\n')
    if t['slug'] in have:
        continue
    pillar = dict(t['pillar']); pillar['publishDate'] = add_days('2026-10-02', i)
    topics = []
    for k, p in enumerate(t['past']):
        p = dict(p); p['publishDate'] = add_days('2026-10-02', i + 9 * (k + 1)); topics.append(p)
    topics += [dict(f) for f in t['future']]
    queue['queues'].append({
        'cluster': f"{t['slug']}-sioux-falls", 'campaign': f"{t['name']} for Sioux Falls homes", 'category': t['slug'], 'categoryName': t['name'],
        'relatedBusinesses': [], 'everyNDays': 7, 'firstPublishDate': add_days('2026-12-01', i), 'bufferTarget': 2,
        'note': f"For homeowners. Six backdated, then nine weekly from {add_days('2026-12-01', i)}. Photos must show {t['name'].lower()}.",
        'voice': VOICE, 'localFacts': [t['voc'], *t['facts']], 'pillar': pillar, 'topics': topics})
    made.append(t['slug'])
json.dump(queue, open(qpath, 'w'), indent=2, ensure_ascii=False)

# Photo rules, one line per trade, for the photo finder.
print(json.dumps({t['slug']: {'show': t['show'], 'query': t['query']} for t in TRADES}))
print('queues added:', made)
