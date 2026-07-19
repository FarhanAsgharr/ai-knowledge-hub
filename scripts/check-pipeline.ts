/**
 * Exercises extraction + chunking without touching the OpenAI API.
 * Run: npx tsx scripts/check-pipeline.ts <file>
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";

import { chunkSegments } from "../src/lib/chunk";
import { extractSegments } from "../src/lib/extract";

const path = process.argv[2];
if (!path) {
  console.error("usage: npx tsx scripts/check-pipeline.ts <file>");
  process.exit(1);
}

async function main() {
  const buffer = readFileSync(path);
  const segments = await extractSegments(buffer, "", basename(path));
  const chunks = chunkSegments(segments);

  console.log(`file      ${basename(path)}`);
  console.log(`segments  ${segments.length}`);
  console.log(`chunks    ${chunks.length}`);
  console.log(
    `chars     min ${Math.min(...chunks.map((c) => c.content.length))} / ` +
      `max ${Math.max(...chunks.map((c) => c.content.length))}`,
  );
  console.log("\nfirst chunk:");
  console.log(chunks[0]?.content.slice(0, 300));
  console.log("\nlast chunk:");
  console.log(chunks.at(-1)?.content.slice(0, 300));
}

void main();
