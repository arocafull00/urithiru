import { DashboardApp } from "@/components/dashboard";
export default function Home() {
  return (
    <DashboardApp
      configured={Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)}
    />
  );
}
