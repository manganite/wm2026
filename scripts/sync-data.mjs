// Copies the hand-maintained data/*.json (single source of truth) into
// public/data/ so they're bundled as static assets. Runs before dev/build
// (see package.json `predev`/`prebuild`). public/data/ is committed so the
// build stays reproducible even if this script is skipped.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const srcDir = join(root, "data");
const destDir = join(root, "public", "data");

mkdirSync(destDir, { recursive: true });
for (const name of ["teams.json", "fixtures.json", "results.json"]) {
  copyFileSync(join(srcDir, name), join(destDir, name));
  console.log(`synced data/${name} -> public/data/${name}`);
}
