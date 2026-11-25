"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PortfolioVisitorsReport } from "@/lib/portfolio-visitors";
import { DEFAULT_LEAD_TOWNS, type Lead, type LeadRange, type LeadScan } from "@/lib/leads";
import type {
  Acquisition,
  SignupSummary,
  Dashboard,
  Session,
  Section,
  Period,
  UsersResult,
  ClerkProjectsResult,
  Transcript,
} from "@/lib/types";
type State = {
  session: Session | null;
  snapshots: Record<string, Dashboard>;
  acquisitionSnapshots: Record<string, Acquisition>;
  visitorSnapshots: Record<string, PortfolioVisitorsReport>;
  signupSnapshots: Record<string, SignupSummary>;
  userSnapshots: Record<string, UsersResult>;
  clerkProjects: Record<string, ClerkProjectsResult>;
  usersProject: string;
  section: Section;
  period: Period;
  team: string;
  project: string;
  search: string;
  favorites: string[];
  transcripts: Transcript[];
  leads: Lead[];
  leadRejected: string[];
  leadScan: LeadScan | null;
  leadTowns: string[];
  leadRange: LeadRange;
  leadGroups: string[];
  patch: (
    state: Partial<
      Omit<
        State,
        | "patch"
        | "remember"
        | "rememberUsers"
        | "rememberClerkProjects"
        | "clear"
        | "favorite"
        | "addTranscript"
        | "removeTranscript"
        | "addLeads"
        | "updateLead"
        | "rejectLeads"
      >
    >,
  ) => void;
  remember: (key: string, data: Dashboard) => void;
  rememberUsers: (key: string, data: UsersResult) => void;
  rememberClerkProjects: (key: string, data: ClerkProjectsResult) => void;
  clear: () => void;
  favorite: (id: string) => void;
  addTranscript: (transcript: Transcript) => void;
  removeTranscript: (id: string) => void;
  addLeads: (leads: Lead[]) => void;
  updateLead: (id: string, patch: Partial<Lead>) => void;
  rejectLeads: (ids: string[]) => void;
};
const initial = {
  session: null,
  snapshots: {},
  acquisitionSnapshots: {},
  visitorSnapshots: {},
  signupSnapshots: {},
  userSnapshots: {},
  clerkProjects: {},
  usersProject: "",
  section: "overview" as Section,
  period: 7 as Period,
  team: "",
  project: "",
  search: "",
  favorites: [] as string[],
  transcripts: [] as Transcript[],
  leads: [] as Lead[],
  leadRejected: [] as string[],
  leadScan: null as LeadScan | null,
  leadTowns: DEFAULT_LEAD_TOWNS,
  leadRange: "m3" as LeadRange,
  leadGroups: [] as string[],
};
export const useDashboard = create<State>()(
  persist(
    (set) => ({
      ...initial,
      patch: (state) => set(state),
      rememberClerkProjects: (key, data) =>
        set((state) => {
          if (JSON.stringify(state.clerkProjects[key]) === JSON.stringify(data))
            return state;
          return {
            clerkProjects: Object.fromEntries([
              ...Object.entries(state.clerkProjects)
                .filter(([k]) => k !== key)
                .slice(-3),
              [key, data],
            ]),
          };
        }),
      rememberUsers: (key, data) =>
        set((state) => {
          const previous = state.userSnapshots[key];
          if (
            previous === data ||
            JSON.stringify(previous) === JSON.stringify(data)
          )
            return state;
          const oldUsers = new Map(
            previous?.users.map((user) => [user.id, user]),
          );
          const users =
            JSON.stringify(previous?.users) === JSON.stringify(data.users)
              ? previous!.users
              : data.users.map((user) => {
                  const old = oldUsers.get(user.id);
                  return old && JSON.stringify(old) === JSON.stringify(user)
                    ? old
                    : user;
                });
          return {
            userSnapshots: Object.fromEntries([
              ...Object.entries(state.userSnapshots)
                .filter(([k]) => k !== key)
                .slice(-19),
              [key, { ...data, users }],
            ]),
          };
        }),
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
      addTranscript: (transcript) =>
        set((state) => ({
          transcripts: [
            transcript,
            ...state.transcripts.filter((t) => t.id !== transcript.id),
          ].slice(0, 300),
        })),
      removeTranscript: (id) =>
        set((state) => ({
          transcripts: state.transcripts.filter((t) => t.id !== id),
        })),
      addLeads: (leads) =>
        set((state) => {
          const known = new Set(state.leads.map((l) => l.id));
          return { leads: [...leads.filter((l) => !known.has(l.id)), ...state.leads].slice(0, 1000) };
        }),
      updateLead: (id, patch) =>
        set((state) => ({
          leads: state.leads.map((l) => (l.id === id ? { ...l, ...patch } : l)),
        })),
      rejectLeads: (ids) =>
        set((state) => {
          const drop = new Set(ids);
          return {
            leads: state.leads.filter((l) => !drop.has(l.id)),
            leadRejected: [...ids, ...state.leadRejected.filter((id) => !drop.has(id))].slice(0, 4000),
          };
        }),
      clear: () => set(initial),
    }),
    {
      name: "centralita-v1",
      version: 1,
      partialize: (state) => ({
        session: state.session,
        snapshots: state.snapshots,
        acquisitionSnapshots: state.acquisitionSnapshots,
        visitorSnapshots: state.visitorSnapshots,
        signupSnapshots: state.signupSnapshots,
        userSnapshots: state.userSnapshots,
        clerkProjects: state.clerkProjects,
        usersProject: state.usersProject,
        section: state.section,
        period: state.period,
        team: state.team,
        favorites: state.favorites,
        transcripts: state.transcripts,
        leads: state.leads,
        leadRejected: state.leadRejected,
        leadScan: state.leadScan,
        leadTowns: state.leadTowns,
        leadRange: state.leadRange,
        leadGroups: state.leadGroups,
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
