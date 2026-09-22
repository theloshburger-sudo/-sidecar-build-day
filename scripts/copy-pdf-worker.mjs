// Copies the pdf.js worker into /public so the browser can load it from our own origin.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const pkgDir = dirname(require.resolve("pdfjs-dist/package.json"));
const src = join(pkgDir, "build", "pdf.worker.min.mjs");
const outDir = join(process.cwd(), "public");
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
copyFileSync(src, join(outDir, "pdf.worker.min.mjs"));
console.log("copied pdf.worker.min.mjs -> public/");
