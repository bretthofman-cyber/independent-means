/**
 * Phase 7 — analytics module unit tests.
 *
 * Verifies that each tracking function fires a POST to /api/track with the
 * correct event_name, feature, and context payload. The Supabase session and
 * fetch are both mocked — no network calls made.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock supabase before importing analytics (which imports supabase)
vi.mock("./supabase.js", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: "test-token-abc" } },
      }),
    },
  },
}));

// Mock fetch globally
const fetchMock = vi.fn().mockResolvedValue({ ok: true });
vi.stubGlobal("fetch", fetchMock);

import {
  trackGateClick,
  trackTrialStarted,
  trackTrialExpired,
  trackCheckoutStarted,
  trackSubscriptionActivated,
  trackSubscriptionCancelled,
  trackImprovePlanOpened,
  trackOpportunityViewed,
  trackScenarioCreated,
  trackMonteCarloRun,
  trackStrategyModuleUsed,
} from "./analytics.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function lastPost() {
  const call = fetchMock.mock.calls.at(-1);
  if (!call) return null;
  const [url, opts] = call;
  return { url, body: JSON.parse(opts.body), headers: opts.headers };
}

async function flush() {
  // Let fire-and-forget promises settle
  await new Promise(r => setTimeout(r, 0));
}

beforeEach(() => {
  fetchMock.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("trackGateClick", () => {
  it("posts gate_clicked with feature and source", async () => {
    trackGateClick("probability_view", { source: "toggle" });
    await flush();
    const p = lastPost();
    expect(p.url).toBe("/api/track");
    expect(p.body.event_name).toBe("gate_clicked");
    expect(p.body.feature).toBe("probability_view");
    expect(p.body.context.source).toBe("toggle");
    expect(p.headers["Authorization"]).toBe("Bearer test-token-abc");
  });

  it("defaults source to 'gate' when context is empty", async () => {
    trackGateClick("pdf_export");
    await flush();
    expect(lastPost().body.context.source).toBe("gate");
  });
});

describe("trackTrialStarted", () => {
  it("posts trial_started with the originating feature", async () => {
    trackTrialStarted("carry_forward_cap");
    await flush();
    const p = lastPost();
    expect(p.body.event_name).toBe("trial_started");
    expect(p.body.feature).toBe("carry_forward_cap");
  });
});

describe("trackTrialExpired", () => {
  it("posts trial_expired with no feature", async () => {
    trackTrialExpired();
    await flush();
    const p = lastPost();
    expect(p.body.event_name).toBe("trial_expired");
    expect(p.body.feature).toBeNull();
  });
});

describe("trackCheckoutStarted", () => {
  it("posts checkout_started with plan in context", async () => {
    trackCheckoutStarted("annual");
    await flush();
    const p = lastPost();
    expect(p.body.event_name).toBe("checkout_started");
    expect(p.body.context.plan).toBe("annual");
  });
});

describe("trackSubscriptionActivated", () => {
  it("posts subscription_activated with plan", async () => {
    trackSubscriptionActivated("monthly");
    await flush();
    const p = lastPost();
    expect(p.body.event_name).toBe("subscription_activated");
    expect(p.body.context.plan).toBe("monthly");
  });

  it("falls back to 'unknown' when planType is undefined", async () => {
    trackSubscriptionActivated(undefined);
    await flush();
    expect(lastPost().body.context.plan).toBe("unknown");
  });
});

describe("trackSubscriptionCancelled", () => {
  it("posts subscription_cancelled", async () => {
    trackSubscriptionCancelled();
    await flush();
    expect(lastPost().body.event_name).toBe("subscription_cancelled");
  });
});

describe("trackImprovePlanOpened", () => {
  it("posts improve_plan_opened with matched_count", async () => {
    trackImprovePlanOpened(3);
    await flush();
    const p = lastPost();
    expect(p.body.event_name).toBe("improve_plan_opened");
    expect(p.body.context.matched_count).toBe(3);
  });
});

describe("trackOpportunityViewed", () => {
  it("posts opportunity_viewed with matched_ids array", async () => {
    trackOpportunityViewed(["salary_sacrifice", "monte_carlo"]);
    await flush();
    const p = lastPost();
    expect(p.body.event_name).toBe("opportunity_viewed");
    expect(p.body.context.matched_ids).toEqual(["salary_sacrifice", "monte_carlo"]);
  });
});

describe("trackScenarioCreated", () => {
  it("posts scenario_created with scenario key", async () => {
    trackScenarioCreated("conservative");
    await flush();
    const p = lastPost();
    expect(p.body.event_name).toBe("scenario_created");
    expect(p.body.context.scenario).toBe("conservative");
  });
});

describe("trackMonteCarloRun", () => {
  it("posts monte_carlo_run", async () => {
    trackMonteCarloRun();
    await flush();
    expect(lastPost().body.event_name).toBe("monte_carlo_run");
  });
});

describe("trackStrategyModuleUsed", () => {
  it("posts strategy_module_used with module id as feature", async () => {
    trackStrategyModuleUsed("salary_sacrifice");
    await flush();
    const p = lastPost();
    expect(p.body.event_name).toBe("strategy_module_used");
    expect(p.body.feature).toBe("salary_sacrifice");
  });
});

describe("silent failure", () => {
  it("does not throw when fetch rejects", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    expect(() => trackGateClick("debt_recycling")).not.toThrow();
    await flush();
  });
});
