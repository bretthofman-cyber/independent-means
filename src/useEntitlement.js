import { useState, useEffect, useCallback, createContext } from "react";
import { supabase } from "./supabase.js";

export const EntitlementContext = createContext({
  isPremium: false, isTrial: false, trialDaysLeft: 0,
  trialEndsAt: null, isLoading: false, status: "free",
  activateTrial: async () => {},
});

const TRIAL_DAYS = 14;

export function useEntitlement(userId) {
  const [status, setStatus]           = useState("free");
  const [trialEndsAt, setTrialEndsAt] = useState(null);
  const [isLoading, setIsLoading]     = useState(true);

  useEffect(() => {
    if (!userId) {
      setStatus("free");
      setTrialEndsAt(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    supabase
      .from("subscriptions")
      .select("status, trial_ends_at")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data: row }) => {
        if (row) {
          setStatus(row.status);
          setTrialEndsAt(row.trial_ends_at ? new Date(row.trial_ends_at) : null);
        } else {
          setStatus("free");
          setTrialEndsAt(null);
        }
        setIsLoading(false);
      })
      .catch(() => {
        // On network/RLS error default to free — don't block the app
        setStatus("free");
        setIsLoading(false);
      });
  }, [userId]);

  const activateTrial = useCallback(async () => {
    if (!userId || status !== "free") return;
    const now      = new Date();
    const trialEnd = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    const { data: row } = await supabase
      .from("subscriptions")
      .insert({
        user_id:          userId,
        status:           "trialing",
        trial_started_at: now.toISOString(),
        trial_ends_at:    trialEnd.toISOString(),
      })
      .select("status, trial_ends_at")
      .single();
    if (row) {
      setStatus(row.status);
      setTrialEndsAt(new Date(row.trial_ends_at));
    }
  }, [userId, status]);

  const now         = new Date();
  const trialActive = status === "trialing" && trialEndsAt && trialEndsAt > now;
  const isPremium   = trialActive || status === "active";
  const isTrial     = trialActive;
  const trialDaysLeft = trialEndsAt
    ? Math.max(0, Math.ceil((trialEndsAt - now) / (1000 * 60 * 60 * 24)))
    : 0;

  return { isPremium, isTrial, trialDaysLeft, trialEndsAt, isLoading, status, activateTrial };
}
