# Migration Report

Generated: 2026-07-29T02:45:39.728854+00:00

Source: `siouxfallsgo_WordPress_2026-07-29.xml` (859 total WXR items)

## Categories: 25 created (merged from real category + gd_placecategory usage)

- `grow-with-sfg` — merged from: Grow with SFG
- `plumbers` — merged from: Plumber, Plumbing
- Dropped: `Featured` (a flag, not a category), `Uncategorized` (WP default bucket)

## Articles: 35 migrated, 0 skipped


## Businesses: 17 migrated

**Important gap:** GeoDirectory stores address, phone, hours, and lat/long in its own database tables, not in the standard WXR export. None of the migrated businesses have address/phone/hours — that data needs a GeoDirectory-specific export (Directory to Export in the GD admin, or direct DB access to the `geodir_gd_place_detail` table) to complete.

## Pages: 18 migrated, 31 intentionally skipped

Skipped (WordPress/plugin infrastructure — rebuilt as platform features, not static content):
- Directory
- Add Listing
- Search page
- Terms and Conditions
- Location
- GD Archive
- GD Archive Item
- GD Details
- Register
- Login
- Account
- Forgot Password?
- Reset Password
- Change Password
- Profile
- Users
- Users List Item
- Home
- Blog
- Checkout
- My Invoices
- Payment Confirmation
- Transaction Failed
- My Subscriptions
- Advertising Dashboard
- Postcard
- challenge Complete
- Sioux Falls Local Service FAQs
- newtest
- test1
- Sioux Falls Local Service FAQs

## Redirects: 54 real rows written to data/redirects.csv

Run `npm run redirects` (or `npm run build`) to regenerate `public/_redirects` from this file.
