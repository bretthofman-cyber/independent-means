/**
 * Phase 7 — admin stats query unit tests.
 *
 * Tests gateClicksByFeature, funnelStats, and trialConversionByFeature
 * with a mocked Supabase client. Verifies aggregation logic and correct
 * DB fields queried.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  gateClicksByFeature,
  funnelStats,
  trialConversionByFeature,
} from "./adminStatsQueries.js";

// ── Mock Supabase builder ─────────────────────────────────────────────────────

function makeClient(rows) {
  const resolved = { data: rows, error: null };
  const chain = {
    select:  vi.fn().mockReturnThis(),
    eq:      vi.fn().mockReturnThis(),
    in:      vi.fn().mockReturnThis(),
    not:     vi.fn().mockReturnThis(),
    gte:     vi.fn().mockReturnThis(),
    lte:     vi.fn().mockReturnThis(),
    // Make the chain thenable so any terminal method resolves correctly
    then:    (onFulfilled) => Promise.resolve(resolved).then(onFulfilled),
    catch:   (onRejected)  => Promise.resolve(resolved).catch(onRejected),
  };
  return {
    from: vi.fn().mockReturnValue(chain),
    _chain: chain,
  };
}

const RANGE = { from: "2026-01-01T00:00:00.000Z", to: "2026-01-31T23:59:59.000Z" };

// ── gateClicksByFeature ───────────────────────────────────────────────────────

describe("gateClicksByFeature", () => {
  it("counts and sorts by feature descending", async () => {
    const client = makeClient([
      { feature: "probability_view" },
      { feature: "probability_view" },
      { feature: "scenario_comparison" },
      { feature: "probability_view" },
      { feature: "pdf_export" },
    ]);
    const result = await gateClicksByFeature(client, RANGE);
    expect(result[0]).toEqual({ feature: "probability_view",   count: 3 });
    expect(result[1]).toEqual({ feature: "scenario_comparison", count: 1 });
    expect(result[2]).toEqual({ feature: "pdf_export",          count: 1 });
  });

  it("returns empty array when no events", async () => {
    const client = makeClient([]);
    const result = await gateClicksByFeature(client, RANGE);
    expect(result).toEqual([]);
  });

  it("labels null feature as (unknown)", async () => {
    const client = makeClient([{ feature: null }]);
    const result = await gateClicksByFeature(client, RANGE);
    expect(result[0].feature).toBe("(unknown)");
  });

  it("queries the events table filtered by event_name", async () => {
    const client = makeClient([]);
    await gateClicksByFeature(client, RANGE);
    expect(client.from).toHaveBeenCalledWith("events");
    expect(client._chain.eq).toHaveBeenCalledWith("event_name", "gate_clicked");
  });

  it("applies date range filters", async () => {
    const client = makeClient([]);
    await gateClicksByFeature(client, RANGE);
    expect(client._chain.gte).toHaveBeenCalledWith("created_at", RANGE.from);
    expect(client._chain.lte).toHaveBeenCalledWith("created_at", RANGE.to);
  });

  it("throws when supabase returns an error", async () => {
    const err = new Error("db error");
    const errChain = {
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      gte:    vi.fn().mockReturnThis(),
      lte:    vi.fn().mockReturnThis(),
      then:   (onFulfilled) => Promise.resolve({ data: null, error: err }).then(onFulfilled),
      catch:  (onRejected)  => Promise.resolve({ data: null, error: err }).catch(onRejected),
    };
    const client = { from: vi.fn().mockReturnValue(errChain) };
    await expect(gateClicksByFeature(client, RANGE)).rejects.toThrow("db error");
  });
});

// ── funnelStats ───────────────────────────────────────────────────────────────

describe("funnelStats", () => {
  it("counts distinct users at each funnel stage", async () => {
    const client = makeClient([
      { user_id: "u1", event_name: "gate_clicked" },
      { user_id: "u2", event_name: "gate_clicked" },
      { user_id: "u3", event_name: "gate_clicked" },
      { user_id: "u1", event_name: "trial_started" },
      { user_id: "u2", event_name: "trial_started" },
      { user_id: "u1", event_name: "subscription_activated" },
    ]);
    const result = await funnelStats(client, RANGE);
    expect(result.gate_users).toBe(3);
    expect(result.trial_users).toBe(2);
    expect(result.paid_users).toBe(1);
  });

  it("deduplicates users who appear multiple times at the same stage", async () => {
    const client = makeClient([
      { user_id: "u1", event_name: "gate_clicked" },
      { user_id: "u1", event_name: "gate_clicked" }, // duplicate
      { user_id: "u1", event_name: "trial_started" },
    ]);
    const result = await funnelStats(client, RANGE);
    expect(result.gate_users).toBe(1);
    expect(result.trial_users).toBe(1);
  });

  it("computes gate_to_trial conversion rate", async () => {
    const client = makeClient([
      { user_id: "u1", event_name: "gate_clicked" },
      { user_id: "u2", event_name: "gate_clicked" },
      { user_id: "u1", event_name: "trial_started" },
    ]);
    const result = await funnelStats(client, RANGE);
    expect(result.gate_to_trial).toBe(50);
  });

  it("computes trial_to_paid conversion rate", async () => {
    const client = makeClient([
      { user_id: "u1", event_name: "trial_started" },
      { user_id: "u2", event_name: "trial_started" },
      { user_id: "u3", event_name: "trial_started" },
      { user_id: "u2", event_name: "trial_started" }, // duplicate
      { user_id: "u1", event_name: "subscription_activated" },
    ]);
    const result = await funnelStats(client, RANGE);
    expect(result.trial_to_paid).toBeCloseTo(33.3, 0);
  });

  it("returns 0 rates when no events", async () => {
    const client = makeClient([]);
    const result = await funnelStats(client, RANGE);
    expect(result.gate_to_trial).toBe(0);
    expect(result.trial_to_paid).toBe(0);
    expect(result.gate_users).toBe(0);
  });
});

// ── trialConversionByFeature ──────────────────────────────────────────────────

describe("trialConversionByFeature", () => {
  it("groups by originating feature with trial and paid counts", async () => {
    const client = makeClient([
      { trial_started_from_feature: "probability_view", status: "active" },
      { trial_started_from_feature: "probability_view", status: "trialing" },
      { trial_started_from_feature: "probability_view", status: "canceled" },
      { trial_started_from_feature: "scenario_comparison", status: "active" },
    ]);
    const result = await trialConversionByFeature(client);
    const pv = result.find(r => r.feature === "probability_view");
    expect(pv.trial_count).toBe(3);
    expect(pv.paid_count).toBe(1);
    expect(pv.conversion_rate).toBeCloseTo(33.3, 0);
    const sc = result.find(r => r.feature === "scenario_comparison");
    expect(sc.trial_count).toBe(1);
    expect(sc.paid_count).toBe(1);
    expect(sc.conversion_rate).toBe(100);
  });

  it("counts past_due as paid (grace period)", async () => {
    const client = makeClient([
      { trial_started_from_feature: "debt_recycling", status: "past_due" },
    ]);
    const result = await trialConversionByFeature(client);
    expect(result[0].paid_count).toBe(1);
  });

  it("sorts by trial_count descending", async () => {
    const client = makeClient([
      { trial_started_from_feature: "pdf_export",    status: "trialing" },
      { trial_started_from_feature: "probability_view", status: "active" },
      { trial_started_from_feature: "probability_view", status: "active" },
      { trial_started_from_feature: "probability_view", status: "trialing" },
    ]);
    const result = await trialConversionByFeature(client);
    expect(result[0].feature).toBe("probability_view");
  });

  it("queries subscriptions table excluding null feature", async () => {
    const client = makeClient([]);
    await trialConversionByFeature(client);
    expect(client.from).toHaveBeenCalledWith("subscriptions");
    expect(client._chain.not).toHaveBeenCalledWith("trial_started_from_feature", "is", null);
  });

  it("returns empty array when no trial data", async () => {
    const client = makeClient([]);
    const result = await trialConversionByFeature(client);
    expect(result).toEqual([]);
  });
});
