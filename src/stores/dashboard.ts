"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Dashboard, Session, Section, Period } from "@/lib/types";
type State = {
  session: Session | null;
  snapshots: Record<string, Dashboard>;
  section: Section;
  period: Period;
  team: string;
  project: string;
  search: string;
  favorites: string[];
  patch: (
    state: Partial<Omit<State, "patch" | "remember" | "clear" | "favorite">>,
  ) => void;
  remember: (key: string, data: Dashboard) => void;
  clear: () => void;
  favorite: (id: string) => void;
};
const initial = {
  session: null,
  snapshots: {},
  section: "overview" as Section,
  period: 7 as Period,
  team: "",
  project: "",
  search: "",
  favorites: [] as string[],
};
export const useDashboard = create<State>()(
  persist(
    (set) => ({
      ...initial,
      patch: (state) => set(state),
      remember: (key, data) =>
        set((state) => {
          const previous = state.snapshots[key];
          if (
            previous === data ||
            (previous && JSON.stringify(previous) === JSON.stringify(data))
          )
            return state;
          // Preserve component references when only the fetch timestamp changed.
          const projects = data.projects.map((p) => {
            const old = previous?.projects.find((item) => item.id === p.id);
            return old && JSON.stringify(old) === JSON.stringify(p) ? old : p;
          });
          return {
            snapshots: Object.fromEntries([
              ...Object.entries(state.snapshots)
                .filter(([k]) => k !== key)
                .slice(-3),
              [key, { ...data, projects }],
            ]),
          };
        }),
      favorite: (id) =>
        set((state) => ({
          favorites: state.favorites.includes(id)
            ? state.favorites.filter((i) => i !== id)
            : [...state.favorites, id],
        })),
      clear: () => set(initial),
    }),
    {
      name: "centralita-v1",
      version: 1,
      partialize: (state) => ({
        session: state.session,
        snapshots: state.snapshots,
        section: state.section,
        period: state.period,
        team: state.team,
        favorites: state.favorites,
      }),
      skipHydration: true,
    },
  ),
);

export async function clearPrivateCache() {
  useDashboard.getState().clear();
  useDashboard.persist.clearStorage();
  if (typeof window !== "undefined") {
    localStorage.removeItem("centralita-theme");
    if ("caches" in window)
      await Promise.all(
        (await caches.keys())
          .filter((k) => k.startsWith("centralita-"))
          .map((k) => caches.delete(k)),
      );
  }
}
