import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { XMLParser } from "fast-xml-parser";

const SAMPLES_DIR = join(dirname(fileURLToPath(import.meta.url)), "sample-dives");

function inspect(file: string) {
  const xml = readFileSync(join(SAMPLES_DIR, file), "utf8");
  const parser = new XMLParser({ ignoreAttributes: false });
  const doc = parser.parse(xml);

  console.log(`\n=== ${file} ===`);
  // UDDF root path varies. Walk a few likely places.
  const dives =
    doc?.uddf?.profiledata?.repetitiongroup?.dive ??
    doc?.uddf?.profiledata?.dive ??
    null;

  if (!dives) {
    console.log("No dives at the expected paths. Top-level keys:");
    console.log(Object.keys(doc));
    console.log("If you see something other than 'uddf', this isn't UDDF — adapt accordingly.");
    return;
  }

  const arr = Array.isArray(dives) ? dives : [dives];
  console.log(`Found ${arr.length} dive(s).`);

  for (const d of arr.slice(0, 1)) {
    // Print top-level dive keys + first sample point keys
    console.log("Dive keys:", Object.keys(d));
    const samples =
      d?.samples?.waypoint ??
      d?.profiledata?.waypoint ??
      [];
    const sArr = Array.isArray(samples) ? samples : [samples];
    console.log(`Samples: ${sArr.length}`);
    if (sArr.length > 0) {
      console.log("First waypoint keys:", Object.keys(sArr[0]));
      console.log("First waypoint:", JSON.stringify(sArr[0], null, 2));
      console.log("Last waypoint:", JSON.stringify(sArr[sArr.length - 1], null, 2));
    }
  }
}

const files = readdirSync(SAMPLES_DIR).filter(
  (f) => f.endsWith(".uddf") || f.endsWith(".xml")
);
if (files.length === 0) {
  console.error("No .uddf or .xml files found in sample-dives/.");
  process.exit(1);
}
files.forEach(inspect);
