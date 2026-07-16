/**
 * Analytics module — single interface for all product events.
 *
 * Transport: POST /api/track (fire-and-forget, never blocks UI).
 * To swap to PostHog or Plausible Cloud: replace _post() only.
 * All callers remain unchanged.
 *
 * Privacy rule: no financial values in context payloads — feature names and
 * categorical counts only.
 */

import { supabase } from "./supabase.js";

function _post(eventName, feature, context) {
  // Synchronous layers — fire immediately so tests can assert without awaiting
  if (import.meta.env.DEV) {
    console.info(`[analytics] ${eventName}`, { feature, context });
  }
  if (typeof window !== "undefined" && typeof window.plausible === "function") {
    window.plausible(eventName, { props: { feature: feature ?? undefined, ...context } });
  }

  // Async DB write — fire-and-forget, never blocks the UI
  supabase.auth.getSession().then(({ data: { session } }) => {
    const token = session?.access_token;
    if (!token) return;
    fetch("/api/track", {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ event_name: eventName, feature, context }),
    }).catch(() => {});
  }).catch(() => {});
}

// ── Existing events (call-site signatures unchanged) ─────────────────────────

export function logGateClick(featureId) {
  trackGateClick(featureId, {});
}

export function trackGateClick(feature, context = {}) {
  _post("gate_clicked", feature, { source: context.source ?? "gate", ...context });
}

export function trackTrialStarted(featureId) {
  _post("trial_started", featureId, {});
}

export function trackTrialExpired() {
  _post("trial_expired", null, {});
}

export function trackCheckoutStarted(planType) {
  _post("checkout_started", null, { plan: planType });
}

export function trackSubscriptionActivated(planType) {
  _post("subscription_activated", null, { plan: planType ?? "unknown" });
}

export function trackSubscriptionCancelled() {
  _post("subscription_cancelled", null, {});
}

// ── New events (Phase 7) ─────────────────────────────────────────────────────

export function trackImprovePlanOpened(matchedCount) {
  _post("improve_plan_opened", null, { matched_count: matchedCount });
}

export function trackOpportunityViewed(matchedIds) {
  _post("opportunity_viewed", null, { matched_ids: matchedIds });
}

export function trackScenarioCreated(scenario) {
  _post("scenario_created", null, { scenario });
}

export function trackMonteCarloRun() {
  _post("monte_carlo_run", null, {});
}

export function trackStrategyModuleUsed(moduleId) {
  _post("strategy_module_used", moduleId, {});
}
