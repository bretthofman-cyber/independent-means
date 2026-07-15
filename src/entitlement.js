import { LIMITS, PREMIUM_FEATURES } from "./features.js";

export function tierOf({ status, trialEndsAt }) {
  if (status === "active") return "active";
  if (status === "trialing" && trialEndsAt && new Date(trialEndsAt) > new Date()) return "trialing";
  return "free";
}

export function can(tier, feature) {
  if (tier === "free") return !PREMIUM_FEATURES.has(feature);
  return true;
}

export function limit(tier, resource) {
  const row = LIMITS[tier] ?? LIMITS.free;
  return row[resource] ?? LIMITS.free[resource];
}
