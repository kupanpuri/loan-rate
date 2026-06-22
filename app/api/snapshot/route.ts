import { NextResponse } from "next/server";
import { collectSnapshot } from "@/lib/collect";
import { loadLatestSnapshot, saveSnapshot } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  const cached = await loadLatestSnapshot();

  if (cached) {
    return NextResponse.json(cached);
  }

  const snapshot = await collectSnapshot();
  await saveSnapshot(snapshot);
  return NextResponse.json(snapshot);
}

export async function POST() {
  const snapshot = await collectSnapshot();
  await saveSnapshot(snapshot);
  return NextResponse.json(snapshot);
}
