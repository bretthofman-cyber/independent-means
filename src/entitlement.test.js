import { describe, it, expect } from "vitest";
import { tierOf, can, limit } from "./entitlement.js";
import { FEATURES } from "./features.js";

// ── tierOf ────────────────────────────────────────────────────────────────────

describe("tierOf", () => {
  it("returns 'free' when status is free", () => {
    expect(tierOf({ status: "free", trialEndsAt: null })).toBe("free");
  });

  it("returns 'active' when status is active", () => {
    expect(tierOf({ status: "active", trialEndsAt: null })).toBe("active");
  });

  it("returns 'trialing' when status is trialing and trial has not expired", () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    expect(tierOf({ status: "trialing", trialEndsAt: future })).toBe("trialing");
  });

  it("returns 'free' when trialing but trial has expired", () => {
    const past = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
    expect(tierOf({ status: "trialing", trialEndsAt: past })).toBe("free");
  });

  it("returns 'free' when trialing but trialEndsAt is null (no trial date)", () => {
    expect(tierOf({ status: "trialing", trialEndsAt: null })).toBe("free");
  });

  it("does not rely on a cron — expiry is computed at call time", () => {
    const justExpired = new Date(Date.now() - 1);
    expect(tierOf({ status: "trialing", trialEndsAt: justExpired })).toBe("free");
    const notYetExpired = new Date(Date.now() + 60_000);
    expect(tierOf({ status: "trialing", trialEndsAt: notYetExpired })).toBe("trialing");
  });
});

// ── can ───────────────────────────────────────────────────────────────────────

describe("can", () => {
  const allFeatures = Object.values(FEATURES);

  it("free tier: blocks every premium feature", () => {
    allFeatures.forEach(f => {
      expect(can("free", f)).toBe(false);
    });
  });

  it("trialing tier: allows every premium feature", () => {
    allFeatures.forEach(f => {
      expect(can("trialing", f)).toBe(true);
    });
  });

  it("active tier: allows every premium feature", () => {
    allFeatures.forEach(f => {
      expect(can("active", f)).toBe(true);
    });
  });
});

// ── limit ─────────────────────────────────────────────────────────────────────

describe("limit", () => {
  it("free tier: maxPlans is 1", () => {
    expect(limit("free", "maxPlans")).toBe(1);
  });

  it("free tier: maxScenariosPerPlan is 1", () => {
    expect(limit("free", "maxScenariosPerPlan")).toBe(1);
  });

  it("trialing tier: maxPlans is unlimited", () => {
    expect(limit("trialing", "maxPlans")).toBe(Infinity);
  });

  it("active tier: maxPlans is unlimited", () => {
    expect(limit("active", "maxPlans")).toBe(Infinity);
  });

  it("active tier: maxScenariosPerPlan is unlimited", () => {
    expect(limit("active", "maxScenariosPerPlan")).toBe(Infinity);
  });
});
