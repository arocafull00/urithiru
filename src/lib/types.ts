export type Period = 1 | 7 | 30;
export type Section = "overview" | "projects" | "logs" | "errors" | "settings";
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
};
