import test from "node:test";
import assert from "node:assert/strict";
import { createJSONStorage } from "zustand/middleware";
import type { Dashboard } from "../src/lib/types";
test("la caché no vuelve a notificar al recordar el mismo snapshot y conserva los proyectos sin cambios", async () => {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: globalThis.localStorage },
  });
  const { useDashboard, clearPrivateCache } = await import(
    "../src/stores/dashboard"
  );
  useDashboard.persist.setOptions({
    storage: createJSONStorage(() => ({
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => {
        storage.set(key, value);
      },
      removeItem: (key) => {
        storage.delete(key);
      },
    })),
  });
  const state = useDashboard.getState();
  const snapshot: Dashboard = {
    projects: [
      {
        id: "prj_1",
        name: "uno",
        domain: null,
        framework: null,
        deploymentId: null,
        deploymentState: "NONE",
        updatedAt: 0,
        analyticsEnabled: false,
        analytics: null,
        analyticsError: null,
      },
    ],
    fetchedAt: "2026-10-28T18:00:00Z",
    since: "2026-10-22",
    until: "2026-10-28",
    teamId: "team_1",
    teamSlug: "team",
  };
  state.remember("user1:team1:7", snapshot);
  let updates = 0;
  const unsubscribe = useDashboard.subscribe(() => updates++);
  state.remember(
    "user1:team1:7",
    useDashboard.getState().snapshots["user1:team1:7"],
  );
  state.remember("user1:team1:7", JSON.parse(JSON.stringify(snapshot)));
  assert.equal(
    updates,
    0,
    "los datos usados como fallback no deben provocar un bucle de renderizado",
  );
  const previousProject =
    useDashboard.getState().snapshots["user1:team1:7"].projects[0];
  state.remember("user1:team1:7", {
    ...snapshot,
    fetchedAt: "2026-10-28T18:01:00Z",
  });
  assert.equal(
    useDashboard.getState().snapshots["user1:team1:7"].projects[0],
    previousProject,
  );
  for (let i = 0; i < 6; i++)
    state.remember(`user${i}:team1:7`, { ...snapshot, fetchedAt: String(i) });
  assert.equal(Object.keys(useDashboard.getState().snapshots).length, 4);
  assert.equal(
    useDashboard.getState().snapshots["other-user:team1:7"],
    undefined,
  );
  unsubscribe();
  const users = {
    users: [],
    total: 0,
    newUsers: { day: 0, week: 0, month: 0 },
    filteredTotal: 0,
    page: 0,
    pageSize: 25,
    environment: "development" as const,
    fetchedAt: "2026-10-30",
  };
  state.rememberUsers("user1:/api/users", users);
  const previousUsers =
    useDashboard.getState().userSnapshots["user1:/api/users"].users;
  state.rememberUsers("user1:/api/users", {
    ...users,
    fetchedAt: "2026-10-31",
  });
  assert.equal(
    useDashboard.getState().userSnapshots["user1:/api/users"].users,
    previousUsers,
  );
  for (let i = 0; i < 6; i++)
    state.rememberUsers(`user1:/api/users?page=${i}`, users);
  assert.equal(Object.keys(useDashboard.getState().userSnapshots).length, 4);
  assert.equal(
    useDashboard.getState().userSnapshots["other-user:/api/users"],
    undefined,
  );
  await clearPrivateCache();
  assert.deepEqual(useDashboard.getState().userSnapshots, {});
  assert.deepEqual(useDashboard.getState().snapshots, {});
  assert.equal(useDashboard.getState().session, null);
  assert.equal(storage.size, 0);
});
