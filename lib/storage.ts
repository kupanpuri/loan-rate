import { promises as fs } from "fs";
import path from "path";
import type { Snapshot } from "./types";

const dataDir = path.join(process.cwd(), "data");
const latestPath = path.join(dataDir, "latest.json");

export async function saveSnapshot(snapshot: Snapshot) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(latestPath, JSON.stringify(snapshot, null, 2));
  const stamp = snapshot.generatedAt.replace(/[:.]/g, "-");
  await fs.writeFile(path.join(dataDir, `snapshot-${stamp}.json`), JSON.stringify(snapshot, null, 2));
}

export async function loadLatestSnapshot(): Promise<Snapshot | null> {
  try {
    return JSON.parse(await fs.readFile(latestPath, "utf8")) as Snapshot;
  } catch {
    return null;
  }
}
