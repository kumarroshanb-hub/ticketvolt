# TiketVault — Functional Specification

**Document status:** Current-state functional specification  
**Product:** TiketVault multi-tenant ticketing platform  
**Aligned to code:** 12 November 2026

---

## 1. Purpose

This document specifies the functional behaviour, actors, permissions, validation rules, statuses and fields of the TiketVault product. It is intended for product, engineering, QA, onboarding and support teams.

The complete field-level data dictionary is in **Appendix A**. The architecture is described separately in `ARCHITECTURE.md`; workflows are in `WORKFLOWS.md`.

---

## 2. Actors and roles

| Actor | Description | Primary capabilities |
|---|---|---|
| Guest | Unauthenticated visitor | Browse public events, buy public tickets, register for free events |
| Registered customer | Authenticated user without org membership | Browse public/member-accessible events, book, view own bookings and tickets |
| Organisation Member | `member` membership in an organisation | Member-only events, organisation membership area |
| Organisation Staff | `staff` membership | Operational access; check-in and permitted operational pages |
| Organisation Admin | `admin` membership | Manage events, venues, bookings, memberships, reports, settings |
| Organisation Owner | `admin` + `is_owner=True` | Full tenant control, ownership transfer, sensitive configuration |
| Super Admin | `User.is_superuser` | All tenants, platform settings, feature entitlements, users, audit |

### Role precedence

1. Platform superuser bypasses tenant role restrictions.
2. Tenant access is resolved from `OrganizationMembership` for the current organisation.
3. Paid `Membership` grants member benefits; it does **not** grant organisation management rights.
4. Only one live owner membership is allowed per organisation.

---

## 3. Organisation creation and setup

### 3.1 Entry paths

- **Self-serve:** authenticated user with no membership creates an organisation from `/app/organizations`.
- **Super Admin:** may create an organisation and assign an owner.
- There is no plan-selection or card-capture onboarding step in the current product; platform subscription billing was removed. Feature access is assigned by superusers through feature packages.

### 3.2 Organisation creation fields

| Field | Required | Rules |
|---|---|---|
| Organisation name | Yes | 1–200 characters; slug auto-generated |
| Owner | Conditional | Creator becomes owner; superuser may assign a different owner |
| Currency/country/timezone | No | Seeded from platform defaults; editable |
| Branding/contact fields | No | Logo URL, colours, email, support/legal metadata |
| Feature package | Superuser-assigned | Determines enabled capabilities; may be blank until assigned |

### 3.3 Creation side effects

1. Organisation row created.
2. Creator becomes `OrganizationMembership(role=admin, is_owner=True)`.
3. Platform defaults (currency, country, timezone, branding seed) are copied.
4. No platform subscription or platform invoice is created.
5. Audit log records the request.
6. The tenant can operate under the default feature package until a superuser assigns another package.

### 3.4 Organisation fields

| Field | Purpose | Rules |
|---|---|---|
| `name` | Display/organisation name | Required, max 200 |
| `slug` | URL-safe identifier | Auto-generated, unique |
| `currency_code` / `symbol` / `locale` | Tenant currency | Seeded from platform settings; editable |
| `country` / `country_code` | Regional defaults | Editable |
| `default_timezone` | Display/event timezone | IANA timezone |
| `org_email` | Public/contact email | Email |
| `org_logo_url` | Tenant logo | URL |
| `email_from_name` | Sender display name | Max 120 |
| `email_reply_to` | Reply-to email | Email |
| `brand_primary_color` | Primary brand colour | Hex `#RRGGBB` |
| `brand_secondary_color` | Accent brand colour | Hex `#RRGGBB` |
| `brand_favicon_url` | Tenant favicon | URL |
| `support_url` | Support link | URL |
| `legal_name` | Legal entity name | Max 200 |
| `custom_domain` | Tenant hostname | Unique; requires verification |
| `domain_verified` | Verification state | Superuser controlled |
| `default_language` | Tenant default language | `en` or `zh-Hant` |
| `tax_rate` | Tax percentage | Decimal; stored, not yet applied to totals |
| `tax_inclusive` | Tax-inclusive pricing flag | Boolean |
| `invoice_prefix` | Booking invoice prefix | Max 12 |
| `invoice_next_number` | Next invoice sequence | Positive integer |
| `platform_fee_percent` | Payout fee | Decimal percentage |
| `payout_cycle` | Payout cadence | weekly/biweekly/monthly |
| `feature_package` | Assigned feature package | FK; blank uses default package |
| `org_phone` | Organisation phone | Max 40 |
| `registered_address` | Registered address | Text; English |
| `registered_address_zh` | Registered address | Text; Traditional Chinese |
| `ird_file_number` | IRD file number | Max 60 |
| `ird_section88` | Section 88 charity flag | Boolean; controls statutory wording |
| `receipt_signatory_name/title` | Receipt signatory | Max 120 each |
| `receipt_prefix` / `receipt_next_number` | Donation receipt sequence | Default `DR` / 1 |
| `tax_receipt_threshold` | Statutory-wording threshold | Decimal; default 100 |
| `donation_receipt_min_amount` | Minimum donation for a receipt | Decimal; 0 = any |
| `auto_email_donation_receipt` | Auto-email receipt | Boolean |
| `receipt_footer_note` | Receipt footer | Text |
| `is_active` | Tenant enabled | Boolean |

---

## 4. Authentication and access

### 4.1 Authentication methods

- Email/password login (JWT)
- Magic link
- Email/WhatsApp OTP
- Password reset
- Organisation invitations
- Active-session tracking for superusers

### 4.2 Route guards

| Guard | Behaviour |
|---|---|
| `ProtectedRoute` | Requires authentication |
| `RoleBasedRoute` | Restricts to platform roles; currently superuser |
| `OrgRoleRoute` | Requires a minimum organisation role |
| `EventsEntry` | Public browse for non-members; workspace for members |
| `GuestAllowedRoute` | Allows guest checkout |

### 4.3 Organisation membership fields

| Field | Rules |
|---|---|
| `role` | `admin` / `staff` / `member` |
| `is_owner` | Only with `role=admin`; one live owner |
| `display_name` | Optional |
| `phone` | Optional |
| `valid_from`, `valid_until` | Membership validity window |
| `is_active`, `removed_at` | Soft-removal lifecycle |

### 4.4 Role rules

- Promoting a Staff/Regular member to Owner upgrades role to `admin` and sets `is_owner=True`.
- Transferring ownership demotes the previous owner to `member` and clears ownership.
- Owner cannot be removed or demoted through normal member actions.
- Superuser cannot own a tenant.
- Invitations may specify role and validity.

---

## 5. Venue management

### 5.1 Venue fields

| Field | Required | Rules |
|---|---|---|
| Name | Yes | Max 200 |
| Description | No | Text |
| Venue type | Yes | indoor/outdoor/both |
| Capacity | No | Integer |
| Address lines, city, state, postal code, country | No | Address fields |
| Contact phone/email | No | Contact details |
| Has reserved seating | Yes | Boolean |
| Organization | System | Current tenant |

### 5.2 Seating layout and category configuration

Venue setup and event seating are deliberately separate:

- **Venue creation** captures the physical venue, the SVG layout and the canvas dimensions in one save. The parser extracts seats, rows and x/y coordinates.
- The venue master is a versioned, reusable geometry snapshot. A new version is created when the layout changes.
- The venue detail page shows seat count, rows, category summary, canvas preview and the uploaded layout.
- **Seat categories and seat-to-category assignment are configured during Event Creation**, in the Seat Categories step. This is intentional: the same venue can be sold with different categories, prices and inventory for different events.
- Categories are not entered during venue creation. The event's category plan holds the category name, colour, price and seat assignments.
- General-admission venues skip the Seat Categories step.

This design means a venue master is reusable and immutable, while event-specific pricing and category composition remain flexible.

### 5.3 Seat fields

| Field | Description |
|---|---|
| `row_label`, `seat_number` | Physical seat identifier |
| `x_coord`, `y_coord` | Canvas coordinates |
| `category` | Seat category and price |
| `is_active` | Seat available for use |
| `is_accessible` | Accessible seat flag |

### 5.4 Seating API

- `GET /venues/<id>/layout/`
- `POST /venues/<id>/layout/upload/`
- `GET/POST /venues/<id>/categories/`
- `POST /venues/<id>/categories/assign/`
- `POST /venues/<id>/categories/clear/`
- `PATCH /seats/<id>/accessibility/`
- `GET /events/<id>/seat-map/`

---

## 6. Event management

### 6.1 Event create/edit fields

The Event wizard writes one Event record plus related sessions and ticket tiers. The table below explains how each field is populated and what it controls.

| Field | Required | How it works / validation |
|---|---|---|
| Organisation | Yes | The tenant that owns the event. It determines data visibility, currency, timezone defaults and which managers can edit the event. It is preselected from the current organisation and cannot be changed after creation. |
| Title | Yes | Public event name. Max 255. Used in listings, tickets, emails and reports. |
| Description | No | Full public description. Rich text/plain text depending on the editor; shown on the event detail page. |
| Short description | No | Listing-card summary. Max 500. Falls back to a truncated description if blank. |
| Event type | Yes | Classification of the event format: `single`, `multi_day`, `recurring`, `virtual` or `hybrid`. It drives display/filtering and expected scheduling; it does not itself create sessions. |
| Category | Yes | Browse/filter taxonomy: concert, sports, theater, conference, workshop, party, dining, festival, exhibition, community, virtual, other. Used on the public landing page and event cards. |
| Event flow | Yes | Selects the commercial pipeline: `ticketed` (per-ticket/seat pricing), `paid_registration` (flat-fee pass) or `free_registration` (RSVP with no payment). The flow changes the checkout steps, tier requirements and whether payment is required. |
| Start date | Yes | Event start in the selected timezone. Must be a valid datetime. |
| End date | Yes | Event end. Must be greater than or equal to start. For single-day events the UI mirrors start. |
| Timezone | Yes | IANA timezone used to display event/session times and to interpret dates. Defaults from tenant/platform settings. |
| Venue | Conditional | Physical venue. Required for reserved-seating events; optional for general admission/virtual events. Selecting a venue opens the master-version picker. |
| Venue master | Conditional | The exact venue geometry version pinned to this event. The event keeps this version for its lifetime; later venue edits do not silently change sold seating. |
| Sessions | Optional | Time slots with start, end and capacity. If no sessions exist, the event uses its main date range and seat inventory. |
| Tiers | Conditional | Ticket categories/prices. Required for ticketed and paid-registration flows; free registration has no paid tiers. Auto-generated General tier may be used for paid registration. |
| Cover image | No | Hero/listing image URL. Shown on event cards and the public detail page. |
| Gallery | No | Additional image URLs for the public detail gallery. Stored as a JSON list. |
| Public event | Yes | When true, the event is eligible for the public landing page and guest checkout. When false, it is treated as private: not shown publicly; only signed-in members/organisation users can access it. |
| Members only | Yes | Restricts viewing/booking to members of the organisation (and eligible paid members). Works with the visibility rules; it does not grant management rights. |
| Minimum membership tier | No | If set, only members at that tier or higher can view/book. Blank means all members are eligible. |
| Donations enabled | Yes | Adds an optional donation field to checkout. Eligible donations can receive an official tax receipt. Free registration cannot add a donation. |
| Donation presets | No | Quick-pick donation amounts; only exposed when `donation_quick_picks` feature is enabled. |
| Donation contact text | No | Instructions/contact copy shown in the donation section; feature-gated. |
| Ask course question | No | When enabled, checkout asks whether the buyer completed an Art of Living course. Stored on Booking. |
| Public page enabled | Yes | When false, the public event page is unavailable even if the event is otherwise public. |
| Duration (minutes) | Yes | Display duration; defaults 120. Does not calculate the end date. |
| Map URL | No | Optional external map link on the public event page. |
| Public FAQs | No | JSON list of FAQ entries for the public page. |
| Bilingual fields | No | `title_zh`, `short_description_zh`, `description_zh`, `faqs_zh`; exposed only when `event_bilingual` feature is enabled. |
| Privacy notice text | No | Optional PDPO checkout notice; shown to buyers. |
| Marketing opt-in enabled | No | When true, checkout displays a marketing consent checkbox. |
| Booking window | No | Optional start/end datetimes that limit when bookings are accepted. Blank means bookings follow the event status and ticket sale window. |
| Min/max tickets per order | Yes | Checkout quantity limits. Max must be ≥ min. Enforced server-side; used for group bookings. |
| Cancellation policy | No | Reusable structured policy (refund tiers/fees). Snapshotted onto each booking. If absent, free-text terms may still be shown. |
| Refundable until | No | Manually configured latest refund datetime. **Current limitation:** the field is stored and editable, but refund calculation is driven by the cancellation policy; this field is not yet enforced by the refund engine. |
| Ticket format | Yes | `pdf`, `png` or `both`. Controls ticket delivery format. |
| Combine tickets | Yes | When true, all tickets for a booking are combined into one file. |
| Tickets per page | Yes | Number of tickets per page for combined output. Positive integer. |
| Status | Yes | Event lifecycle state. See Section 6.5 for the meaning of each status. |
| Cancellation reason | Conditional | Displayed and required when status is `cancelled`. Stored on the event for staff records and customer communication. |

### 6.2 Date validation and event completion

- `end_date` cannot precede `start_date`.
- Single-day events set end equal to start.
- The booking window, when provided, must be internally consistent and aligned with the event dates.
- The Celery task `update_completed_events` periodically changes non-terminal events whose end date has passed to `completed`.
- Until that task runs, `Event.get_effective_status()` returns `completed` for display, so the UI does not show a stale status.
- Selecting status `cancelled` reveals a required **Cancellation reason** field. The reason is stored on the event and should be used in customer/staff communication.
- Cancelled events are not available for new bookings and are removed from the public event query.
- The `refundable_until` field is currently informational; refund decisions use the attached cancellation policy, not that date.

### 6.3 Venue handoff

If no venue exists:

1. User is sent to Venue Creation.
2. Venue and SVG layout are saved in one page.
3. Venue master is created.
4. User returns to the Event wizard at the same step.
5. The new venue is auto-selected.
6. Reserved-seat venues continue to Seat Categories.
7. General-admission venues skip to the remaining Details.

### 6.4 Publish rules

- Publishing freezes the venue plan snapshot.
- Published events cannot silently change their seating plan.
- Duplicate publish paths are avoided; publishing is idempotent.
- A venue with reserved seating must have a valid layout and priced categories.

### 6.5 Event statuses

| Status | Meaning | Publicly visible / bookable? |
|---|---|---|
| `draft` | Work in progress; not ready for sale. | No |
| `active` | Legacy/manual on-sale state. The event can be bookable if public. | Yes, if `is_public` and not gated |
| `published` | Canonical state produced by the publish workflow. Venue plan is frozen. | Yes, if `is_public` and not gated |
| `sold_out` | Inventory is exhausted. | Visible, but no further sales |
| `completed` | Event end date has passed; terminal. | No new bookings; historical reporting |
| `cancelled` | Event will not take place; terminal. Cancellation reason should be captured. | No |
| `postponed` | Event is delayed; new date may be communicated separately. | Depends on updated schedule/status |

**Active vs Published:** both can make an event visible and bookable. `published` is the normal commercial state set by the publish flow and freezes the venue plan. `active` is retained for legacy/manual on-sale events; it does not perform the publish freeze. New events should use `published` for go-live. The distinction is operational, not a different booking engine.

---

## 7. Ticket tiers and sessions

### 7.1 Session fields

| Field | How it works |
|---|---|
| Start time | Required. Defines the slot's start; used in checkout and the schedule display. |
| End time | Required. Must be after start. |
| Capacity | Positive integer. Maximum committed + held seats for the slot. |
| Booked | System-maintained count of committed seats. Incremented on successful booking/payment fulfillment and decremented on cancellation. |
| Reserved | System-maintained count of in-flight inventory holds. Held seats reduce availability until the hold expires or payment completes. |
| Active | When false, the session is hidden from checkout and cannot be selected. |
| Remaining capacity | Derived as `capacity − booked − reserved`; never negative. |

Sessions are optional. Events without sessions use the event's overall date range and tier/seat inventory.

### 7.2 Ticket tier fields

| Field | Rules |
|---|---|
| Name | Required |
| Price | Decimal ≥ 0 |
| Quantity total | Positive integer |
| Quantity sold/reserved | System |
| Ticket type | ga/reserved etc. |
| Sale start/end | Optional windows |
| Min/max per order | Integers |

### 7.3 Availability

`available = total - sold - reserved`, never below zero.

---

## 8. Booking and checkout

### 8.1 Booking flows

1. **Ticketed** — select event, session, tickets/seats, attendees, review, pay.
2. **Free registration** — select event, entries, attendee names; auto-confirmed.
3. **Paid registration** — flat-fee pass; payment required.

### 8.2 Checkout fields

| Field | Required | Rules |
|---|---|---|
| Event | Yes | Visible/bookable to actor |
| Session/slot | Conditional | Capacity checked |
| Tickets/seats | Conditional | Priced server-side |
| Quantity | Yes | Min/max per order |
| Customer name | Yes | Max 255 |
| Customer email | Yes | Email |
| Customer phone | Yes | Max 20 |
| WhatsApp | No | Max 20 |
| Notes | No | Text |
| Discount code | No | Validated server-side |
| Donation amount | No | Only when event enables donations |
| Attendee details | Conditional | Per ticket/entry |
| Privacy accepted | Conditional | Required when a privacy notice is configured |
| Marketing opt-in | Optional | Shown when event enables marketing opt-in |
| Course answer | Optional | Asked when event enables the Art of Living course question |
| Payment method | Conditional | Gateway or offline |

### 8.3 Booking fields

| Field | Description |
|---|---|
| `booking_reference` | Unique code |
| `status` | pending/processing/paid/confirmed/completed/cancelled/refunded |
| `total_amount` | Ticket subtotal + donation, before discount |
| `discount_applied` | Discount amount |
| `discount_code` | Applied code |
| `donation_amount` | Optional donation |
| `donation_currency_code` | Currency snapshot |
| `donation_tax_receipt_number` | Issued receipt number |
| `donation_tax_receipt_issued_at` | Receipt timestamp |
| `refund_amount` | Refunded amount |
| `invoice_number` | Per-tenant sequence |
| `paid_at` | Payment completion |
| `metadata` | Booking source/tickets/attendees |
| `cancellation_policy_snapshot` | Frozen policy |
| `privacy_accepted` | PDPO/privacy acceptance at checkout |
| `marketing_opt_in` | Marketing consent |
| `course_answer` | Art of Living course answer (`yes`/`no`/blank) |
| `reminder_2d_sent_at`, `reminder_day_sent_at` | Reminder delivery timestamps |

### 8.4 Server-side pricing rules

Pricing is never trusted from the browser:

1. The server reads the selected tier IDs, quantities and/or seat IDs from the request.
2. `compute_booking_subtotal` resolves the current tier price or seat category price and sums the authoritative amount.
3. Any client-supplied `total_amount` is overwritten.
4. Discount validation runs against the ticket subtotal (not the donation). Percentage or fixed discounts are capped by the discount rules.
5. A donation is added only when the event has `donations_enabled`, the amount is non-negative and the flow is not free registration.
6. `total_amount = ticket_subtotal + donation`; `discount_applied` is stored separately.
7. The booking starts `pending` for paid flows and is fulfilled only after verified payment.
8. Inventory limits (tier/session/seat) are checked inside a transaction before the booking is accepted.

This prevents price tampering, discount stacking beyond configured limits, and donation bypass.

### 8.5 Checkout consent and reminders

Checkout can show:

- a privacy notice and required acceptance checkbox (PDPO)
- an optional marketing opt-in checkbox
- the course question when enabled by the event
- reminder emails; `reminder_2d_sent_at` and `reminder_day_sent_at` prevent duplicate sends

### 8.6 Booking actions

- View details and invoice
- View e-ticket / all tickets
- Confirm payment
- Cancel booking/tickets
- Refund
- Transfer individual active ticket
- Download QR

---

## 9. Payments

### 9.1 Ticket payment fields

| Field | Description |
|---|---|
| Gateway | Stripe / Razorpay |
| Status | created/pending/paid/failed/expired/refunded/partially_refunded |
| Amount / currency | Major units |
| Provider order/payment IDs | Gateway references |
| Customer snapshot | Name/email/phone |
| Items | Ticket line items |
| Checkout | Client secret/config |
| Hold expiry | Inventory hold deadline |
| Paid at | Capture time |

### 9.2 Payment flows

- Checkout creates payment + inventory hold.
- Provider returns order/intent/client config.
- Webhook verifies signature and is idempotent.
- Fulfillment creates/updates booking and tickets.
- Refunds update payment/refund records and booking amounts.

### 9.3 Tenant gateway credentials

| Field | Description |
|---|---|
| Gateway | Stripe/Razorpay |
| Mode | test/live |
| Key ID | Public key/merchant ID |
| Key secret | Encrypted at rest |
| Webhook secret | Encrypted at rest |
| Active | Use for this tenant |
| Verified at | Last configuration verification |

Per-tenant webhook URL: `/api/payments/webhook/<org_id>/<gateway>/`.

---

## 10. Tickets, QR and check-in

### 10.1 Ticket fields and status changes

| Field | How it is populated / used |
|---|---|
| `unique_code` | Generated at ticket issue with a `TIX`/`REG` prefix and random suffix. Regenerated on accepted transfer so the previous holder's code is invalidated. |
| `qr_code` | Rendered from the signed ticket payload after issue. Regenerated when the ticket code is regenerated. |
| `status` | `active` → `used` on check-in; `cancelled`/`refunded` on cancellation/refund; `expired` for elapsed inventory. See below. |
| `attendee_name/email/phone` | Captured at checkout or attendee entry. Updated when a transfer is accepted. |
| `seat` | Reserved-seat reference for reserved-seating events. |
| `tier` | Ticket tier used for price/category. |
| `venue_plan` | Venue plan pinned when the ticket was issued. |
| `check_in_time` | First successful check-in timestamp. |
| `net_paid_amount` | Prorated amount paid after discounts; basis for refunds. |
| `cancelled_at`, `cancelled_reason` | Set by cancellation/refund operations. |
| `refund_amount`, `refund_percent_applied` | Refund result from the cancellation policy. |

**Status update mechanism:** there is no scheduled task that transitions individual ticket statuses. Tickets change status through explicit actions: check-in, cancellation, refund, or expiry handling. The scheduled task `update_completed_events` updates **events**, not ticket rows.

### 10.2 Check-in

- QR verification endpoint.
- Manual code verification.
- Batch and offline sync.
- Scanner history.
- Duplicate scan protection.
- Check-in logs capture:

| Field | Meaning |
|---|---|
| `ticket` | Scanned ticket |
| `event` / `session` | Event and slot |
| `scanner_user` | Admin/staff user who performed the scan |
| `scanner_device_id` | Device identifier |
| `scanner_ip` | Source IP |
| `scanned_at` | Scan timestamp |
| `status` | `success`, duplicate, invalid, etc. |
| `latitude`, `longitude` | Optional device location |
| `is_offline`, `synced_at` | Offline-sync tracking |
| `client_scan_id` | Idempotency key for offline scans |
| `notes` | Operator notes |

The scanner user is the authenticated admin/staff account, not the attendee. Offline scans are accepted locally and reconciled later by `client_scan_id`.

### 10.3 Ticket formats

- PDF
- PNG
- Combined PDF
- Configurable tickets per page

---

## 11. Memberships

### 11.1 Membership tier fields

| Field | Rules |
|---|---|
| Name | Human-readable plan name shown to members. |
| Slug | URL/API-safe unique identifier within the organisation; used in links and references. |
| Description | Text |
| Price | Decimal |
| Currency | Snapshot |
| Billing period | one-time/monthly/quarterly/yearly |
| Duration days | Derived/entered |
| Max members | Optional |
| Benefits | JSON/list |
| Active/public | Boolean |

### 11.2 Membership fields

| Field | Description |
|---|---|
| User | Member |
| Tier | Purchased tier |
| Status | pending_offline/pending/active/expired/cancelled/refunded |
| Valid from/until | Validity window |
| Price paid | Snapshot |
| Payment reference | Gateway/offline |
| Auto renew | Boolean |
| Organization | Tenant |

### 11.3 Membership operations

- Purchase checkout
- Pending offline review
- Bulk CSV upload
- Activate/reject offline
- Renew/cancel
- Dependent/family members
- Member-only event access
- Tier-gated events

---

## 12. Donations and tax receipts

### 12.1 Enablement

- Per-event `donations_enabled`.
- Checkout shows an optional donation field/presets when enabled.
- Donation is added to booking total; discounts do not apply to donations.
- Donation presets and contact copy require the `donation_quick_picks` feature.

### 12.2 Receipt eligibility

A donation can receive a receipt when:

- donation amount is greater than zero
- donation currency is HKD
- booking status is paid/confirmed/completed
- booking is not cancelled/refunded
- donation is at least the organisation's `donation_receipt_min_amount` (0 = any amount)

The organisation's `ird_section88` flag and `tax_receipt_threshold` control whether the statutory tax-deduction wording is printed. The threshold is configurable per tenant and defaults to HKD 100; it is not the same as the old fixed HKD 2,000 rule.

### 12.3 Receipt fields

- Receipt number: `<receipt_prefix>-<sequence>` from organisation settings
- Issued timestamp
- Organisation legal name, registered address, IRD file number
- Section 88 status/statutory wording when applicable
- Signatory name/title and footer note
- Donor, event, donation amount
- Bilingual labels where configured
- PDF download and optional auto-email

### 12.4 Annual statement

- `GET /api/donations/annual-statement/?organization_id=&year=`
- Lists paid donations for the year
- Totals and tax-eligible portion
- PDF output

### 12.5 Refund handling

- Cancelled/refunded bookings are not receipt-eligible.
- Already-issued receipt numbers are retained for audit.
- Donation refunds follow the booking refund amount.

---

## 13. Discounts and cancellation policies

### 13.1 Discount fields

| Field | Rules |
|---|---|
| Code | Unique per organisation |
| Type | percentage/fixed |
| Value | Positive |
| Min order amount | Optional |
| Max discount | Optional |
| Usage limit | Optional |
| Used count | System |
| Valid from/until | Optional |
| Active | Boolean |

### 13.2 Discount validation

- Active, within validity
- Minimum order amount satisfied
- Usage limit not exhausted
- Event/user restrictions
- Applied to ticket subtotal only

### 13.3 Cancellation policy fields

- Name/description
- Refund tiers (days before event, percentage)
- Cancellation fee
- Free-text terms
- Snapshot on booking

---

## 14. Reporting and analytics

### 14.1 Reports

Report endpoint: `GET /api/reports/?organization_id=&start=&end=`

Tabs:

| Report | Metrics |
|---|---|
| Overview | Gross/net revenue, refunds, discounts, tickets, attendance, donations, pending, check-ins, daily sales |
| Sales | Revenue by event |
| Attendance | Issued vs checked in, rate |
| Memberships | Active, revenue, expiring, by tier |
| Donations | Total, eligible, receipts, by event |
| Pending payments | Pending bookings, discount usage |

CSV export is available per tab. Annual donation statement PDF is available from Donations.

### 14.2 Analytics

- Dashboard stats
- Revenue trends
- Top events
- Ticket/attendance metrics
- Organisation filter for superusers

### 14.3 Additional exports and Patron outreach

- **Donation receipt export:** `GET /api/donations/receipts/export/` — CSV of issued donation receipts for an organisation/year.
- **Patrons export:** `GET /api/bookings/patrons-export/` — CSV of patron contacts; requires the `patrons_tracking` feature.
- **Export pack:** `GET /api/reports/export-pack/` — ZIP of report CSVs/attachments; requires `advanced_exports`.
- **Patron contact:** `POST /api/bookings/<id>/patron-contact/` records who contacted a patron and when; one PatronContact per booking.

---

## 15. Payouts, transfers and audit

### 15.1 Payouts

| Field | Description |
|---|---|
| Organisation | Tenant |
| Period start/end | Settlement period |
| Gross sales | Paid bookings |
| Refunds | Refunded amount |
| Platform fee | Gross-refunds × fee % |
| Net payout | Gross − refunds − fee |
| Status | draft/approved/paid/cancelled |
| Paid at | Settlement timestamp |
| Reference | Unique payout code |

- Generate: `POST /api/payouts/`
- List: `GET /api/payouts/`
- Mark paid: `POST /api/payouts/<id>/mark-paid/`
- No bank transfer is executed.

### 15.2 Ticket transfers

| Field | Description |
|---|---|
| Ticket | Source ticket |
| From user | Current owner |
| To email | Recipient email; acceptance requires the signed-in user's email to match |
| Token | Unique accept token (UUID) |
| Status | pending/accepted/cancelled/expired |
| Expires at | Acceptance deadline |
| Accepted by/at | Recipient and timestamp |
| Created at | Request timestamp |

On acceptance:

1. The recipient must be signed in with the matching email.
2. The ticket must still be `active`.
3. Attendee name/email are updated to the recipient.
4. The ticket `unique_code` is regenerated.
5. The QR payload is regenerated from the new code, invalidating the previous QR.
6. The transfer becomes `accepted`.

The transfer token is returned by the API and must be delivered to the recipient. The current implementation does **not** send the transfer email automatically; the sender shares the accept link/token.

### 15.3 Audit log

- Actor, organisation, method, path, status, IP, timestamp
- Captured automatically for mutating API requests
- Tenant admins see managed orgs; superuser sees all

---

## 16. Feature entitlements

### 16.1 Feature definitions

| Field | Description |
|---|---|
| `key` | Stable feature key used in code, e.g. `public_event_page` |
| `name` | Display name |
| `description` | What the feature enables |
| `category` | Grouping in admin UI |
| `default_enabled` | Default state for new definitions |
| `is_active` | Whether the definition is available |

### 16.2 Feature packages

| Field | Description |
|---|---|
| `code` | Unique package code |
| `name` | Display name |
| `description` | Package summary |
| `feature_keys` | JSON list of feature keys |
| `is_default` | Package used when no package is assigned |
| `is_active` | Whether assignable |

### 16.3 Organisation overrides

| Field | Description |
|---|---|
| `organization` | Tenant |
| `feature` | Feature definition |
| `enabled` | Explicit enable/disable |
| `config` | Optional JSON configuration |
| `updated_by/at` | Audit fields |

`Organization.feature_package` selects the package. Effective features are resolved by `services/features.py`:

1. Start with the assigned package, or the default package.
2. Apply per-organisation overrides.
3. Ignore inactive definitions.

### 16.4 Admin UI and API

- Superuser UI: `/app/features`
- `GET/POST /api/platform/features/`
- `GET/POST /api/platform/feature-packages/`
- `GET/POST /api/platform/organization-features/`
- Tenant effective features: `GET /api/features/mine/`

### 16.5 Enforcement

- Public event page requires `public_event_page`.
- Donation presets/contact text require `donation_quick_picks`.
- Bilingual event content requires `event_bilingual`.
- Additional feature keys may gate reports/analytics as code evolves.

### 16.6 Billing status

There is **no platform subscription, trial, plan price or platform invoice** in the current product. Migration `0060_remove_platform_licensing` removed those models. Feature packages are assigned and overridden by superusers; they are not billed through the application.

## 17. Branding and localisation

### 17.1 Branding fields

| Field | How it works |
|---|---|
| `org_logo_url` | Tenant logo URL. Used by the app shell/Logo when present; falls back to the TicketVault logo. |
| `brand_favicon_url` | Tenant favicon URL. Applied to the document icon at runtime. |
| `brand_primary_color` | Hex colour applied to CSS variables and key MUI controls. |
| `brand_secondary_color` | Accent colour applied to secondary controls/CSS variables. |
| `email_from_name` | Sender display name for tenant email. |
| `email_reply_to` | Reply-to address stored on the organisation. |
| `support_url` | Tenant support link. |
| `legal_name` | Legal entity name for records/compliance. |
| `custom_domain` | Verified tenant hostname. Requires DNS/proxy setup and superuser verification. |
| `domain_verified` | Whether the hostname may resolve to the tenant via middleware. |

**Current limitation:** logo and favicon are URL fields. There is no tenant asset-upload endpoint or tenant-folder storage convention yet. A future implementation should store files under a tenant-specific prefix (for example `tenants/<slug>/logo_<timestamp>.<ext>`) and expose an authenticated upload endpoint with content-type/size validation.

### 17.2 Localisation/commerce

- Tenant currency/locale/timezone override platform display settings
- Default language applied when user has no saved preference
- Per-tenant tax rate/inclusive flag stored
- Per-tenant invoice prefix and sequence
- English and Traditional Chinese UI bundles

Tax values are stored but not yet applied to booking totals.

---

## 18. Settings

### 18.1 Platform settings

- Currency, locale, country, timezone
- Organisation name/email/logo/from name
- Online payments enabled flag
- Global payment provider keys via environment

### 18.2 Tenant settings

- Organisation profile
- Branding
- Payment gateway credentials
- Subscription
- Team/members
- Venue/event defaults
- Cancellation policies
- Discounts

---

## 19. API endpoint catalogue

### Authentication

| Method | Path |
|---|---|
| POST | `/api/auth/request-magic-link/` |
| POST | `/api/auth/verify-magic-link/` |
| POST | `/api/auth/request-otp/` |
| POST | `/api/auth/verify-otp/` |
| POST | `/api/organizations/<org_id>/invite/` |

### Core resources

| Method | Path |
|---|---|
| GET/POST | `/api/organizations/` |
| GET | `/api/organizations/mine/` |
| GET/POST | `/api/events/` |
| GET/POST | `/api/venues/` |
| GET/POST | `/api/bookings/` |
| GET/POST | `/api/discounts/` |
| GET/POST | `/api/memberships/` |
| GET/POST | `/api/membership-tiers/` |
| GET/POST | `/api/payouts/` |
| GET | `/api/audit-logs/` |
| GET | `/api/reports/` |
| GET | `/api/analytics/` |
| GET | `/api/dashboard/stats/` |

### Payments and check-in

| Method | Path |
|---|---|
| POST | `/api/payments/checkout/` |
| POST | `/api/payments/verify/` |
| GET | `/api/payments/<id>/status/` |
| POST | `/api/payments/<id>/refund/` |
| POST | `/api/webhooks/razorpay/` |
| POST | `/api/webhooks/stripe/` |
| POST | `/api/payments/webhook/<org_id>/<gateway>/` |
| POST | `/api/checkin/verify/` |
| POST | `/api/checkin/` |
| POST | `/api/checkin/offline-sync/` |

### Seating and layouts

| Method | Path |
|---|---|
| GET | `/api/events/<id>/seat-map/` |
| GET/POST | `/api/venues/<id>/layout/` |
| POST | `/api/venues/<id>/layout/upload/` |
| PATCH | `/api/seats/<id>/accessibility/` |

### Donations

| Method | Path |
|---|---|
| GET | `/api/bookings/<id>/donation-tax-receipt/` |
| GET | `/api/donations/annual-statement/` |
| GET | `/api/donations/receipts/export/` |
| POST | `/api/bookings/<id>/patron-contact/` |
| GET | `/api/bookings/patrons-export/` |
| GET | `/api/reports/export-pack/` |

### Feature entitlements

| Method | Path |
|---|---|
| GET/POST | `/api/platform/features/` |
| GET/POST | `/api/platform/feature-packages/` |
| GET/POST | `/api/platform/organization-features/` |
| GET | `/api/features/mine/` |

### Tenant commerce configuration

| Method | Path |
|---|---|
| GET/PUT | `/api/organizations/payment-config/` |
| POST | `/api/organizations/<id>/verify-domain/` |
| POST | `/api/tickets/<id>/transfer/` |
| POST | `/api/ticket-transfers/<token>/accept/` |

---

## 20. Status models

### Booking

`pending → processing → paid → confirmed → completed`  
`cancelled` / `refunded` are terminal outcomes.

### Ticket

`active → used`  
`cancelled` / `refunded` / `expired` are terminal.

### Event

`draft → active/published → sold_out/completed`  
`cancelled` / `postponed`.

### Subscription

`trialing → active → past_due → suspended`  
`cancelled` / `expired`.

### Payout

`draft → approved → paid`  
`cancelled`.

---

## 21. Validation summary

- All tenant-scoped queries must use the canonical visibility helpers.
- Only superusers see cross-tenant data.
- Event end must not precede start.
- Booking totals are recomputed server-side.
- Discounts apply only to ticket subtotal.
- Donations require event enablement and cannot be negative.
- Free registration cannot include a donation.
- Ticket transfer requires an active ticket and matching recipient email.
- Tax receipt requires a positive HKD donation at or above the organisation receipt minimum, paid status, and IRD/Section 88 configuration for statutory wording.
- Plan limits return 402 when exceeded.
- Venue layouts require valid seats/categories for reserved seating.
- Payment webhooks require valid signatures and are idempotent.

---

## 22. Computed and API-only fields

These fields are returned by serializers/reporting APIs but are not stored as model columns.

### Organisation

| Field | Meaning |
|---|---|
| `owner_username` | Live owner's username |
| `role` | Caller's membership role in the organisation |
| `is_owner` | Whether the caller is the live owner |

### Booking

| Field | Meaning |
|---|---|
| `event_title`, `event_id` | Event summary |
| `ticket_count` | Issued ticket count |
| `checked_in_count` | Used ticket count |
| `net_amount` | Total minus discount |
| `total_display` | Formatted total |
| `formatted_date` | Formatted event date |
| `donation_tax_eligible` | Whether donation qualifies for an HK receipt |
| `tickets` | Nested ticket list |

### Ticket

| Field | Meaning |
|---|---|
| `tier_name`, `price` | Tier summary |
| `event_title`, `booking_reference` | Context |
| `is_checked_in` | Status shortcut |
| `qr_code` | QR payload when active |

### Feature entitlements

| Field | Meaning |
|---|---|
| `package` | Assigned feature package (code/name) |
| `features` | Effective enabled feature keys |
| `definitions` | All active definitions with enabled state |

### Tenant payment configuration

| Field | Meaning |
|---|---|
| `webhook_url` | Tenant-specific payment webhook path |
| `has_key_secret`, `has_webhook_secret` | Whether secrets are stored (never returned) |

### Reports

| Metric group | Fields |
|---|---|
| Summary | bookings, tickets_sold, attended, attendance_rate, gross_revenue, discounts, refunds, donations, net_revenue, pending_bookings, checkins |
| Sales | event, bookings, gross, discounts, refunds, donations, net |
| Attendance | event, issued, used, rate |
| Memberships | active, expiring_30d, revenue, by_tier |
| Donations | event, total, donations, eligible, receipts |
| Pending | reference, customer, event, status, amount, created_at |

## Appendix A — Complete field data dictionary

This appendix is generated from the current Django model metadata. It lists every concrete field, its type, nullability, default and constraints. `auto` means the value is generated by the application, a callable default, or an automatic timestamp. `indexed` means the column has a database index. Computed/API-only fields are listed in Section 22.

### Organization

Table: `ticket_bookings_organization`

| Field | Type | Null | Default | Rules / Notes |
|---|---|---|---|---|
| `id` | UUIDField | no | auto | max 32; unique |
| `name` | CharField | no | — | max 200 |
| `slug` | SlugField | no | — | max 200; unique; indexed |
| `currency_code` | CharField | no | `INR` | max 3 |
| `currency_symbol` | CharField | no | `₹` | max 8 |
| `currency_locale` | CharField | no | `en-IN` | max 10 |
| `country` | CharField | no | `India` | max 100 |
| `country_code` | CharField | no | `IN` | max 3 |
| `default_timezone` | CharField | no | `Asia/Kolkata` | max 50 |
| `org_email` | CharField | no | `` | max 254 |
| `org_logo_url` | CharField | no | `` | max 200 |
| `email_from_name` | CharField | no | `` | max 120 |
| `email_reply_to` | CharField | no | `` | max 254 |
| `brand_primary_color` | CharField | no | `#333333` | max 7 |
| `brand_secondary_color` | CharField | no | `#FF2A2A` | max 7 |
| `brand_favicon_url` | CharField | no | `` | max 200 |
| `support_url` | CharField | no | `` | max 200 |
| `legal_name` | CharField | no | `` | max 200 |
| `legal_name_zh` | CharField | no | `` | max 200 |
| `custom_domain` | CharField | yes | — | max 255; unique; Verified hostname, e.g. tickets.example.com |
| `domain_verified` | BooleanField | no | `False` | — |
| `default_language` | CharField | no | `en` | max 10; choices: en, zh-Hant |
| `tax_rate` | DecimalField | no | `0` | Percentage, e.g. 5.000 for 5%. |
| `tax_inclusive` | BooleanField | no | `False` | — |
| `invoice_prefix` | CharField | no | `INV` | max 12 |
| `invoice_next_number` | PositiveIntegerField | no | `1` | — |
| `platform_fee_percent` | DecimalField | no | `5` | Platform fee retained from gross sales. |
| `registered_address` | TextField | no | `` | — |
| `registered_address_zh` | TextField | no | `` | — |
| `org_phone` | CharField | no | `` | max 40 |
| `ird_file_number` | CharField | no | `` | max 60 |
| `ird_section88` | BooleanField | no | `False` | Confirmed by the treasurer: entity is a Section 88 charity. |
| `receipt_signatory_name` | CharField | no | `` | max 120 |
| `receipt_signatory_title` | CharField | no | `` | max 120 |
| `receipt_prefix` | CharField | no | `DR` | max 12 |
| `receipt_next_number` | PositiveIntegerField | no | `1` | — |
| `tax_receipt_threshold` | DecimalField | no | `100` | Donation amount at/above which the statutory tax wording applies. |
| `donation_receipt_min_amount` | DecimalField | no | `0` | Minimum donation for which a receipt is issued (0 = any donation). |
| `auto_email_donation_receipt` | BooleanField | no | `True` | — |
| `receipt_footer_note` | TextField | no | `` | — |
| `payout_cycle` | CharField | no | `monthly` | max 20; choices: weekly, biweekly, monthly |
| `is_active` | BooleanField | no | `True` | — |
| `feature_package` | FK → FeaturePackage | yes | — | indexed |
| `created_at` | DateTimeField | no | — | — |
| `updated_at` | DateTimeField | no | — | — |

### OrganizationMembership

Table: `ticket_bookings_organizationmembership`

| Field | Type | Null | Default | Rules / Notes |
|---|---|---|---|---|
| `id` | UUIDField | no | auto | max 32; unique |
| `organization` | FK → Organization | no | — | indexed |
| `user` | FK → User | no | — | indexed |
| `role` | CharField | no | `member` | max 20; choices: owner, admin, staff, member |
| `is_owner` | BooleanField | no | `False` | indexed; True if this Admin-level member is the organization owner. At most one live owner per organization. |
| `display_name` | CharField | no | — | max 200 |
| `phone` | CharField | no | — | max 20 |
| `joined_at` | DateTimeField | no | — | — |
| `valid_from` | DateTimeField | no | auto | — |
| `valid_until` | DateTimeField | yes | — | Leave blank for indefinite/lifetime membership. |
| `is_active` | BooleanField | no | `True` | Manual override to disable access without deleting the row. |
| `removed_at` | DateTimeField | yes | — | Set when the member was removed. NULL = never removed. |

### OrganizationInvite

Table: `ticket_bookings_organizationinvite`

| Field | Type | Null | Default | Rules / Notes |
|---|---|---|---|---|
| `id` | UUIDField | no | auto | max 32; unique |
| `organization` | FK → Organization | no | — | indexed |
| `email` | CharField | no | — | max 254 |
| `role` | CharField | no | `member` | max 20; choices: owner, admin, staff, member |
| `invited_by` | FK → User | yes | — | indexed |
| `token` | CharField | no | — | max 64; unique; indexed |
| `expires_at` | DateTimeField | no | — | — |
| `accepted_at` | DateTimeField | yes | — | — |
| `created_at` | DateTimeField | no | — | — |
| `valid_from` | DateTimeField | no | auto | — |
| `valid_until` | DateTimeField | yes | — | Membership expiry applied when the invite is accepted. |

### OrganizationContact

Table: `ticket_bookings_organizationcontact`

| Field | Type | Null | Default | Rules / Notes |
|---|---|---|---|---|
| `id` | UUIDField | no | auto | max 32; unique |
| `organization` | FK → Organization | no | — | indexed |
| `user` | FK → User | yes | — | indexed |
| `email` | CharField | no | — | max 254 |
| `name` | CharField | no | — | max 200 |
| `phone` | CharField | no | — | max 20 |
| `first_seen_at` | DateTimeField | no | — | — |
| `unsubscribed` | BooleanField | no | `False` | — |

### OrganizationMembershipEvent

Table: `ticket_bookings_organizationmembershipevent`

| Field | Type | Null | Default | Rules / Notes |
|---|---|---|---|---|
| `id` | UUIDField | no | auto | max 32; unique |
| `organization` | FK → Organization | no | — | indexed |
| `membership` | FK → OrganizationMembership | yes | — | indexed |
| `user` | FK → User | yes | — | indexed |
| `event_type` | CharField | no | — | max 32; choices: invited, accepted, added, role_changed, owner_assigned, owner_transferred, validity_changed, deactivated, reactivated, removed |
| `actor` | FK → User | yes | — | indexed; Who performed the action (NULL = system / self-service). |
| `before` | JSONField | no | auto | — |
| `after` | JSONField | no | auto | — |
| `at` | DateTimeField | no | — | — |

### Payment

Table: `ticket_bookings_payment`

| Field | Type | Null | Default | Rules / Notes |
|---|---|---|---|---|
| `id` | UUIDField | no | auto | max 32; unique |
| `organization` | FK → Organization | no | — | indexed |
| `event` | FK → Event | no | — | indexed |
| `booking` | FK → Booking | yes | — | indexed |
| `gateway` | CharField | no | — | max 16; choices: razorpay, stripe |
| `status` | CharField | no | `created` | max 24; choices: created, pending, paid, failed, expired, refunded, partially_refunded; indexed |
| `provider_order_id` | CharField | yes | — | max 128; unique; indexed |
| `provider_payment_id` | CharField | yes | — | max 128; indexed |
| `currency` | CharField | no | — | max 8 |
| `amount` | DecimalField | no | — | — |
| `discount_applied` | DecimalField | no | `0` | — |
| `discount_code` | CharField | no | `` | max 64 |
| `amount_captured` | DecimalField | no | `0` | — |
| `amount_refunded` | DecimalField | no | `0` | — |
| `customer_name` | CharField | no | — | max 255 |
| `customer_email` | CharField | no | — | max 254 |
| `customer_phone` | CharField | no | `` | max 32 |
| `whatsapp_number` | CharField | no | `` | max 32 |
| `items` | JSONField | no | auto | — |
| `checkout` | JSONField | no | auto | — |
| `hold_expires_at` | DateTimeField | yes | — | — |
| `paid_at` | DateTimeField | yes | — | — |
| `created_at` | DateTimeField | no | — | — |
| `updated_at` | DateTimeField | no | — | — |

### PaymentRefund

Table: `ticket_bookings_paymentrefund`

| Field | Type | Null | Default | Rules / Notes |
|---|---|---|---|---|
| `id` | UUIDField | no | auto | max 32; unique |
| `payment` | FK → Payment | no | — | indexed |
| `provider_refund_id` | CharField | yes | — | max 128; unique |
| `amount` | DecimalField | no | — | — |
| `reason` | CharField | no | `` | max 255 |
| `status` | CharField | no | `pending` | max 24 |
| `raw` | JSONField | no | auto | — |
| `created_at` | DateTimeField | no | — | — |

### WebhookEvent

Table: `ticket_bookings_webhookevent`

| Field | Type | Null | Default | Rules / Notes |
|---|---|---|---|---|
| `id` | UUIDField | no | auto | max 32; unique |
| `gateway` | CharField | no | — | max 16; choices: razorpay, stripe |
| `provider_event_id` | CharField | no | — | max 191 |
| `event_type` | CharField | no | — | max 64 |
| `payment` | FK → Payment | yes | — | indexed |
| `action` | CharField | no | `` | max 32 |
| `raw` | JSONField | no | auto | — |
| `created_at` | DateTimeField | no | — | — |

### InventoryHold

Table: `ticket_bookings_inventoryhold`

| Field | Type | Null | Default | Rules / Notes |
|---|---|---|---|---|
| `id` | UUIDField | no | auto | max 32; unique |
| `payment` | FK → Payment | no | — | indexed |
| `tier` | FK → TicketTier | yes | — | indexed |
| `session` | FK → Session | yes | — | indexed |
| `quantity` | PositiveIntegerField | no | — | — |
| `status` | CharField | no | `active` | max 16; choices: active, committed, released |
| `created_at` | DateTimeField | no | — | — |
| `released_at` | DateTimeField | yes | — | — |

### OrganizationPaymentConfig

Table: `ticket_bookings_organizationpaymentconfig`

| Field | Type | Null | Default | Rules / Notes |
|---|---|---|---|---|
| `id` | UUIDField | no | auto | max 32; unique |
| `organization` | FK → Organization | no | — | unique; indexed |
| `gateway` | CharField | no | `razorpay` | max 16; choices: razorpay, stripe |
| `mode` | CharField | no | `test` | max 10; choices: test, live |
| `key_id` | CharField | no | `` | max 191 |
| `key_secret_encrypted` | TextField | no | `` | — |
| `webhook_secret_encrypted` | TextField | no | `` | — |
| `is_active` | BooleanField | no | `False` | — |
| `verified_at` | DateTimeField | yes | — | — |
| `created_at` | DateTimeField | no | — | — |
| `updated_at` | DateTimeField | no | — | — |

### UserProfile

Table: `ticket_bookings_userprofile`

| Field | Type | Null | Default | Rules / Notes |
|---|---|---|---|---|
| `id` | UUIDField | no | auto | max 32; unique |
| `user` | FK → User | no | — | unique; indexed |
| `email` | CharField | no | — | max 254; unique |
| `phone` | CharField | no | — | max 20 |
| `whatsapp_number` | CharField | no | — | max 20 |
| `address` | TextField | no | — | — |
| `city` | CharField | no | — | max 100 |
| `state` | CharField | no | — | max 100 |
| `country` | CharField | no | `India` | max 100 |
| `postal_code` | CharField | no | — | max 20 |
| `is_organizer` | BooleanField | no | `False` | — |
| `last_active` | DateTimeField | yes | — | — |
| `magic_token` | CharField | yes | — | max 64; indexed |
| `magic_token_expires` | DateTimeField | yes | — | — |
| `created_at` | DateTimeField | no | — | — |
| `updated_at` | DateTimeField | no | — | — |

### Venue

Table: `ticket_bookings_venue`

| Field | Type | Null | Default | Rules / Notes |
|---|---|---|---|---|
| `id` | UUIDField | no | auto | max 32; unique |
| `organization` | FK → Organization | no | — | indexed |
| `name` | CharField | no | — | max 255 |
| `description` | TextField | no | — | — |
| `venue_type` | CharField | no | `indoor` | max 20 |
| `address_line1` | CharField | no | — | max 255 |
| `address_line2` | CharField | no | — | max 255 |
| `city` | CharField | no | — | max 100 |
| `state` | CharField | no | — | max 100 |
| `postal_code` | CharField | no | — | max 20 |
| `country` | CharField | no | `India` | max 100 |
| `latitude` | DecimalField | yes | — | — |
| `longitude` | DecimalField | yes | — | — |
| `capacity` | IntegerField | yes | — | — |
| `has_reserved_seating` | BooleanField | no | `False` | — |
| `contact_phone` | CharField | no | — | max 20 |
| `contact_email` | CharField | no | — | max 254 |
| `website_url` | CharField | no | — | max 200 |
| `amenities` | JSONField | no | auto | — |
| `rules` | TextField | no | — | — |
| `metadata` | JSONField | no | auto | — |
| `is_active` | BooleanField | no | `True` | — |
| `created_at` | DateTimeField | no | — | — |
| `updated_at` | DateTimeField | no | — | — |

### CancellationPolicy

Table: `ticket_bookings_cancellationpolicy`

| Field | Type | Null | Default | Rules / Notes |
|---|---|---|---|---|
| `id` | UUIDField | no | auto | max 32; unique |
| `organization` | FK → Organization | no | — | indexed |
| `organizer` | FK → User | no | — | indexed; Legacy owner (pre-tenancy). Use `organization` for access control. |
| `name` | CharField | no | — | max 120 |
| `description` | TextField | no | — | — |
| `rules` | JSONField | no | auto | Policy rules. See services/cancellation_policy.py for schema. Must include "version" and "refund_tiers". |
| `is_active` | BooleanField | no | `True` | — |
| `is_default` | BooleanField | no | `False` | If true, this policy is preselected when creating a new event for this organization. Only one policy per org may be default. |
| `created_at` | DateTimeField | no | — | — |
| `updated_at` | DateTimeField | no | — | — |

### Event

Table: `ticket_bookings_event`

| Field | Type | Null | Default | Rules / Notes |
|---|---|---|---|---|
| `id` | UUIDField | no | auto | max 32; unique |
| `organization` | FK → Organization | no | — | indexed |
| `organizer` | FK → User | yes | — | indexed; Legacy owner (pre-tenancy). Use `organization` for access control. |
| `title` | CharField | no | — | max 255 |
| `description` | TextField | no | — | — |
| `short_description` | CharField | no | — | max 500 |
| `event_type` | CharField | no | `single` | max 20 |
| `category` | CharField | no | `other` | max 20 |
| `start_date` | DateTimeField | no | — | — |
| `end_date` | DateTimeField | no | — | — |
| `timezone` | CharField | no | `Asia/Kolkata` | max 50 |
| `venue` | FK → Venue | yes | — | indexed |
| `metadata` | JSONField | no | auto | — |
| `venue_metadata` | JSONField | no | auto | — |
| `cover_image` | CharField | no | — | max 200 |
| `gallery_images` | JSONField | no | auto | — |
| `status` | CharField | no | `draft` | max 20; choices: draft, published, active, cancelled, completed, sold_out, postponed |
| `is_public` | BooleanField | no | `True` | — |
| `is_featured` | BooleanField | no | `False` | — |
| `booking_start_date` | DateTimeField | yes | — | — |
| `booking_end_date` | DateTimeField | yes | — | — |
| `min_tickets_per_order` | IntegerField | no | `1` | — |
| `max_tickets_per_order` | IntegerField | no | `10` | — |
| `cancellation_policy` | FK → CancellationPolicy | yes | — | indexed; Reusable cancellation policy. If null, no structured refunds are offered — the free-text field may still be shown. |
| `cancellation_policy_text` | TextField | no | — | Free-text cancellation terms. Shown to the customer when no structured policy (FK) is attached, or as an additional note. |
| `refundable_until` | DateTimeField | yes | — | — |
| `cancellation_reason` | TextField | no | `` | Required when the event is cancelled; shown to staff and customers. |
| `total_tickets_sold` | IntegerField | no | `0` | — |
| `total_revenue` | DecimalField | no | `0` | — |
| `created_at` | DateTimeField | no | — | — |
| `updated_at` | DateTimeField | no | — | — |
| `ticket_format` | CharField | no | `pdf` | max 10; choices: pdf, png, both; Select the format for ticket delivery |
| `combine_tickets` | BooleanField | no | `False` | Combine all tickets into a single file |
| `tickets_per_page` | IntegerField | no | `4` | Number of tickets per page (for combined tickets) |
| `event_flow` | CharField | no | `ticketed` | max 32; choices: ticketed, free_registration, paid_registration; Controls the booking pipeline for this event:   • ticketed          — pay per seat, per-attendee tickets   • free_registration — RSVP, auto-confirmed, no payment   • paid_registration — flat fee, single pass, no per-attendee tickets |
| `members_only` | BooleanField | no | `False` | When true, only users with an active membership in this organization may view or book. |
| `donations_enabled` | BooleanField | no | `False` | Allow buyers to add an optional donation at checkout. Eligible donations can receive an official tax receipt. |
| `ask_course_question` | BooleanField | no | `False` | Ask buyers whether they have completed an Art of Living course. |
| `public_page_enabled` | BooleanField | no | `True` | — |
| `duration_minutes` | PositiveIntegerField | no | `120` | — |
| `map_url` | CharField | no | `` | max 200 |
| `faqs` | JSONField | no | auto | — |
| `title_zh` | CharField | no | `` | max 255 |
| `short_description_zh` | CharField | no | `` | max 500 |
| `description_zh` | TextField | no | `` | — |
| `faqs_zh` | JSONField | no | auto | — |
| `donation_presets` | JSONField | no | auto | — |
| `donation_contact_text` | TextField | no | `` | — |
| `privacy_notice_text` | TextField | no | `` | Optional checkout privacy notice (PDPO). |
| `marketing_opt_in_enabled` | BooleanField | no | `False` | — |
| `min_membership_tier` | FK → MembershipTier | yes | — | indexed; If set, only members at this tier or higher may view/book this event. |

### Session

Table: `ticket_bookings_session`

| Field | Type | Null | Default | Rules / Notes |
|---|---|---|---|---|
| `id` | UUIDField | no | auto | max 32; unique |
| `event` | FK → Event | no | — | indexed |
| `venue` | FK → Venue | yes | — | indexed |
| `start_time` | DateTimeField | no | — | — |
| `end_time` | DateTimeField | no | — | — |
| `capacity` | IntegerField | no | — | — |
| `booked` | IntegerField | no | `0` | — |
| `reserved` | IntegerField | no | `0` | — |
| `is_active` | BooleanField | no | `True` | — |
| `created_at` | DateTimeField | no | — | — |

### TicketTier

Table: `ticket_bookings_tickettier`

| Field | Type | Null | Default | Rules / Notes |
|---|---|---|---|---|
| `id` | UUIDField | no | auto | max 32; unique |
| `event` | FK → Event | no | — | indexed |
| `session` | FK → Session | yes | — | indexed |
| `name` | CharField | no | — | max 100 |
| `price` | DecimalField | no | — | — |
| `quantity_total` | IntegerField | no | — | — |
| `quantity_sold` | IntegerField | no | `0` | — |
| `quantity_reserved` | IntegerField | no | `0` | — |
| `ticket_type` | CharField | no | `ga` | max 20 |
| `sale_start_date` | DateTimeField | yes | — | — |
| `sale_end_date` | DateTimeField | yes | — | — |
| `min_per_order` | IntegerField | no | `1` | — |
| `max_per_order` | IntegerField | no | `10` | — |
| `created_at` | DateTimeField | no | — | — |

### Booking

Table: `ticket_bookings_booking`

| Field | Type | Null | Default | Rules / Notes |
|---|---|---|---|---|
| `id` | UUIDField | no | auto | max 32; unique |
| `booking_reference` | CharField | no | — | max 20; unique |
| `user` | FK → User | no | — | indexed |
| `event` | FK → Event | no | — | indexed |
| `session` | FK → Session | yes | — | indexed |
| `customer_name` | CharField | no | — | max 255 |
| `customer_email` | CharField | no | — | max 254 |
| `customer_phone` | CharField | no | — | max 20 |
| `whatsapp_number` | CharField | no | — | max 20 |
| `total_amount` | DecimalField | no | — | — |
| `status` | CharField | no | `pending` | max 20; choices: pending, processing, paid, confirmed, completed, cancelled, refunded |
| `payment_id` | CharField | no | — | max 255 |
| `payment_method` | CharField | no | — | max 50 |
| `notes` | TextField | no | — | — |
| `discount_applied` | DecimalField | no | `0` | — |
| `discount_code` | CharField | no | — | max 50 |
| `donation_amount` | DecimalField | no | `0` | Optional donation added above the ticket price. |
| `donation_currency_code` | CharField | no | `` | max 3; Currency snapshot for the donation (e.g. HKD). |
| `donation_tax_receipt_number` | CharField | yes | — | max 40; unique; Generated HK tax-donation receipt number. |
| `donation_tax_receipt_issued_at` | DateTimeField | yes | — | — |
| `paid_at` | DateTimeField | yes | — | — |
| `created_at` | DateTimeField | no | — | — |
| `updated_at` | DateTimeField | no | — | — |
| `metadata` | JSONField | no | auto | — |
| `refund_amount` | DecimalField | no | `0` | — |
| `invoice_number` | CharField | no | `` | max 40; indexed; Tenant invoice number, allocated from Organization.invoice_next_number. |
| `course_answer` | CharField | no | `` | max 10; choices: yes, no,  |
| `donor_name` | CharField | no | `` | max 255; Donor name as it should appear on the tax receipt. |
| `privacy_accepted` | BooleanField | no | `False` | — |
| `marketing_opt_in` | BooleanField | no | `False` | — |
| `reminder_2d_sent_at` | DateTimeField | yes | — | — |
| `reminder_day_sent_at` | DateTimeField | yes | — | — |
| `cancellation_policy_snapshot` | JSONField | no | auto | Frozen copy of the event policy rules at booking time. Do not mutate — used for refund calculation on cancellation. |

### Ticket

Table: `ticket_bookings_ticket`

| Field | Type | Null | Default | Rules / Notes |
|---|---|---|---|---|
| `id` | UUIDField | no | auto | max 32; unique |
| `booking` | FK → Booking | no | — | indexed |
| `tier` | FK → TicketTier | yes | — | indexed |
| `seat` | FK → Seat | yes | — | indexed |
| `venue_plan` | FK → EventVenuePlan | yes | — | indexed; The venue plan under which this ticket was sold. Stamped at issue time for audit; pricing lookups still read from EventVenuePlan.published_snapshot, never from here. |
| `event` | FK → Event | no | — | indexed |
| `session` | FK → Session | yes | — | indexed |
| `unique_code` | CharField | no | — | max 50; unique |
| `qr_code` | TextField | no | — | — |
| `status` | CharField | no | `active` | max 20; choices: active, used, cancelled, refunded, expired |
| `attendee_name` | CharField | no | — | max 255 |
| `attendee_email` | CharField | no | — | max 254 |
| `attendee_phone` | CharField | no | — | max 20 |
| `check_in_time` | DateTimeField | yes | — | — |
| `created_at` | DateTimeField | no | — | — |
| `cancelled_at` | DateTimeField | yes | — | — |
| `cancelled_reason` | CharField | no | `` | max 255 |
| `net_paid_amount` | DecimalField | no | `0` | Price actually paid for this ticket after any booking-level discount proration. This is the base for refund calculation. |
| `refund_amount` | DecimalField | no | `0` | Refund amount for this ticket due to cancellation. This is separate from the booking-level refund_amount. |
| `refund_percent_applied` | IntegerField | no | `0` | Refund percentage from the policy tier that applied. |
| `cancellation_fee_applied` | DecimalField | no | `0` | Flat cancellation fee deducted from the refund. |

### CheckInLog

Table: `ticket_bookings_checkinlog`

| Field | Type | Null | Default | Rules / Notes |
|---|---|---|---|---|
| `id` | UUIDField | no | auto | max 32; unique |
| `ticket` | FK → Ticket | no | — | indexed |
| `event` | FK → Event | no | — | indexed |
| `session` | FK → Session | yes | — | indexed |
| `scanner_user` | FK → User | yes | — | indexed |
| `scanner_device_id` | CharField | no | — | max 255 |
| `scanner_ip` | GenericIPAddressField | yes | — | max 39 |
| `scanned_at` | DateTimeField | no | — | — |
| `status` | CharField | no | — | max 20 |
| `latitude` | DecimalField | yes | — | — |
| `longitude` | DecimalField | yes | — | — |
| `notes` | TextField | no | — | — |
| `is_offline` | BooleanField | no | `False` | — |
| `synced_at` | DateTimeField | yes | — | — |
| `client_scan_id` | CharField | yes | — | max 64; unique; Scanner-generated idempotency key for offline sync. |
| `created_at` | DateTimeField | no | — | — |

### Discount

Table: `ticket_bookings_discount`

| Field | Type | Null | Default | Rules / Notes |
|---|---|---|---|---|
| `id` | UUIDField | no | auto | max 32; unique |
| `organization` | FK → Organization | no | — | indexed |
| `organizer` | FK → User | no | — | indexed; Legacy owner (pre-tenancy). Use `organization` for access control. |
| `code` | CharField | no | — | max 50; unique |
| `name` | CharField | no | — | max 255 |
| `type` | CharField | no | `percentage` | max 20 |
| `value` | DecimalField | no | — | — |
| `min_order_amount` | DecimalField | no | `0` | — |
| `max_discount` | DecimalField | yes | — | — |
| `max_uses` | IntegerField | yes | — | — |
| `used_count` | IntegerField | no | `0` | — |
| `valid_from` | DateTimeField | yes | — | — |
| `valid_to` | DateTimeField | yes | — | — |
| `is_active` | BooleanField | no | `True` | — |
| `created_at` | DateTimeField | no | — | — |
| `max_uses_per_user` | IntegerField | yes | — | Max times a single customer can use this code. Null = unlimited. |
| `min_ticket_count` | IntegerField | no | `0` | Minimum number of tickets in the booking to apply. 0 = no minimum. |
| `first_time_buyers_only` | BooleanField | no | `False` | If true, only users with no prior paid bookings can use this. |
| `stackable` | BooleanField | no | `False` | Whether this discount can be combined with others on one booking. |
| `applicable_events` | ManyToManyField | no | — | If empty, discount applies to all events in this organization. |

### DiscountUsage

Table: `ticket_bookings_discountusage`

| Field | Type | Null | Default | Rules / Notes |
|---|---|---|---|---|
| `id` | UUIDField | no | auto | max 32; unique |
| `discount` | FK → Discount | no | — | indexed |
| `booking` | FK → Booking | no | — | indexed |
| `user` | FK → User | yes | — | indexed |
| `amount_applied` | DecimalField | no | — | — |
| `applied_at` | DateTimeField | no | — | — |
| `reversed_at` | DateTimeField | yes | — | — |

### EventTemplateType

Table: `ticket_bookings_eventtemplatetype`

| Field | Type | Null | Default | Rules / Notes |
|---|---|---|---|---|
| `id` | UUIDField | no | auto | max 32; unique |
| `name` | CharField | no | — | max 100 |
| `slug` | SlugField | no | — | max 100; unique; indexed |
| `description` | TextField | no | — | — |
| `icon` | CharField | no | `📄` | max 50 |
| `is_active` | BooleanField | no | `True` | — |
| `created_at` | DateTimeField | no | — | — |
| `updated_at` | DateTimeField | no | — | — |

### EventTemplate

Table: `ticket_bookings_eventtemplate`

| Field | Type | Null | Default | Rules / Notes |
|---|---|---|---|---|
| `id` | UUIDField | no | auto | max 32; unique |
| `event` | FK → Event | no | — | indexed |
| `template_type` | FK → EventTemplateType | no | — | indexed |
| `name` | CharField | no | — | max 255 |
| `description` | TextField | no | — | — |
| `image` | FileField | yes | — | max 100 |
| `config` | JSONField | no | auto | Layout configuration. See the docstring on this model for the schema. Coordinates are fractions of canvas width/height (0.0–1.0), or absolute pixels if >1. Unknown field names are ignored; missing fields fall back to defaults in ticket_generator.DEFAULT_FIELD_CONFIG. |
| `is_default` | BooleanField | no | `False` | — |
| `is_active` | BooleanField | no | `True` | — |
| `created_at` | DateTimeField | no | — | — |
| `updated_at` | DateTimeField | no | — | — |

### OTPRequest

Table: `ticket_bookings_otprequest`

| Field | Type | Null | Default | Rules / Notes |
|---|---|---|---|---|
| `id` | UUIDField | no | auto | max 32; unique |
| `destination` | CharField | no | — | max 254; indexed |
| `channel` | CharField | no | `email` | max 20; choices: email, sms, whatsapp |
| `otp_hash` | CharField | no | — | max 128 |
| `expires_at` | DateTimeField | no | — | — |
| `attempts` | PositiveIntegerField | no | `0` | — |
| `max_attempts` | PositiveIntegerField | no | `5` | — |
| `verified_at` | DateTimeField | yes | — | — |
| `created_at` | DateTimeField | no | — | — |

### SystemSettings

Table: `ticket_bookings_systemsettings`

| Field | Type | Null | Default | Rules / Notes |
|---|---|---|---|---|
| `id` | PositiveSmallIntegerField | no | `1` | unique |
| `currency_code` | CharField | no | `HKD` | max 3 |
| `currency_symbol` | CharField | no | `HK$` | max 8 |
| `currency_locale` | CharField | no | `en-HK` | max 16 |
| `country` | CharField | no | `Hong Kong` | max 100 |
| `country_code` | CharField | no | `HK` | max 2 |
| `default_timezone` | CharField | no | `Asia/Hong_Kong` | max 64 |
| `org_name` | CharField | no | `TicketVolt` | max 200 |
| `org_email` | CharField | no | `` | max 254 |
| `org_logo_url` | CharField | no | `` | max 200 |
| `email_from_name` | CharField | no | `` | max 120 |
| `updated_at` | DateTimeField | no | — | — |
| `updated_by` | FK → User | yes | — | indexed |
| `payments_enabled` | BooleanField | no | `False` | Globally enable/disable online payment gateways (Razorpay/Stripe). When off, only offline/free flows are allowed. |

### SeatCategory

Table: `ticket_bookings_seatcategory`

| Field | Type | Null | Default | Rules / Notes |
|---|---|---|---|---|
| `id` | UUIDField | no | auto | max 32; unique |
| `organization` | FK → Organization | no | — | indexed |
| `name` | CharField | no | — | max 100 |
| `hex_color` | CharField | no | `#4CAF50` | max 7 |
| `price` | DecimalField | no | `0.0` | — |

### SeatLayout

Table: `ticket_bookings_seatlayout`

| Field | Type | Null | Default | Rules / Notes |
|---|---|---|---|---|
| `id` | UUIDField | no | auto | max 32; unique |
| `venue` | FK → Venue | no | — | unique; indexed |
| `background_image` | CharField | yes | — | max 200 |
| `canvas_width` | IntegerField | no | `1000` | — |
| `canvas_height` | IntegerField | no | `800` | — |

### Seat

Table: `ticket_bookings_seat`

| Field | Type | Null | Default | Rules / Notes |
|---|---|---|---|---|
| `id` | UUIDField | no | auto | max 32; unique |
| `layout` | FK → SeatLayout | no | — | indexed |
| `category` | FK → SeatCategory | yes | — | indexed |
| `row_label` | CharField | no | — | max 10 |
| `seat_number` | CharField | no | — | max 10 |
| `x_coord` | FloatField | no | — | — |
| `y_coord` | FloatField | no | — | — |
| `is_active` | BooleanField | no | `True` | — |
| `is_accessible` | BooleanField | no | `False` | — |

### SeatReservation

Table: `ticket_bookings_seatreservation`

| Field | Type | Null | Default | Rules / Notes |
|---|---|---|---|---|
| `id` | UUIDField | no | auto | max 32; unique |
| `event` | FK → Event | no | — | indexed |
| `session` | FK → Session | yes | — | indexed |
| `seat` | FK → Seat | no | — | indexed |
| `status` | CharField | no | `available` | max 20; choices: available, held, booked, cancelled |
| `booking` | FK → Booking | yes | — | indexed |
| `held_until` | DateTimeField | yes | — | — |

### EventVenuePlan

Table: `ticket_bookings_eventvenueplan`

| Field | Type | Null | Default | Rules / Notes |
|---|---|---|---|---|
| `id` | UUIDField | no | auto | max 32; unique |
| `event` | FK → Event | no | — | unique; indexed |
| `venue_master` | FK → VenueMaster | no | — | indexed; The exact venue version this event was built against. |
| `seat_assignments` | JSONField | no | auto | — |
| `published_snapshot` | JSONField | no | auto | Immutable buyer-facing snapshot. Set once when the event is published. Buyers, tickets, and refunds ALL read from this — never from the live categories or assignments. |
| `published_at` | DateTimeField | yes | — | — |
| `created_at` | DateTimeField | no | — | — |
| `updated_at` | DateTimeField | no | — | — |

### EventSeatCategory

Table: `ticket_bookings_eventseatcategory`

| Field | Type | Null | Default | Rules / Notes |
|---|---|---|---|---|
| `id` | UUIDField | no | auto | max 32; unique |
| `venue_plan` | FK → EventVenuePlan | no | — | indexed |
| `source_palette_category_id` | CharField | no | `` | max 64; VenueMaster palette category id this was copied from (audit only). |
| `name` | CharField | no | — | max 100 |
| `hex_color` | CharField | no | `#4CAF50` | max 7 |
| `price` | DecimalField | no | `0` | — |
| `created_at` | DateTimeField | no | — | — |

### VenueMaster

Table: `ticket_bookings_venuemaster`

| Field | Type | Null | Default | Rules / Notes |
|---|---|---|---|---|
| `id` | UUIDField | no | auto | max 32; unique |
| `venue` | FK → Venue | no | — | indexed |
| `version` | PositiveIntegerField | no | — | — |
| `is_current` | BooleanField | no | `True` | indexed |
| `snapshot` | JSONField | no | auto | — |
| `has_layout` | BooleanField | no | `False` | — |
| `has_reserved_seating` | BooleanField | no | `False` | — |
| `name` | CharField | no | — | max 255 |
| `city` | CharField | no | `` | max 100 |
| `country` | CharField | no | `` | max 100 |
| `venue_type` | CharField | no | `` | max 20 |
| `created_by` | FK → User | yes | — | indexed |
| `created_at` | DateTimeField | no | — | — |

### TicketTransfer

Table: `ticket_bookings_tickettransfer`

| Field | Type | Null | Default | Rules / Notes |
|---|---|---|---|---|
| `id` | UUIDField | no | auto | max 32; unique |
| `ticket` | FK → Ticket | no | — | indexed |
| `from_user` | FK → User | yes | — | indexed |
| `to_email` | CharField | no | — | max 254 |
| `token` | UUIDField | no | auto | max 32; unique |
| `status` | CharField | no | `pending` | max 20; choices: pending, accepted, cancelled, expired |
| `expires_at` | DateTimeField | no | — | — |
| `accepted_by` | FK → User | yes | — | indexed |
| `accepted_at` | DateTimeField | yes | — | — |
| `created_at` | DateTimeField | no | — | — |

### OrganizerPayout

Table: `ticket_bookings_organizerpayout`

| Field | Type | Null | Default | Rules / Notes |
|---|---|---|---|---|
| `id` | UUIDField | no | auto | max 32; unique |
| `organization` | FK → Organization | no | — | indexed |
| `reference` | CharField | no | — | max 40; unique |
| `period_start` | DateField | no | — | — |
| `period_end` | DateField | no | — | — |
| `gross_sales` | DecimalField | no | `0` | — |
| `refunds` | DecimalField | no | `0` | — |
| `platform_fee` | DecimalField | no | `0` | — |
| `net_payout` | DecimalField | no | `0` | — |
| `status` | CharField | no | `draft` | max 20; choices: draft, approved, paid, cancelled |
| `paid_at` | DateTimeField | yes | — | — |
| `notes` | TextField | no | `` | — |
| `created_by` | FK → User | yes | — | indexed |
| `created_at` | DateTimeField | no | — | — |
| `updated_at` | DateTimeField | no | — | — |

### AuditLog

Table: `ticket_bookings_auditlog`

| Field | Type | Null | Default | Rules / Notes |
|---|---|---|---|---|
| `id` | UUIDField | no | auto | max 32; unique |
| `organization` | FK → Organization | yes | — | indexed |
| `actor` | FK → User | yes | — | indexed |
| `action` | CharField | no | — | max 120 |
| `method` | CharField | no | `` | max 10 |
| `path` | CharField | no | `` | max 500 |
| `status_code` | PositiveIntegerField | yes | — | — |
| `entity_type` | CharField | no | `` | max 80 |
| `entity_id` | CharField | no | `` | max 80 |
| `ip_address` | GenericIPAddressField | yes | — | max 39 |
| `detail` | JSONField | no | auto | — |
| `created_at` | DateTimeField | no | — | — |

### PatronContact

Table: `ticket_bookings_patroncontact`

| Field | Type | Null | Default | Rules / Notes |
|---|---|---|---|---|
| `id` | UUIDField | no | auto | max 32; unique |
| `booking` | FK → Booking | no | — | unique; indexed |
| `contacted_by` | FK → User | yes | — | indexed |
| `contacted_at` | DateTimeField | no | auto | — |
| `notes` | TextField | no | `` | — |

### FeatureDefinition

Table: `ticket_bookings_featuredefinition`

| Field | Type | Null | Default | Rules / Notes |
|---|---|---|---|---|
| `id` | UUIDField | no | auto | max 32; unique |
| `key` | SlugField | no | — | max 80; unique; indexed |
| `name` | CharField | no | — | max 120 |
| `description` | TextField | no | `` | — |
| `category` | CharField | no | `General` | max 60 |
| `default_enabled` | BooleanField | no | `True` | — |
| `is_active` | BooleanField | no | `True` | — |
| `created_at` | DateTimeField | no | — | — |

### FeaturePackage

Table: `ticket_bookings_featurepackage`

| Field | Type | Null | Default | Rules / Notes |
|---|---|---|---|---|
| `id` | UUIDField | no | auto | max 32; unique |
| `code` | SlugField | no | — | max 60; unique; indexed |
| `name` | CharField | no | — | max 120 |
| `description` | TextField | no | `` | — |
| `feature_keys` | JSONField | no | auto | — |
| `is_default` | BooleanField | no | `False` | — |
| `is_active` | BooleanField | no | `True` | — |
| `created_at` | DateTimeField | no | — | — |
| `updated_at` | DateTimeField | no | — | — |

### OrganizationFeature

Table: `ticket_bookings_organizationfeature`

| Field | Type | Null | Default | Rules / Notes |
|---|---|---|---|---|
| `id` | UUIDField | no | auto | max 32; unique |
| `organization` | FK → Organization | no | — | indexed |
| `feature` | FK → FeatureDefinition | no | — | indexed |
| `enabled` | BooleanField | no | `True` | — |
| `config` | JSONField | no | auto | — |
| `updated_by` | FK → User | yes | — | indexed |
| `updated_at` | DateTimeField | no | — | — |

### MembershipTier

Table: `ticket_bookings_membershiptier`

| Field | Type | Null | Default | Rules / Notes |
|---|---|---|---|---|
| `id` | UUIDField | no | auto | max 32; unique |
| `organization` | FK → Organization | no | — | indexed |
| `slug` | SlugField | no | — | max 120; indexed |
| `name` | CharField | no | — | max 120 |
| `description` | TextField | no | — | — |
| `price` | DecimalField | no | `0.00` | — |
| `currency_code` | CharField | no | `` | max 3 |
| `billing_period` | CharField | no | `yearly` | max 20; choices: one_time, monthly, quarterly, yearly |
| `duration_days` | PositiveIntegerField | no | `365` | — |
| `max_members` | PositiveSmallIntegerField | no | `1` | — |
| `benefits` | JSONField | no | auto | Free-form benefit flags. Examples: {"member_discount_pct": 15, "allowed_event_categories": ["concert","theater"], "free_tickets_per_year": 2, "members_only_events": true} |
| `is_active` | BooleanField | no | `True` | — |
| `is_public` | BooleanField | no | `True` | — |
| `created_at` | DateTimeField | no | — | — |
| `updated_at` | DateTimeField | no | — | — |

### Membership

Table: `ticket_bookings_membership`

| Field | Type | Null | Default | Rules / Notes |
|---|---|---|---|---|
| `id` | UUIDField | no | auto | max 32; unique |
| `organization` | FK → Organization | no | — | indexed |
| `user` | FK → User | no | — | indexed |
| `tier` | FK → MembershipTier | no | — | indexed |
| `price_paid` | DecimalField | no | `0` | — |
| `currency_code` | CharField | no | `` | max 3 |
| `status` | CharField | no | `pending` | max 20; choices: pending_offline, pending, active, expired, cancelled, refunded |
| `started_at` | DateTimeField | no | auto | — |
| `valid_until` | DateTimeField | yes | — | — |
| `membership_payment_id` | CharField | no | — | max 128 |
| `payment_method` | CharField | no | `online` | max 20; choices: online, cash, offline |
| `offline_reference` | CharField | no | `` | max 128; Reference the user quoted at signup (e.g. receipt no., bank ref). |
| `reviewed_by` | FK → User | yes | — | indexed; The owner/admin who activated or rejected an offline membership. |
| `reviewed_at` | DateTimeField | yes | — | — |
| `cancelled_at` | DateTimeField | yes | — | — |
| `cancelled_reason` | CharField | no | `` | max 255 |
| `created_at` | DateTimeField | no | — | — |
| `updated_at` | DateTimeField | no | — | — |

### MembershipDependent

Table: `ticket_bookings_membershipdependent`

| Field | Type | Null | Default | Rules / Notes |
|---|---|---|---|---|
| `id` | UUIDField | no | auto | max 32; unique |
| `membership` | FK → Membership | no | — | indexed |
| `full_name` | CharField | no | — | max 200 |
| `email` | CharField | no | — | max 254 |
| `phone` | CharField | no | — | max 20 |
| `date_of_birth` | DateField | yes | — | — |
| `relationship` | CharField | no | `other` | max 20; choices: spouse, child, parent, sibling, other |
| `member_code` | CharField | no | — | max 20; unique; indexed |
| `promoted_user` | FK → User | yes | — | indexed |
| `is_active` | BooleanField | no | `True` | — |
| `created_at` | DateTimeField | no | — | — |

### MembershipPayment

Table: `ticket_bookings_membershippayment`

| Field | Type | Null | Default | Rules / Notes |
|---|---|---|---|---|
| `id` | UUIDField | no | auto | max 32; unique |
| `organization` | FK → Organization | no | — | indexed |
| `membership` | FK → Membership | yes | — | indexed |
| `user` | FK → User | no | — | indexed |
| `tier` | FK → MembershipTier | no | — | indexed |
| `gateway` | CharField | no | — | max 16 |
| `provider_order_id` | CharField | yes | — | max 128; unique |
| `provider_payment_id` | CharField | yes | — | max 128 |
| `amount` | DecimalField | no | — | — |
| `currency` | CharField | no | — | max 8 |
| `status` | CharField | no | `created` | max 20; choices: created, pending, paid, failed, expired, refunded |
| `checkout` | JSONField | no | auto | — |
| `paid_at` | DateTimeField | yes | — | — |
| `created_at` | DateTimeField | no | — | — |
| `updated_at` | DateTimeField | no | — | — |


## Appendix B — Review comment resolution log

The following comments were added during document review. Each row records the resolution.

| # | Review comment | Resolution |
|---|---|---|
| C01 | “This is fine” — Venue management | No change. |
| C02 | Seating layout “should now be part of the Event Creation process” | Updated Section 5.2: venue creation captures geometry/master; seat categories and assignment are configured during Event Creation. |
| C03 | Venue detail “should now be part of the Event Creation process” | Updated Section 5.2 and the venue/event workflow to distinguish venue master from event category plan. |
| C04 | “What does this mean?” — Organisation | Added a full explanation in Section 6.1: tenant ownership, scoping, defaults, permissions and immutability. |
| C05 | “What is this for?” — Event type | Explained the supported event types and that type is a classification, not the scheduling engine. |
| C06 | “What is this for?” — Category | Explained the public browse/filter taxonomy and the supported category values. |
| C07 | “What is this for?” — Cover image | Explained use on cards and public detail page. |
| C08 | “What is this for?” — Gallery | Explained public detail gallery storage and display. |
| C09 | “What is this for?” — Minimum membership tier | Explained tier-gated access and blank meaning. |
| C10 | “How is this set up done?” — Booking window | Explained optional booking start/end and resulting sales restriction. |
| C11 | “Can this be configured from UI?” — Min/max tickets | Yes — event form fields, enforced by the checkout/API. |
| C12 | “Where is this derived from?” — Refundable until | Clarified it is manually configured. Documented the current gap: refund calculation uses the cancellation policy, not this field. |
| C13 | Active vs Published and status explanation | Added a full status table and explicit Active vs Published explanation in Section 6.5. |
| C14 | Cancellation reason conditional field | Implemented `Event.cancellation_reason`, a conditional required field in Event Schedule when status is `cancelled`, API persistence and serialization. |
| C15 | “This is fine” — Venue handoff | No change. |
| C16 | Explain how every field is populated/works | Expanded Section 6.1 to a detailed how-it-works table; expanded session, ticket, membership, transfer, entitlement, pricing and branding sections. |
| C17 | “What does this mean?” — Server-side pricing | Added a step-by-step explanation of authoritative subtotal, discount and donation calculation. |
| C18 | Is there a task to update ticket status? | Clarified: no scheduled ticket-status task; ticket changes occur through check-in/cancel/refund actions. The scheduled task updates event status only. |
| C19 | Check-in should capture admin/staff user id | Confirmed and documented `scanner_user` plus device, IP, location, offline-sync and idempotency fields. |
| C20 | “What does this mean?” — Name/slug | Split into two explanations: display name and unique URL/API identifier. |
| C21 | Should ticket QR regenerate on transfer? | Yes — implemented. On accepted transfer the ticket code and QR payload are regenerated; the previous QR is invalidated. |
| C22 | Are entitlements/limits configurable? | Yes — plan JSON plus per-tenant overrides. Documented UI scope and enforcement points. |
| C23 | Explain pricing flexibility | Added step-by-step explanation of list price, contracted price, grandfathering, resync and monthly/yearly switching. |
| C24 | Explain each branding field | Added a field-by-field branding table. |
| C25 | Can logo/favicon be uploaded to tenant storage with naming? | Documented current limitation (URL fields only) and the required future upload/storage convention. |

