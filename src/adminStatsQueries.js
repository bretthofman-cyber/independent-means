/**
 * Pure query functions for the admin analytics dashboard.
 * Each takes a Supabase client (service_role) and a date range.
 * Extracted from the API handler so they can be unit-tested with a mock client.
 */

export async function gateClicksByFeature(supabase, { from, to }) {
  const { data, error } = await supabase
    .from("events")
    .select("feature")
    .eq("event_name", "gate_clicked")
    .gte("created_at", from)
    .lte("created_at", to);

  if (error) throw error;

  const counts = {};
  for (const row of data ?? []) {
    const key = row.feature ?? "(unknown)";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.entries(counts)
    .map(([feature, count]) => ({ feature, count }))
    .sort((a, b) => b.count - a.count);
}

export async function funnelStats(supabase, { from, to }) {
  const { data, error } = await supabase
    .from("events")
    .select("user_id, event_name")
    .in("event_name", ["gate_clicked", "trial_started", "subscription_activated"])
    .gte("created_at", from)
    .lte("created_at", to);

  if (error) throw error;

  const sets = {
    gate_clicked:           new Set(),
    trial_started:          new Set(),
    subscription_activated: new Set(),
  };
  for (const row of data ?? []) {
    sets[row.event_name]?.add(row.user_id);
  }

  const gateN  = sets.gate_clicked.size;
  const trialN = sets.trial_started.size;
  const paidN  = sets.subscription_activated.size;

  return {
    gate_users:     gateN,
    trial_users:    trialN,
    paid_users:     paidN,
    gate_to_trial:  gateN  > 0 ? +((trialN / gateN)  * 100).toFixed(1) : 0,
    trial_to_paid:  trialN > 0 ? +((paidN  / trialN) * 100).toFixed(1) : 0,
  };
}

export async function trialConversionByFeature(supabase) {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("trial_started_from_feature, status")
    .not("trial_started_from_feature", "is", null);

  if (error) throw error;

  const byFeature = {};
  for (const row of data ?? []) {
    const f = row.trial_started_from_feature;
    if (!byFeature[f]) byFeature[f] = { feature: f, trial_count: 0, paid_count: 0 };
    byFeature[f].trial_count++;
    if (row.status === "active" || row.status === "past_due") byFeature[f].paid_count++;
  }

  return Object.values(byFeature)
    .map(r => ({
      ...r,
      conversion_rate: r.trial_count > 0
        ? +((r.paid_count / r.trial_count) * 100).toFixed(1)
        : 0,
    }))
    .sort((a, b) => b.trial_count - a.trial_count);
}
