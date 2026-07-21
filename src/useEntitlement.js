import { useState, useEffect, useCallback, useRef, createContext } from "react";
import { supabase } from "./supabase.js"; // DB queries only — auth token supplied via getToken param
import { tierOf, can as _can, limit as _limit } from "./entitlement.js";
import { LIMITS } from "./features.js";
import { trackTrialStarted, trackTrialExpired } from "./analytics.js";

export const EntitlementContext = createContext({
  isPremium: false, isTrial: false, trialDaysLeft: 0,
  trialEndsAt: null, isLoading: false, status: "free", tier: "free",
  hadTrial: false, stripeCustomerId: null,
  can: () => false,
  limit: (resource) => LIMITS.free[resource],
  activateTrial: async (_fromFeature) => {},
  refreshSubscription: async () => {},
  openPortal: async () => {},
});

const TRIAL_DAYS = 14;

async function fetchSubscription(userId) {
  const { data: row, error } = await supabase
    .from("subscriptions")
    .select("status, trial_ends_at, stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return row ?? null;
}

export function useEntitlement(userId, getToken) {
  const [status,           setStatus]           = useState("free");
  const [trialEndsAt,      setTrialEndsAt]      = useState(null);
  const [stripeCustomerId, setStripeCustomerId] = useState(null);
  const [isLoading,        setIsLoading]        = useState(true);
  const expiredFiredRef = useRef(false);

  const applyRow = useCallback((row) => {
    if (row) {
      setStatus(row.status);
      setTrialEndsAt(row.trial_ends_at ? new Date(row.trial_ends_at) : null);
      setStripeCustomerId(row.stripe_customer_id ?? null);
    } else {
      setStatus("free");
      setTrialEndsAt(null);
      setStripeCustomerId(null);
    }
  }, []);

  useEffect(() => {
    if (!userId) {
      setStatus("free");
      setTrialEndsAt(null);
      setStripeCustomerId(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    fetchSubscription(userId)
      .then(applyRow)
      .catch(err => console.error("[fetchSubscription]", err.message))
      .finally(() => setIsLoading(false));
  }, [userId, applyRow]);

  const now         = new Date();
  const tier        = tierOf({ status, trialEndsAt });
  const isPremium   = tier !== "free";
  const isTrial     = tier === "trialing";
  const hadTrial    = status !== "free";
  const trialDaysLeft = trialEndsAt
    ? Math.max(0, Math.ceil((trialEndsAt - now) / (1000 * 60 * 60 * 24)))
    : 0;

  useEffect(() => {
    if (
      !isLoading &&
      status === "trialing" &&
      trialEndsAt &&
      trialEndsAt <= new Date() &&
      !expiredFiredRef.current
    ) {
      expiredFiredRef.current = true;
      trackTrialExpired();
    }
  }, [isLoading, status, trialEndsAt]);

  const activateTrial = useCallback(async (fromFeature = null) => {
    if (!userId || status !== "free") return;
    const start    = new Date();
    const trialEnd = new Date(start.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    try {
      const { data: row, error } = await supabase
        .from("subscriptions")
        .insert({
          user_id:                    userId,
          status:                     "trialing",
          trial_started_at:           start.toISOString(),
          trial_ends_at:              trialEnd.toISOString(),
          trial_started_from_feature: fromFeature,
        })
        .select("status, trial_ends_at, stripe_customer_id")
        .single();
      if (error) throw error;
      applyRow(row);
      trackTrialStarted(fromFeature);
    } catch (err) {
      console.error("[activateTrial]", err.message);
    }
  }, [userId, status, applyRow]);

  const refreshSubscription = useCallback(async () => {
    if (!userId) return;
    try {
      const row = await fetchSubscription(userId);
      applyRow(row);
    } catch (err) {
      console.error("[refreshSubscription]", err.message);
    }
  }, [userId, applyRow]);

  const openPortal = useCallback(async () => {
    if (!getToken) return;
    const token = await getToken();
    if (!token) return;
    try {
      const res = await fetch("/api/stripe-portal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ returnUrl: window.location.origin }),
      });
      const { url, error } = await res.json();
      if (error) throw new Error(error);
      window.location.href = url;
    } catch (err) {
      console.error("[openPortal]", err.message);
    }
  }, [getToken]);

  const can   = (feature)  => _can(tier, feature);
  const limit = (resource) => _limit(tier, resource);

  return {
    isPremium, isTrial, trialDaysLeft, trialEndsAt,
    isLoading, status, tier, hadTrial, stripeCustomerId,
    can, limit,
    activateTrial, refreshSubscription, openPortal,
  };
}
