import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { fetchDashboardSnapshot } from "@/lib/estat/fetchIndicators";

export const dynamic = "force-dynamic";

export default async function Home() {
  const snapshot = await fetchDashboardSnapshot();

  return <DashboardShell initialSnapshot={snapshot} />;
}
