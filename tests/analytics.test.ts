import test from "node:test";
import assert from "node:assert/strict";
import {
  dateRange,
  metrics,
  trafficSeries,
  mapConcurrent,
} from "../src/lib/analytics";
test("7 días abarcan siete fechas UTC, incluso junto a cambios de hora", () => {
  const range = dateRange(7, new Date("2026-10-28T18:42:00Z"));
  assert.equal(range.since, "2026-10-22T00:00:00.000Z");
  assert.equal(range.until, "2026-10-28T18:42:00.000Z");
});
test("24 horas agrupan 24 cubos horarios", () => {
  assert.equal(
    dateRange(1, new Date("2026-10-28T18:42:00Z")).since,
    "2026-10-27T19:00:00.000Z",
  );
});
test("los formatos desconocidos no se convierten en falsos ceros", () => {
  for (const input of [
    null,
    {},
    { visitors: 10 },
    { visitors: 10, pageviews: "2" },
    { visitors: NaN, pageviews: 0 },
  ])
    assert.throws(() => metrics(input));
  assert.deepEqual(metrics({ visitors: 0, pageviews: 0 }), {
    visitors: 0,
    pageviews: 0,
  });
  assert.throws(() => trafficSeries({}));
});
test("ordenar la serie no cambia sus métricas", () => {
  assert.deepEqual(
    trafficSeries([
      { timestamp: "2026-10-28T00:00:00Z", pageviews: 8, visitors: 3 },
      { timestamp: "2026-10-27T00:00:00Z", pageviews: 4, visitors: 2 },
    ]).map((p) => p.pageviews),
    [4, 8],
  );
});
test("las consultas independientes son concurrentes y respetan el límite", async () => {
  let active = 0;
  let max = 0;
  const result = await mapConcurrent([1, 2, 3, 4, 5], 2, async (n) => {
    active++;
    max = Math.max(max, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    return n * 2;
  });
  assert.equal(max, 2);
  assert.deepEqual(result, [2, 4, 6, 8, 10]);
});
