# Independent Means — Freemium Implementation Plan

---

## Open Questions

These must be answered before Phase 1 starts. My recommendations are marked **[REC]**.

**Q1 — Free scenario access**
Does the free tier only ever see the Base scenario, or can a free user switch between Base / Conservative / Aggressive individually but just can't see them side-by-side?
**[REC]** Free users can select any single scenario (base/conservative/aggressive) but the ScenarioComparisonRow (which shows all three together) is premium-gated. This gives free users more immediate value without giving away the side-by-side comparison premium feature.

**Q2 — FIRE panel tier**
Is the FIRE Number / Coast FIRE / Bridge Fund panel free or premium?
**[REC]** FREE. It is a deterministic calculation, no simulation. Gating it would reduce the perceived value of the free plan without protecting a meaningful premium feature.

**Q3 — Division 293 gating approach**
Div 293 is computed inside `calculatePersonTax()` which runs for every user. Should it be excluded from the calculation entirely for free users, or just excluded from UI display?
**[REC]** Keep the calculation running (D293 affects the household tax total which is core). For free users: suppress the D293 warning card and the D293 line in the AnalysisSummary and ActionPlan. The number is implicitly present in the total tax figure.

**Q4 — Carry-forward cap tier**
Hide the carry-forward input fields in Stage 5 for free users (leaving value at 0), or allow entry but hide the analysis?
**[REC]** Hide the Stage 5 carry-forward input fields behind a premium gate. If the value is 0 the engine degrades gracefully.

**Q5 — Debt recycling tier**
Free or premium?
**[REC]** PREMIUM. It is a structuring strategy, not a standard planning assumption.

**Q6 — TTR (Transition to Retirement) — DOES NOT EXIST**
The implementation brief says "this logic ALREADY EXISTS in the codebase — the job is to gate it, not build it." After a full audit: there is **no TTR logic anywhere** in `engine.js`, `App.jsx`, `warnings.js`, or `actionPlan.js`. This must be flagged before commitment.
**Decision needed:** (a) Build TTR for launch as part of Phase 4, (b) mark it "coming soon" behind the premium gate without building it, or (c) remove it from the premium feature list entirely.
**[REC]** Option (b) — stub it with a "Coming soon" label in the premium feature list. Building TTR properly would require significant engine work and should be a separate release.

**Q7 — Warnings panel for premium features**
Show all warnings to free users (including Div 293, carry-forward), or suppress premium-feature warnings?
**[REC]** Show all warnings but add a premium badge and upsell callout to D293 and carry-forward warnings. Suppressing them makes the app feel less capable to free users.

**Q8 — Multiple plans per user at launch**
"Unlimited plans and households" is listed as a premium feature, but the current schema is one-to-one (one row per user in `plans`). Supporting multiple plans requires a different data model. Is this in scope for launch?
**[REC]** Defer to a post-launch release. At launch, premium gives unlimited saved data (the same single plan, but with no data caps). Rename the feature label to "Unlimited saved data + future multi-plan support." This avoids a schema migration during the core billing work.

**Q9 — Trial trigger**
On the first gate click, should a modal ask "Start your 14-day trial?" or should the trial auto-activate silently and just let the user through?
**[REC]** Show a brief modal: "You've unlocked a 14-day free trial of Independent Means Premium. Your trial ends on [date]. No credit card required." Single dismiss button. Gate click proceeds. This creates a moment of perceived value rather than a silent unlock.

**Q10 — Analytics platform**
Plausible (simple, privacy-first, AU-hosted option available) or Posthog (more powerful, self-hostable)?
**[REC]** Plausible for Phase 1. Simple script tag, no SDK, 30 minutes to add. Upgrade to Posthog post-launch if funnel analytics are needed.

---

## Part 1 — Current State

### Framework and toolchain
- React 19 + Vite, TypeScript NOT used (plain JS throughout)
- Deployed on Vercel via GitHub auto-deploy
- No CSS framework — inline styles throughout, design system tokens defined as CSS custom properties in a `<style>` tag inside `IndependentMeans()`
- Fonts: Spectral (serif) + Albert Sans (body) — loaded via Google Fonts `@import` in the same `<style>` tag

### State management
Single flat `useState` object (`data`) plus a `stage` integer. No router, no Redux, no Context. All derived state is computed inline or via `useMemo`. There are no global stores.

### Auth and persistence
- Supabase Auth with Google OAuth only. Auth state managed in `IndependentMeans()` via `getSession` + `onAuthStateChange`.
- Supabase Postgres `plans` table — one row per user, `data jsonb`, `stage int`. Debounced upsert (800ms) via `savePlan()`.
- `loadData()`, `saveData()`, `loadStage()`, `saveStage()` (localStorage) are dead code — still present in `App.jsx` but never called. The main component uses Supabase exclusively.
- **No subscription or billing columns exist in the database.**

### Calculation engine (`engine.js`, 1025 lines)
Pure JS, no npm dependencies, called client-side on every state change. Exports:

| Function | What it does |
|---|---|
| `runEngine(data)` | Main entry — calls all sub-functions, returns unified metrics object |
| `calculatePersonTax(taxableIncome, opts)` | Full AU income tax for one person incl. LITO, Medicare, MLS, HECS, Div 293, franking credits |
| `calculateHouseholdTax(data, ipCashflows)` | Household-level tax with rental income allocation, carry-forward cap, negative gearing |
| `propertyAnnualCashflow(ip)` | Single IP net cashflow, taxable income, negative gearing flag |
| `projectSuper(data, assumptions)` | Super accumulation to retirement for one or two people |
| `retirementDrawdown(data, assumptions, superBalance)` | Year-by-year drawdown, depletion age, Transfer Balance Cap |
| `debtFreeDate(data)` | PPOR and IP mortgage payoff date |
| `netWorthTrajectory(data, assumptions, householdTax)` | Year-by-year net worth from current age to life expectancy |
| `runMonteCarlo(data, assumptions, iterations=1000)` | 1000-iteration Monte Carlo probability of success |
| `fireCalc(data, assumptions)` | FIRE number, Coast FIRE, Years to FI, bridge fund |
| `estimateAgePension(...)` | Simplified assets + income test |
| `abpMinDrawdown(balance, age)` | ABP minimum drawdown % per SISR Schedule 7 |

### App.jsx (3050+ lines)
All stage forms, all screen components, landing page, auth wiring, and the main `IndependentMeans()` function are in one file. Key sections:

- **Stage 1–5**: Form components (Stage1, Stage2 imported from BudgetStage.jsx, AssetStage3 from AssetStage.jsx, Stage4, Stage5)
- **Stage 6 — AnalysisScreen**: Scenario selector, WarningsPanel, MetricsRow (6 metric cards), MonteCarloCard, FIREPanel, NetWorthChart (hand-coded SVG), ProjectionTable, ScenarioComparisonRow, AnalysisSummary (text narrative), AssumptionsRegister
- **Stage 7 — ActionPlanScreen**: Grouped plan items from `actionPlan.js`
- **LoginScreen**: Full landing page (hero, features, how-it-works, trust pillars, footer, Terms/Privacy modals)
- **LoadingScreen**: Centred brand name + "Loading your plan…"
- **Legal**: `TERMS_CONTENT` and `PRIVACY_CONTENT` string constants + `LegalModal` component

### Other source files
| File | Purpose |
|---|---|
| `warnings.js` | Deterministic warning rules (critical/high/medium/info) |
| `actionPlan.js` | Plan item generator grouped by category |
| `lifeEvents.js` | Life event types, newLifeEvent factory, year-based adjustments |
| `ausConfig.js` | AU tax/super thresholds for FY2026-27 |
| `ui.jsx` | Primitives: Field, Input, Select, Toggle, TwoCol, SectionDivider |
| `supabase.js` | Supabase client with defensive guard |

---

## Part 2 — AU Tax Boundary Map

### FREE (basic — always runs for all users)

| Calculation | Location | Notes |
|---|---|---|
| Income tax brackets | `calculatePersonTax()` | Core — always runs |
| Low Income Tax Offset (LITO) | `calculatePersonTax()` | Core — always runs |
| Medicare Levy (2%) | `calculatePersonTax()` | Core — always runs |
| Medicare Levy Surcharge (if no PHI) | `calculatePersonTax()` | Core — always runs |
| Standard SG contributions (12%) | `projectSuper()` | Core super accumulation |
| Super accumulation to retirement | `projectSuper()` | Core retirement projection |
| ABP minimum drawdown | `abpMinDrawdown()` | Core retirement drawdown |
| Retirement drawdown + depletion age | `retirementDrawdown()` | Core retirement projection |
| Transfer Balance Cap detection | `retirementDrawdown()` | Cap is a threshold check, not a strategy |
| Age Pension estimate | `estimateAgePension()` | Basic entitlement check |
| HECS/HELP compulsory repayment | `calculatePersonTax()` | Standard — many users have HECS |
| Property cashflow (gross rent, expenses, interest) | `propertyAnnualCashflow()` | Basic property modelling |
| Negative gearing income tax benefit | `calculateHouseholdTax()` | Standard IP feature |
| Net worth trajectory (deterministic) | `netWorthTrajectory()` | Base case only for free |
| FIRE number, Coast FIRE | `fireCalc()` | Deterministic, no simulation |

### PREMIUM (advanced — gate for free users)

| Calculation | Location | Gating approach | Refactor needed? |
|---|---|---|---|
| **Monte Carlo simulation** | `runMonteCarlo()` called in `runEngine()` | Skip the call (pass `monteCarlo: null`) for free users; hide MonteCarloCard | No — function is fully standalone |
| **Scenario comparison (side-by-side)** | `ScenarioComparisonRow` component | Hide component for free users | No |
| **Custom scenario assumptions** | `useCustomAssumptions` toggle in AnalysisScreen | Hide toggle; free users get default values only | No |
| **Division 293** | `calculatePersonTax()` opts.superConcessional | Calculation runs silently; suppress D293 line in warnings, AnalysisSummary, ActionPlan | No refactor — UI suppression only |
| **Carry-forward concessional cap** | `calculateHouseholdTax()` + Stage 5 fields | Hide Stage 5 input fields; calc runs at 0 | No |
| **Franking credits** | `calculatePersonTax()` + Stage 5 fields | Hide Stage 5 input fields; warn UI suppressed | No |
| **Debt recycling toggle** | `netWorthTrajectory()` + Stage 4 toggle | Hide the toggle for free users; `debtRecycling` stays false | No |
| **TTR (Transition to Retirement)** | DOES NOT EXIST | Stub "Coming soon" behind premium gate | N/A — not built |
| **CGT event optimisation** | `lifeEvents.js` — IP sale event fields (`heldOver12Months`, `costBase`) | Hide these life event types for free users; the CGT discount in life events is the full extent of what exists | No |
| **Strategy Centre ("Improve my plan")** | DOES NOT EXIST | Build in Phase 4 behind premium gate | Full build required |
| **PDF export** | `window.print()` exists, print CSS is in place | Gate the Print button for free users | No |
| **CSV export** | DOES NOT EXIST | Stub "Coming soon" | Full build required (Phase 6) |
| **Snapshots / version history** | DOES NOT EXIST | Stub "Coming soon" | Full build required (post-launch) |
| **CSV import** | DOES NOT EXIST | Stub "Coming soon" | Full build required (post-launch) |

### Summary: nothing needs engine refactoring before gating
Every premium calculation can be gated at the UI layer. The engine runs correctly regardless; premium features are either separate functions (`runMonteCarlo`), separate components (`ScenarioComparisonRow`), UI-only inputs (carry-forward fields, franking credit fields, debt recycling toggle), or don't exist yet. **No engine refactoring is needed before Phase 2 gating.**

---

## Part 3 — Gap List

The following do not exist and must be built for the freemium model to work:

| Gap | Needed for | Phase |
|---|---|---|
| Supabase `subscriptions` table | Entitlement checking | 1 |
| `trial_started_at` timestamp on user | Trial tracking | 1 |
| `stripe_customer_id` on user | Stripe sync | 1 |
| `useEntitlement()` React hook | All gates | 1 |
| `PremiumGate` component | Wrapping premium UI | 2 |
| Trial activation modal | UX for first gate click | 2 |
| Gate click analytics logging | Learning which feature drives upgrades | 2 |
| Trial banner (countdown) | Retention during trial | 2 |
| Stripe Checkout session creation | Billing | 3 |
| Stripe webhook handler (Vercel function) | Subscription sync | 3 |
| Pricing page / upgrade modal | Conversion | 3 |
| Strategy Centre engine + UI | Premium feature | 4 |
| TTR stub (coming soon) | Premium feature list | 2 |
| Plausible analytics script | Analytics | 5 |
| PDF export polish | Premium feature | 6 |
| CSV export | Premium feature | 6 |

---

## Part 4 — Architectural Recommendations (fix before gating)

These are cheap to fix now and expensive later.

### 1 — Remove dead localStorage code (15 minutes)
`loadData()`, `saveData()`, `loadStage()`, `saveStage()` in App.jsx are never called. The main component uses Supabase exclusively. Remove all four functions and the `STORAGE_KEY` constant. This avoids confusion when reading the file during Phase 2.

### 2 — Split App.jsx before adding more (2-3 hours)
App.jsx is ~3050 lines. Adding entitlement logic, gate components, trial banners, and a Strategy Centre will push it past 4000 lines. Before Phase 2, extract:
- `AnalysisScreen` and all its sub-components → `src/AnalysisStage.jsx`
- `ActionPlanScreen` → `src/ActionPlanStage.jsx`
- `LoginScreen` → `src/LandingPage.jsx`

Stage forms (1, 4, 5) and the main `IndependentMeans()` function stay in `App.jsx`.

### 3 — Use a `subscriptions` table, not a column on `plans`
Stripe webhooks update subscription status asynchronously. Storing it in a separate `subscriptions` table (one-to-one with auth.users) keeps the plans table clean and mirrors Stripe's own data model. Schema:

```sql
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null unique,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text not null default 'free',  -- free | trialing | active | past_due | canceled
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table subscriptions enable row level security;
create policy "Users read own subscription" on subscriptions
  for select using (auth.uid() = user_id);
-- Server-side only for writes (Stripe webhook uses service_role key, not anon)
```

### 4 — `useEntitlement()` hook design
A single hook that all gate components use. Must be synchronous after initial load (no waterfalls per gate render):

```js
// src/useEntitlement.js
export function useEntitlement() {
  // Returns { isPremium, isTrial, trialEndsAt, isLoading, activateTrial }
  // Reads from Supabase subscriptions table once on mount, caches in state
  // activateTrial() creates the subscriptions row with trial dates
}
```

### 5 — `runEngine` should skip Monte Carlo for free users
Monte Carlo runs 1000 iterations client-side. For free users who never see the result, this is wasted CPU. Pass an `isPremium` flag to `runEngine` or call `runMonteCarlo` separately only when premium:

```js
const engine = runEngine(derivedData);
const monteCarlo = isPremium ? runMonteCarlo(derivedData, assumptions) : null;
```

This is a 5-line change; do it in Phase 2 when gating is added.

---

## Part 5 — Phase-by-Phase File Change Map

### Phase 1 — Supabase schema + entitlement layer

**Goal:** Database ready for billing; `useEntitlement` hook works; no UI changes yet.

| File | Change |
|---|---|
| Supabase SQL | Create `subscriptions` table (schema above) |
| `src/useEntitlement.js` | New file — hook: reads subscription row, exposes isPremium, isTrial, trialEndsAt, activateTrial() |
| `src/supabase.js` | No change |
| `src/App.jsx` | Import and call useEntitlement() in IndependentMeans(); pass entitlement down as props or via a lightweight context |

### Phase 2 — Gate UI + Free Tier Shape (COMPLETE)

**Goal:** Premium features visually gated; trial activates on first gate click; gate clicks logged; free tier shape confirmed.

| File | Status |
|---|---|
| `src/PremiumGate.jsx` | DONE — blur overlay gate; activateTrial on click; logs gate click |
| `src/TrialBanner.jsx` | DONE — countdown banner |
| `src/TrialModal.jsx` | DONE — trial activation modal |
| `src/analytics.js` | DONE — logGateClick shared utility (Plausible + DEV console) |
| `src/App.jsx` | DONE — gated "+ New plan" button in header; all stage gates wired |
| `src/AnalysisStage.jsx` | DONE — Projection/Probability view toggle on chart (locked for free users, fires gate for PROBABILITY_VIEW); no blur blur gate on MonteCarloCard |
| `src/ActionPlanStage.jsx` | DONE — skipMonteCarlo wired to PROBABILITY_VIEW entitlement |
| `src/freetier.test.js` | DONE — 26 integration tests verifying free happy path and gate boundaries |

**Premium gate list (by featureId):**
- `probability_view` — Probability view toggle on NetWorthChart; also gates Monte Carlo engine call
- `scenario_comparison` — ScenarioComparisonRow
- `custom_assumptions` — Custom assumptions toggle in AnalysisScreen
- `debt_recycling` — Debt recycling toggle in Stage 4
- `carry_forward_cap` — Carry-forward fields in Stage 5
- `franking_credits` — Franking credits fields in Stage 5
- `pdf_export` — Print / Save PDF button
- `multi_plan` — "+ New plan" button in header; DB enforced by UNIQUE constraint on plans.user_id
- `strategy_centre` — Strategy Centre tab (Phase 4, stub for now)
- `csv_export` — CSV export (Phase 6, stub)

**Free tier confirmed free:**
- Full profile entry across all 7 stages (income, expenses, super, assets, debts, property, family)
- Complete base-case projection (net worth trajectory, retirement balance, FIRE number, cashflow, super balance, debt-free date)
- All charts in deterministic mode
- Basic AU tax: income tax brackets, LITO, Medicare, Medicare Levy Surcharge, HECS, Age Pension estimate
- Super accumulation, retirement drawdown, ABP minimum drawdown, Transfer Balance Cap check
- Negative gearing income tax benefit
- Saving and loading the single plan (Supabase plans table)

### Phase 3 — Locked-State UI, Paywall Modal & Improve My Plan (COMPLETE)

**Goal:** Every gate opens the same upgrade modal; "Improve my plan" shows personalised opportunities.

| File | Status |
|---|---|
| `src/analytics.js` | DONE — added trackGateClick(feature, context) stub |
| `src/UpgradeModal.jsx` | DONE — shared modal; feature-specific headline + body copy for all 10 premium features; "Start 14-day free trial" / "Upgrade to Premium" primary CTA; "See Premium" secondary stub |
| `src/PremiumGate.jsx` | DONE — redesigned: children visible at full opacity, non-interactive (pointer-events:none); gold "Premium" badge top-right; transparent click-capture overlay; opens UpgradeModal |
| `src/opportunityEngine.js` | DONE — 6 pure detectors: salary sacrifice, carry-forward cap, mortgage acceleration, retirement age optimisation, Monte Carlo analysis, debt recycling; each returns personalised description using user's numbers |
| `src/ImprovePlanModal.jsx` | DONE — shows all opportunities with gold tick (matched) / dash (not matched); free users see trial CTA; premium/trial users see Strategy Centre stub |
| `src/AnalysisStage.jsx` | DONE — "Improve your plan" Pine banner after MetricsRow shows matched count; all inline locks (custom assumptions, probability view toggle) route through UpgradeModal |
| `src/opportunityEngine.test.js` | DONE — 33 unit tests covering all 6 detectors (matched, not-matched, edge cases) plus runOpportunityDetectors |

### Phase 4 — Triggered 14-Day Trial (COMPLETE)

**Goal:** Frictionless trial start from any gate; instant action completion; TrialBanner confirmation; one trial per account ever.

| File | Status |
|---|---|
| `supabase-add-trial-feature.sql` | DONE — `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS trial_started_from_feature text` |
| `src/analytics.js` | DONE — added `trackTrialStarted(featureId)` and `trackTrialExpired()` stubs |
| `src/useEntitlement.js` | DONE — `activateTrial(fromFeature)` stores feature + calls `trackTrialStarted`; `useEffect` emits `trackTrialExpired()` once per session on expiry detection; `hadTrial` flag exposed |
| `src/UpgradeModal.jsx` | DONE — passes `featureId` to `activateTrial`; removed TrialModal fallback; calls `onTrialStarted?.()` after close |
| `src/ImprovePlanModal.jsx` | DONE — passes `"improve_my_plan"` to `activateTrial`; removed TrialModal |
| `src/TrialBanner.jsx` | DONE — redesigned: "Premium trial — X days left"; pine green normal, gold tones (≤3 days); "Upgrade" link stub |
| `src/PremiumGate.jsx` | DONE — removed unused `showTrialBadge` state; TrialBanner in header handles confirmation |
| `src/AnalysisStage.jsx` | DONE — removed TrialModal import and `showProbTrialModal`/`showCustomTrialModal` states; prob-view `onTrialStarted` flips chart view immediately |
| `src/trial.test.js` | DONE — 25 tests: one-trial guard, hadTrial flag, entitlement flips, expiry at read time, artefact survival, Plausible stubs |

**Acceptance criteria met:**
- Clicking any gate as a free user starts the trial and immediately performs the gated action
- Second trial cannot be started (DB status stays "trialing"; client guard: `status !== "free"`)
- Expired-trial data is locked but intact (tierOf computes expiry at read time; plan data never mutated)
- TrialBanner turns gold at ≤3 days; "Upgrade" link stubs Phase 5

**Test count after Phase 4:** 142 passing

### Phase 5 — Stripe Billing (COMPLETE)

**Goal:** Full subscription billing — A$15/mo and A$149/yr plans via Stripe Checkout; webhooks keep DB in sync; Customer Portal for self-service; trial-to-paid transition; analytics events.

| File | Status |
|---|---|
| `src/stripeWebhookHandlers.js` | DONE — pure handler logic (no Stripe/Supabase imports); `mapStripeStatus()` + `handleWebhookEvent()` covering all 4 event types; extracted for Vitest |
| `api/stripe-checkout.js` | DONE — JWT-verified; planType → price ID resolved server-side from env vars (never exposed to client); looks up existing stripe_customer_id from DB; returns hosted Checkout URL |
| `api/stripe-webhook.js` | DONE — raw body buffering (`bodyParser: false`); Stripe signature verification; delegates to `handleWebhookEvent`; always returns 200 |
| `api/stripe-portal.js` | DONE — JWT-verified; looks up stripe_customer_id from DB (never trusted from client); creates billing portal session; returns URL |
| `src/analytics.js` | DONE — added `trackCheckoutStarted`, `trackSubscriptionActivated`, `trackSubscriptionCancelled` |
| `src/entitlement.js` | DONE — `past_due` now maps to active tier (grace period for payment update) |
| `src/useEntitlement.js` | DONE — added `stripeCustomerId`, `refreshSubscription`, `openPortal` |
| `src/PricingPage.jsx` | DONE — full-screen overlay; monthly/annual toggle (annual default, "Save 17%" gold badge); feature comparison table; calls `/api/stripe-checkout` |
| `src/UpgradeModal.jsx` | DONE — added `onOpenPricing` prop; "See Premium" routes to PricingPage |
| `src/TrialBanner.jsx` | DONE — added `onOpenPricing` prop; "Upgrade" button opens PricingPage |
| `src/PremiumGate.jsx` | DONE — reads `openPricing` from EntitlementContext; passes to UpgradeModal |
| `src/AnalysisStage.jsx` | DONE — reads `openPricing` from context; passes to all UpgradeModal renders |
| `src/App.jsx` | DONE — `showPricing` state; checkout-success handler (refreshes subscription, fires trackSubscriptionActivated); `openPricing` on EntitlementContext; Billing/Upgrade header buttons; PricingPage render |
| `src/LandingPage.jsx` | DONE — pricing section: Free vs Premium two-column grid, annual as recommended with "Save 17%", monthly alternative |
| `src/stripe.test.js` | DONE — 24 unit tests: mapStripeStatus, all 4 webhook event types, missing metadata, idempotency, unknown events, tier transitions |
| `.env.example` | DONE — all required environment variables documented with comments |
| `STRIPE_SETUP.md` | DONE — exact step-by-step manual checklist: products/prices, webhook endpoint, Customer Portal, API keys, Vercel env vars, end-to-end test steps, going-live instructions |

**Security constraints applied:**
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_ANNUAL` — all server-side only, never VITE_ prefixed
- JWT verification on every Stripe API endpoint
- `stripe_customer_id` looked up server-side from DB, never trusted from client request body
- Price IDs resolved server-side from env vars; client sends only `planType: 'monthly'|'annual'`

**Test count after Phase 5:** 166 passing (142 + 24 new)

### Phase 6 — Gate Analytics + Admin Dashboard (COMPLETE)

**Goal:** Self-hosted analytics pipeline to learn which locked features drive upgrade intent.

| File | Status |
|---|---|
| `supabase-events-table.sql` | DONE — `events` table; RLS enabled; service_role writes only |
| `api/track.js` | DONE — JWT-verified event writer; strips numeric values from context (no financial data in payloads) |
| `src/adminStatsQueries.js` | DONE — pure query functions: `gateClicksByFeature`, `funnelStats`, `trialConversionByFeature` |
| `api/admin-stats.js` | DONE — JWT-verified; admin email gate; three actions: gate_clicks, funnel, trial_conversion |
| `src/analytics.js` | DONE — full rewrite; 11 tracked events; fire-and-forget POST to `/api/track`; Plausible sync; 14 unit tests |
| `src/AdminDashboard.jsx` | DONE — email-gated full-screen overlay; date range picker; Funnel, Gate Clicks, Trial Conversion panels |
| `src/AnalysisStage.jsx` | DONE — added `trackImprovePlanOpened`, `trackMonteCarloRun`, `trackScenarioCreated` |
| `src/ImprovePlanModal.jsx` | DONE — added `trackOpportunityViewed` on mount |
| `src/StrategyCentre.jsx` | DONE — added `trackStrategyModuleUsed(activeId)` on tab change |
| `src/App.jsx` | DONE — Admin button (admin-email-gated); `showAdmin` state; AdminDashboard render |
| `public/privacy.html` | DONE — analytics disclosure added |
| `src/analytics.test.js` | DONE — 14 tests; fire-and-forget flush helper |
| `src/adminStats.test.js` | DONE — 16 tests; thenable Supabase mock chain |

**Test count after Phase 6:** 223 passing

### Phase 7 — AFSL Language Review + Font Sizes (COMPLETE)

**Goal:** Remove regulated-advice language, plan/opportunity framing, and small font sizes on desktop.

| File | Changes |
|---|---|
| `src/App.jsx` | Stage 7 label "Plan" → "Summary"; "Your Plan Summary" → "Your Financial Summary" |
| `src/AnalysisStage.jsx` | "Improve your plan" banner → "Explore your scenarios" |
| `src/ImprovePlanModal.jsx` | "Your plan opportunities" → "Modelling insights"; "opportunities detected" → "scenarios identified" |
| `src/PricingPage.jsx` | "Full 8-stage financial plan" → "Full 8-stage financial model" |
| `src/UpgradeModal.jsx` | Scenario language, "second financial model", "strengthen your financial picture" |
| `src/LandingPage.jsx` | "financial data inputs"; "1 saved model"; pricing bullet font 12→13 |
| `src/AssetStage.jsx` | Emergency fund hint: "recommended" → "typically" |
| `src/ActionPlanStage.jsx` | Font sizes: summary card label 10→11; section header 10→11; category heading 11→12 |

### Phase 8 — PDF and CSV export (Partially complete)

**Goal:** Premium export features working.

| Feature | Status |
|---|---|
| PDF export (print) | DONE — gated behind `pdf_export`; `window.print()` button in ActionPlanStage |
| CSV export | STUB — listed as "coming soon" in Premium features; not built (post-launch) |

### Phase 9 — Strategy Centre (COMPLETE)

**Goal:** Per-opportunity interactive modelling inside "Explore your scenarios".

| File | Status |
|---|---|
| `src/StrategyCentre.jsx` | DONE — three interactive modules: Salary Sacrifice, Retirement Age, Extra Mortgage Repayments; real-time slider → engine recalc → stat card delta display; AFSL Disclaimer component on each module |
| `src/opportunityEngine.js` | DONE — 6 pure detectors; determines which modules are shown based on user's data |
| `src/ImprovePlanModal.jsx` | DONE — "Open Strategy Centre" CTA routes premium/trial users to StrategyCentre |
| `src/AnalysisStage.jsx` | DONE — "Explore your scenarios" banner; Strategy Centre tab gated with `strategy_centre` featureId |

### Phase 10 — End-to-End QA Pass (COMPLETE)

**Goal:** Final pre-launch quality gate. All four canonical journeys verified; em dash sweep;
AFSL compliance check; launch checklist produced.

| Deliverable | Status |
|---|---|
| Em dash sweep (all user-facing copy) | DONE — 80+ em dashes replaced across 12 source files |
| AFSL language review | DONE — "plan", "improve", "recommended", "opportunities" removed from regulated contexts |
| Font size audit | DONE — small labels bumped to readable sizes on desktop |
| Unit test suite | DONE — 223 tests, all passing |
| `LAUNCH_CHECKLIST.md` | DONE — manual pre-launch steps + 4 canonical journey test scripts |
| `IMPLEMENTATION_PLAN.md` updated | DONE — all phases marked complete |

**Post-launch roadmap (does not block launch):**
- CSV export (featureId: `csv_export`)
- Snapshots / version history
- CSV import
- Multi-plan support (requires schema migration)
- Apple Sign In (requires Apple developer account)
- App.jsx split if file grows beyond 4000 lines

---

## Notes on AFSL compliance for premium features

The Strategy Centre copy must maintain the same general-information-only framing used everywhere else:
- Language: "Based on inputs entered, there appears to be..." not "You should..."
- Every strategy card ends with an adviser referral line
- No specific product recommendations (no "use fund X", no "buy ETF Y")
- TTR stub: if we describe TTR, it must be framed as "a general strategy type available to some Australians — speak with a licensed adviser"

The Stripe pricing page and upgrade modal must not describe Independent Means as financial advice. The subscription is for access to a planning tool, not advice.
