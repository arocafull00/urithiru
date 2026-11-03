export type Period = 1 | 7 | 30;
export type Section =
  "overview" | "projects" | "users" | "logs" | "errors" | "settings";
export type Metrics = { pageviews: number; visitors: number };
export type TrafficPoint = Metrics & { timestamp: string };
export type Analytics = Metrics & { series: TrafficPoint[] };
export type Project = {
  id: string;
  name: string;
  domain: string | null;
  framework: string | null;
  deploymentId: string | null;
  deploymentState: string;
  updatedAt: number;
  analyticsEnabled: boolean;
  analytics: Analytics | null;
  analyticsError: string | null;
};
export type Dashboard = {
  projects: Project[];
  fetchedAt: string;
  since: string;
  until: string;
  teamId: string;
  teamSlug: string;
};
export type Breakdown = Metrics & { label: string };
export type Details = {
  pages: Breakdown[];
  domains: Breakdown[];
  referrers: Breakdown[];
  countries: Breakdown[];
  devices: Breakdown[];
};
export type LogProvider = "vercel" | "sentry" | "supabase";
export type LogEntry = {
  id: string;
  provider: LogProvider;
  projectId: string;
  projectName: string;
  timestamp: number;
  level: string;
  message: string;
  path: string;
  statusCode: number | null;
  source: string;
  deploymentId: string;
  url: string | null;
  count: number | null;
};
export type LogResult = {
  logs: LogEntry[];
  issues: { projectId: string; message: string }[];
  mode: "live" | "history";
  fetchedAt: string;
  truncated: boolean;
};
export type Session = {
  userId: string;
  name: string;
  teams: { id: string; name: string; slug: string }[];
  defaultTeamId: string;
  vercel: boolean;
  database: boolean;
  drains: boolean;
  sentry: boolean;
  supabase: boolean;
  diariamenteBilling: boolean;
};

export type RegisteredUser = {
  id: string;
  name: string;
  email: string | null;
  emailVerified: boolean;
  createdAt: number;
  lastSignInAt: number | null;
};
export type BillingAccess =
  | "free"
  | "lifetime"
  | "clinic"
  | "subscribed"
  | "trial"
  | "trial_available"
  | "pricing_pending"
  | "expired";
export type UserBilling = {
  id: string;
  role: "patient" | "psychologist" | "clinic" | "admin" | null;
  access: BillingAccess;
  lifetimeAccess: boolean;
  trialEndsAt: string | null;
  subscriptionStatus: string | null;
  clinic: {
    id: string;
    name: string;
    monthlyPriceCents: number | null;
    psychologistCount: number;
  } | null;
};
export type BillingUpdate =
  | { action: "lifetime"; enabled: boolean }
  | { action: "clinic-price"; monthlyPriceCents: number };
export type DiariamenteUser = RegisteredUser & { billing: UserBilling | null };
export type ClerkProject = {
  id: string;
  name: string;
  domain: string | null;
  connected: boolean;
  billing: boolean;
  secretKeyVariable: string;
};
export type ClerkProjectsResult = {
  projects: ClerkProject[];
  issues: string[];
};
export type UsersResult = {
  project: ClerkProject;
  users: DiariamenteUser[];
  billing: "ok" | "unconfigured" | "error" | "unsupported";
  total: number;
  newUsers: { day: number; week: number; month: number };
  filteredTotal: number;
  page: number;
  pageSize: number;
  environment: "production" | "development";
  fetchedAt: string;
};
