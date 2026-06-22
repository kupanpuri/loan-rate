import { loadEnvConfig } from "@next/env";
import { collectSnapshot } from "../lib/collect";
import { saveSnapshot } from "../lib/storage";

loadEnvConfig(process.cwd());

async function main() {
  const snapshot = await collectSnapshot();
  await saveSnapshot(snapshot);
  console.log(`Saved ${snapshot.markets.length} markets at ${snapshot.generatedAt}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
