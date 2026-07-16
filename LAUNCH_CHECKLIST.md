# Independent Means — Launch Checklist

This document covers every manual step required before going live, the four canonical
QA journeys, and the post-launch roadmap of "coming soon" stubs.

---

## 1. Stripe: Switch to Live Mode

These steps must be completed in the Stripe **live** (not test/sandbox) dashboard.

- [ ] In Stripe dashboard, toggle from **Test mode** → **Live mode** (top-left switch)
- [ ] Create product "Independent Means Premium" in live mode
  - Price 1: A$15.00 / month, recurring, AUD → copy `price_live_monthly_...`
  - Price 2: A$149.00 / year, recurring, AUD → copy `price_live_annual_...`
- [ ] Create live webhook endpoint: `https://www.independentmeans.com.au/api/stripe-webhook`
  - Events: `checkout.session.completed`, `customer.subscription.updated`,
    `customer.subscription.deleted`, `invoice.payment_failed`
  - Copy the live **Signing secret** (`whsec_live_...`)
- [ ] Enable **Customer Portal** in live mode (Billing → Customer Portal → Activate)
- [ ] Copy live **Secret key** (`sk_live_...`)

### Update Vercel environment variables (Production)

| Variable | Value |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_live_...` (live signing secret) |
| `STRIPE_PRICE_MONTHLY` | `price_live_monthly_...` |
| `STRIPE_PRICE_ANNUAL` | `price_live_annual_...` |

- [ ] Redeploy Vercel after saving all four variables
- [ ] Confirm `ADMIN_EMAIL` and `VITE_ADMIN_EMAIL` are set to `brett.hofman@gmail.com`

### Post-go-live Stripe smoke test

- [ ] Sign in with a real account (not the admin account)
- [ ] Click any premium gate → start trial → confirm TrialBanner appears
- [ ] Click "Upgrade" in TrialBanner → Pricing Page opens
- [ ] Click "Get annual Premium" → redirected to Stripe Checkout (live cards)
- [ ] Complete checkout with a real card → redirected back to the app
- [ ] Confirm tier shows Premium (Monte Carlo visible, no trial banner)
- [ ] Open Billing → Customer Portal → cancel subscription
- [ ] Confirm tier reverts to Free after webhook fires (may take 30–60 s)
- [ ] Immediately issue a refund in the Stripe dashboard for the test charge

---

## 2. Supabase: Confirm Migrations Are Applied (Production)

Both migrations must have been run against the **production** Supabase project.
If they were only run in development, run them now via the SQL editor.

- [ ] `supabase-events-table.sql` — creates `events` table with RLS enabled
- [ ] `supabase-add-trial-feature.sql` — adds `trial_started_from_feature` column to `subscriptions`

Verify in Supabase Table Editor that both `events` and `subscriptions.trial_started_from_feature` exist.

---

## 3. Test Account Cleanup

- [ ] Delete or reset any Stripe test-mode customers created during sandbox testing
- [ ] In Supabase, confirm no test-user rows remain in `subscriptions` with `status = 'active'`
  from sandbox payment testing (these will have `stripe_customer_id` values starting with `cus_test_...`)

---

## 4. Manual QA: Four Canonical Journeys

Run these journeys against **production** (`https://www.independentmeans.com.au`) before
announcing the launch. Use an incognito window for each journey to avoid cached state.

---

### Journey A — Free User: Full Profile → Projections → Charts → Save

**Goal:** Confirm zero paywall interruptions on the free path; confirm locked toggles
are visible but non-activatable without starting a trial.

1. Sign in with Google (new or existing free account)
2. **Stage 1 — Household Profile:** Enter name, age 38, partner age 36, has partner yes,
   1 dependant, employed, retirement age 65, life expectancy 90, owns with mortgage
3. **Stage 2 — Income & Cashflow:** Enter gross income $120,000, partner income $80,000,
   monthly expenses $5,500, savings $1,500/month
4. **Stage 3 — Assets & Savings:** Add shares $50,000, emergency fund $25,000
5. **Stage 4 — Property & Debt:** PPOR value $900,000, mortgage $550,000, rate 6.2%,
   loan type P&I, tenure 30 years, start year 2020
6. **Stage 5 — Superannuation:** Super $85,000, partner super $65,000, SG 12%,
   target retirement spending $65,000
7. **Stage 6 — Analysis:** Confirm the following are FREE and visible:
   - [ ] Scenario selector (base / conservative / aggressive) — selectable
   - [ ] Net worth trajectory chart — visible, base scenario only
   - [ ] Metric cards (FIRE number, projected super, estimated tax, debt-free year)
   - [ ] Warnings panel
   - [ ] Assumptions register
8. **Locked features visible but gated:**
   - [ ] Probability view toggle shows gold Premium badge, clicking opens UpgradeModal
   - [ ] "Scenario comparison" gate visible below chart
   - [ ] "Custom assumptions" toggle shows Premium badge
   - [ ] Carry-forward and franking credit fields show PremiumGate overlay
   - [ ] Debt recycling toggle shows PremiumGate overlay
   - [ ] PDF export button shows PremiumGate gate
9. **Stage 7 — Financial Summary:** Confirm action plan items are visible
10. **Save:** Navigate away and back — confirm data is restored from Supabase

**Pass criteria:** All 8 stages complete with no unexpected gate interruptions on free fields.
Locked features show gate overlays. Plan saves and restores.

---

### Journey B — Conversion: Free → Trial → Stripe → Premium

**Goal:** Confirm trial activates on first gate click, gated action completes instantly,
Strategy Centre is reachable, and Stripe checkout upgrades tier to Premium.

1. Sign in with a second test account (not your admin account)
2. Enter enough data for a meaningful projection (at least Stage 1, 2, 5)
3. **Gate click → trial start:**
   - Click the Probability view toggle (locked)
   - UpgradeModal opens — confirm feature-specific headline ("See how likely your scenario
     is to succeed")
   - Click "Start 14-day free trial"
   - [ ] TrialBanner appears at top: "Premium trial: X days left"
   - [ ] Probability view immediately activates — chart switches to fan view
   - [ ] Monte Carlo % card is visible
4. **Explore your scenarios banner:**
   - [ ] "Explore your scenarios" Pine banner appears below metrics
   - Click it → ImprovePlanModal opens with "Modelling insights" heading
   - [ ] Matched opportunities show gold ticks; unmatched show dashes
   - Click "Open Strategy Centre" → StrategyCentre modal opens
   - [ ] At least one strategy tab is visible (Salary sacrifice, Retirement age, or Extra mortgage)
   - [ ] Moving a slider updates the stat cards in real time
5. **Upgrade to Premium:**
   - Click "Upgrade" in TrialBanner → PricingPage opens
   - [ ] Annual selected by default, "Save 17%" badge visible
   - [ ] Monthly toggle works; price updates
   - Click "Get annual Premium" → Stripe Checkout opens (sandbox mode: use card `4242 4242 4242 4242`)
   - Complete checkout → redirected back to app with `?checkout=success`
   - [ ] TrialBanner is gone
   - [ ] "Billing" button appears in header
   - [ ] Monte Carlo, Scenario comparison, PDF export all remain accessible
6. **Billing portal:**
   - Click "Billing" in header → Stripe Customer Portal opens
   - [ ] Current subscription visible with correct price

**Pass criteria:** Trial activates on first gate, action completes instantly, Stripe
checkout succeeds, tier reads Premium post-checkout.

---

### Journey C — Trial Expiry: Tier Reverts to Free

**Goal:** Confirm expired-trial users see locked premium features but retain full base-case access.

> This journey requires either (a) manually setting `trial_ends_at` to a past timestamp
> in the `subscriptions` table for a test user, or (b) waiting for a real trial to expire.
> In Supabase SQL editor: `UPDATE subscriptions SET trial_ends_at = now() - interval '1 hour' WHERE user_id = '<test-user-uuid>';`

1. After the update, reload the app for the affected user
2. **Confirm tier is FREE:**
   - [ ] TrialBanner is gone
   - [ ] Probability view toggle shows Premium badge (locked again)
   - [ ] Monte Carlo card is not visible
   - [ ] "Explore your scenarios" banner is gone (or if shown, clicking re-opens UpgradeModal with "Upgrade to Premium" CTA, not trial CTA)
3. **Confirm base plan is fully usable:**
   - [ ] All 8 stages are editable
   - [ ] Net worth chart shows (base scenario)
   - [ ] FIRE number, projected super, debt-free date, estimated tax all visible
   - [ ] Warnings panel visible
   - [ ] Data saves correctly
4. **Second trial guard:**
   - Click any premium gate → UpgradeModal opens
   - [ ] CTA reads "Upgrade to Premium" (not "Start free trial") because `hadTrial = true`

**Pass criteria:** Expired-trial user sees Free tier; base plan fully functional; no trial restart available.

---

### Journey D — Cancellation: Premium → Cancelled → Free

**Goal:** Confirm cancellation via Customer Portal results in the same locked state as Journey C.

> Use the Journey B Stripe test subscription (sandbox mode). Webhook must fire to update DB.

1. As a Premium user, click "Billing" → Stripe Customer Portal
2. Click "Cancel plan" → confirm cancellation (immediate or end of period)
3. For sandbox, cancellation fires immediately and sends `customer.subscription.deleted`
4. Reload the app
5. **Confirm behaviour matches Journey C (trial expiry):**
   - [ ] TrialBanner is gone
   - [ ] Premium features are locked (same gate overlays as free user)
   - [ ] "Upgrade to Premium" CTA (no trial offer — `hadTrial = true`)
   - [ ] Base plan: all 8 stages accessible, charts visible, data intact
6. In Supabase, confirm `subscriptions.status = 'canceled'` for the user

**Pass criteria:** Cancellation downgrade matches trial expiry behaviour; all base-case
data is intact; no data loss.

---

## 5. Copy & Compliance Final Check

- [x] Em dashes: removed from all user-facing copy (Phase 8 QA sweep)
- [x] "Plan" as regulated document: replaced with "model", "scenario", "summary" throughout
- [x] "Improve my plan": replaced with "Explore your scenarios"
- [x] "Opportunities": replaced with "Modelling insights" / "scenarios"
- [x] "Recommended": replaced with "typically" in hint text
- [x] "Financial planning inputs": replaced with "financial data inputs" in privacy policy
- [ ] Confirm every screen shows the standard AFSL disclaimer footer
- [ ] Confirm StrategyCentre Disclaimer components are present on all three strategy modules
- [ ] Confirm ActionPlan AFSL notice is visible: "calculations and factual notes, not personal financial advice"

---

## 6. Post-Launch Roadmap ("Coming Soon" Stubs)

The following features are intentionally gated with "coming soon" labels. They are visible to
Premium users but not functional. Build them in post-launch releases.

| Feature | Gate ID | Status |
|---|---|---|
| CSV export | `csv_export` | Stub — "coming soon" in Premium feature list |
| TTR (Transition to Retirement) strategy | — | Described in warnings; no interactive module |
| Snapshots / version history | — | Not built; listed as post-launch in Phase 9 |
| CSV import | — | Not built; listed as post-launch in Phase 9 |
| Multi-plan support | `multi_plan` | Gate visible; schema is single-plan only |
| Apple Sign In | — | Not built; requires Apple developer account |

---

## 7. Monitoring After Launch

- Check Stripe Dashboard → Webhooks → recent deliveries: all should return 200
- Check Vercel → Functions logs: no unhandled exceptions in `stripe-webhook.js`
- Check Supabase Table Editor → `subscriptions`: new rows appear on checkout
- Check Supabase Table Editor → `events`: gate clicks start flowing after real users arrive
- Check Admin Dashboard (sign in as `brett.hofman@gmail.com` → Admin button): gate clicks
  and funnel data appear within 24 hours of first real users
