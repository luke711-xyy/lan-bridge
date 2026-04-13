import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

for (const relativePath of ["dist", "dist-electron"]) {
  const targetPath = path.join(repoRoot, relativePath);
  fs.rmSync(targetPath, { recursive: true, force: true });
}
