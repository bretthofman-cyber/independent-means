# CLAUDE.md — Independent Means

> Auto-loaded by Claude Code at session start. Full project context.  
> **Local path:** `~/independentMeans/`  
> **Last updated:** 17 July 2026 — see `CHANGELOG.md` for session history.

---

## What Is Independent Means?

Australian personal financial modelling and scenario analysis web app, live at **independentmeans.com.au**.  
7-stage wizard → deterministic JS calculation engine → categorised observations and action points.

**Key differentiator:** All projections are rules-based, calculated from the user's actual inputs. No AI features in the running app — this is a deliberate AFSL compliance decision (AI output risks being construed as financial advice).

---

## Tech Stack

| Component | Technology |
|---|---|
| Frontend | React 19 + Vite (SPA) |
| Styling | Inline styles throughout — no CSS framework |
| Auth | Supabase (Google OAuth) |
| Database | Supabase Postgres with Row Level Security |
| Payments | Stripe Checkout + Customer Portal + webhooks |
| Hosting | Vercel (auto-deploys on GitHub push to `main`) |
| Fonts | Spectral (serif) + Albert Sans (body) |
| Tests | Vitest — 254 tests, 12 files |

---

## Colour Palette — "Quiet Wealth"

| Name | Hex | Usage |
|---|---|---|
| Pine | `#2E4A3D` | Brand anchor, buttons, icons |
| Ink | `#21241E` | Dark backgrounds, body text |
| Paper | `#F5F2EB` | Page background |
| Card | `#FBFAF6` | Card backgrounds |
| Gold | `#C2A06B` | CTAs, progress, premium accents |
| Stone | `#D8D2C4` | Borders |
| Sage | `#9DB0A1` | Captions, secondary text |

---

## File Structure

```
~/independentMeans/
├── CLAUDE.md                     ← You are here
├── CHANGELOG.md                  ← Session-by-session change log
├── LAUNCH_CHECKLIST.md           ← Pre-launch QA (5 canonical journeys)
├── IMPLEMENTATION_PLAN.md        ← Phase-by-phase build plan
├── src/
│   ├── App.jsx                   ← Main authenticated app (~1300 lines)
│   ├── LandingPage.jsx           ← Marketing page + Google Sign-In
│   ├── LegalModals.jsx           ← Shared: LegalModal, TERMS_CONTENT, PRIVACY_CONTENT, SiteFooter
│   ├── engine.js                 ← Financial calculation engine (pure JS)
│   ├── features.js               ← FEATURES.* constants for all feature flags
│   ├── useEntitlement.js         ← Subscription tier logic + EntitlementContext
│   ├── PremiumGate.jsx           ← Gate wrapper — shows overlay for non-entitled users
│   ├── TrialBanner.jsx           ← Trial countdown banner
│   ├── PricingPage.jsx           ← Pricing / upgrade modal
│   ├── AnalysisStage.jsx         ← Stage 6 — charts, Monte Carlo, scenario tools
│   ├── ActionPlanStage.jsx       ← Stage 7 — financial summary / observations
│   ├── PdfReport.jsx             ← Always-mounted print-to-PDF report component
│   ├── exportCsv.js              ← CSV export functions (plan data + projection)
│   ├── actionPlan.js             ← generatePlanItems(), PLAN_CATEGORIES
│   ├── analytics.js              ← Supabase events table logging
│   ├── AdminDashboard.jsx        ← Admin analytics view (brett.hofman@gmail.com only)
│   ├── BudgetStage.jsx           ← Stage 2
│   ├── AssetStage.jsx            ← Stage 3
│   ├── lifeEvents.js             ← Life event types and helpers
│   ├── supabase.js               ← Supabase client (anon key safe for frontend)
│   └── ui.jsx                    ← Shared UI primitives (Field, Input, Select, Toggle, etc.)
├── api/
│   ├── stripe-webhook.js         ← Vercel serverless — webhook handler (signature verified)
│   └── create-checkout.js        ← Vercel serverless — creates Stripe Checkout session
├── public/
│   ├── privacy.html              ← Standalone privacy policy page
│   └── terms.html                ← Standalone terms of service page
├── index.html                    ← SPA shell; #static-links div for Google OAuth compliance
└── docs/
    └── export-format.md          ← CSV export column schema (plan data + projection)
```

---

## 7-Stage Wizard

| Stage | Name | Key inputs |
|---|---|---|
| 1 | Household Profile | Name, age, partner, dependants, employment, retirement age, life expectancy, ownership |
| 2 | Income & Cashflow | Gross income, partner income, bonus, monthly expenses, savings/month, budget items |
| 3 | Assets & Savings | Asset items array, emergency fund |
| 4 | Property & Debt | PPOR, mortgage, investment properties[], HECS, credit cards, personal loans |
| 5 | Super & Goals | Super balances, SG rate, salary sacrifice, target retirement spending |
| 6 | Analysis | Scenario comparison, net worth chart, Monte Carlo fan chart, Strategy Centre, warnings |
| 7 | Financial Summary | Categorised observations, action points, adviser topics, PDF/CSV export |

---

## Subscription Tiers

| Tier | Key features |
|---|---|
| **Free** | All 7 stages, base scenario, net worth chart, FIRE number, basic tax, warnings |
| **Trial (14 days)** | All Premium features — starts on first premium gate click, no credit card |
| **Premium** | Monte Carlo, scenario comparison, custom assumptions, Div 293, carry-forward, franking credits, debt recycling, Strategy Centre, PDF export, CSV export |

Pricing: A$15/month or A$149/year. Stripe Checkout + Customer Portal.

---

## Entitlement System

- `src/features.js` — `FEATURES` object with all feature flag string constants
- `src/useEntitlement.js` — `useEntitlement(userId)` hook; returns `{ can(featureId), status, isTrial, trialDaysLeft, openPortal, refreshSubscription }`
- `EntitlementContext` — provided at App root, consumed via `useContext(EntitlementContext)`
- `src/PremiumGate.jsx` — wraps any UI element; shows gate overlay or UpgradeModal for non-entitled users

---

## Legal & Compliance

- AFSL-compliant: general information only, no "you should", no advice language
- No em dashes in user-facing copy
- No "planner" or "plan" in user-facing text
- `src/LegalModals.jsx` — canonical source for Terms and Privacy content; `SiteFooter` component used in both landing page and authenticated app (popup style)
- `#static-links` in `index.html` — invisible HTML links (Pine text on Pine background) satisfying Google OAuth policy; `useEffect` in App.jsx hides them when user is signed in
- `public/privacy.html` and `public/terms.html` — standalone pages remain live

---

## Security Constraints (Non-Negotiable)

- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` must **never** have `VITE_` prefix
- `ANTHROPIC_API_KEY` must **never** appear in client code
- Supabase anon key `sb_publishable_*` is publishable (safe for frontend); secret key must never go client-side
- Price IDs resolved server-side only; client sends only `planType: 'monthly'|'annual'`
- JWT verification on all Stripe API endpoints
- `stripe_customer_id` looked up server-side from DB, never trusted from client
- `localStorage` keys `clearpath_v1` and `clearpath_stage` must **not** be renamed (breaks existing user sessions)

---

## Calculation Engine (engine.js)

| Function | What it calculates |
|---|---|
| `projectSuper(data, assumptions)` | Super balance at retirement + SG + salary sacrifice |
| `retirementDrawdown(data, assumptions, superBalance)` | Year-by-year drawdown, depletion age, SWR |
| `debtFreeDate(data)` | PPOR amortisation — debt-free year, monthly payment |
| `netWorthTrajectory(data, assumptions)` | Year-by-year net worth to life expectancy |
| `runEngine(data, options)` | Calls all four; returns `{ trajectory, monteCarlo, metrics, assumptions, householdTax }` |

Options: `{ skipMonteCarlo: bool, skipAdvancedTax: bool }` — Monte Carlo skipped for free users.

Trajectory row shape: `{ age, year, netWorth, superBalance, liquidAssets, propertyValue, totalDebt, isRetired, eventTypes }`.

---

## Modelling Scenarios

| Scenario | Return | Inflation | Property | Rental | SWR |
|---|---|---|---|---|---|
| Base | 6.5% | 2.5% | 4.5% | 3.0% | 4.0% |
| Conservative | 5.5% | 3.0% | 3.5% | 2.5% | 4.0% |
| Aggressive | 7.5% | 2.0% | 5.5% | 3.5% | 4.0% |

---

## Australian Financial Context (FY2025-26)

| Parameter | Value |
|---|---|
| Super Guarantee Rate | 12% |
| Concessional Contribution Cap | $30,000/year |
| Non-Concessional Cap | $110,000/year |
| Preservation Age | 60 |
| Age Pension Eligibility | 67 |
| Medicare Levy | 2% |
| HECS Repayment Threshold | ~$54,435 |
| CGT Discount (held >12 months) | 50% |

---

## Copy & Compliance Rules

- Never present outputs as personal financial advice
- Never recommend specific financial products
- Always frame projections as modelling assumptions with uncertainty
- Always suggest adviser review (AFSL holder) for tax, super strategy, debt, insurance, investment allocation
- Standard disclaimer: *"General information only. Not personal financial advice."*
- No AI features in the app — `api/chat.js` exists but is intentionally unwired (AFSL risk)

---

## Post-Launch Roadmap (Coming Soon Stubs)

| Feature | Gate | Notes |
|---|---|---|
| CSV import | — | Schema in `docs/export-format.md` |
| TTR strategy | — | Described in warnings; no interactive module |
| Snapshots / version history | — | Not built |
| Multi-household support | `multi_plan` | Gate visible; schema is single-household only |
| Apple Sign In | — | Requires Apple developer account |
