// Saves every picture a flow page defines as a PNG.
//
// Usage: node shoot.mjs <page.html> <out_dir> [pictureId ...]
// Writes <out_dir>/<pictureId>.png at 1600x900.
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const { chromium } = createRequire(import.meta.url)("playwright");
const [pageFile, outDir, ...only] = process.argv.slice(2);
mkdirSync(resolve(outDir), { recursive: true });
const browser = await chromium.launch();
const errors = [];
for (const id of only.length ? only : await listIds()) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on("pageerror", (e) => errors.push(`${id}: ${e.message}`));
  await page.goto(pathToFileURL(resolve(pageFile)).href);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate((id) => window.pictures.run(id), id);
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(resolve(outDir), id + ".png") });
  console.log("wrote", id + ".png");
  await page.close();
}
await browser.close();
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }

async function listIds() {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(resolve(pageFile)).href);
  const ids = await page.evaluate(() => window.pictures.ids);
  await page.close();
  return ids;
}
