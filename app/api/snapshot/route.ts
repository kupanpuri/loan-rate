import { NextResponse } from "next/server";
import { collectSnapshot } from "@/lib/collect";
import { loadLatestSnapshot, saveSnapshot } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const preferredRegion = "gru1";

async function saveSnapshotBestEffort(snapshot: Awaited<ReturnType<typeof collectSnapshot>>) {
  try {
    await saveSnapshot(snapshot);
  } catch (error) {
    console.warn("Snapshot generated but could not be saved locally.", error);
  }
}

export async function GET() {
  const cached = await loadLatestSnapshot();

  if (cached) {
    return NextResponse.json(cached);
  }

  const snapshot = await collectSnapshot();
  await saveSnapshotBestEffort(snapshot);
  return NextResponse.json(snapshot);
}

export async function POST() {
  const snapshot = await collectSnapshot();
  await saveSnapshotBestEffort(snapshot);
  return NextResponse.json(snapshot);
}
