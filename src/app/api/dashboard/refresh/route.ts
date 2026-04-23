import { NextResponse } from "next/server";

import { fetchDashboardSnapshot } from "@/lib/estat/fetchIndicators";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const forceRefresh = searchParams.get("force") === "1";
  const snapshot = await fetchDashboardSnapshot(forceRefresh);

  return NextResponse.json(snapshot);
}

