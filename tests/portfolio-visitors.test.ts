import test from "node:test";
import assert from "node:assert/strict";
import { isPortfolioProject } from "../src/lib/portfolio-project";
import { portfolioVisitorsSchema } from "../src/lib/portfolio-visitors";

test("portfolio detection excludes lookalike domains and other projects", () => {
  assert.ok(isPortfolioProject({ name: "portfolio-v3", domain: null }));
  assert.ok(isPortfolioProject({ name: "renamed", domain: "portfolio.adrianrocafulldev.es" }));
  assert.equal(isPortfolioProject({ name: "other", domain: "adrianrocafulldev.es.evil.test" }), false);
});

test("visitor response rejects missing totals and preserves cached report until sign-out", async () => {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: globalThis.localStorage } });
  const { useDashboard, clearPrivateCache } = await import("../src/stores/dashboard");
  const report = { totals: { pageviews: 3, visitors: 1, new: 1, returning: 0 }, devices: [], visitors: [], measuredSince: null, since: "2026-11-11T12:00:00.000Z", until: "2026-11-18T12:00:00.000Z", page: 0 };
  assert.ok(portfolioVisitorsSchema.safeParse(report).success);
  assert.equal(portfolioVisitorsSchema.safeParse({ ...report, totals: {} }).success, false);
  assert.equal(portfolioVisitorsSchema.safeParse({ ...report, totals: { ...report.totals, visitors: -1 } }).success, false);
  useDashboard.getState().patch({ visitorSnapshots: { test: report } });
  assert.equal(useDashboard.getState().visitorSnapshots.test, report);
  await clearPrivateCache();
  assert.deepEqual(useDashboard.getState().visitorSnapshots, {});
  assert.equal(storage.get("centralita-v1"), undefined);
});
