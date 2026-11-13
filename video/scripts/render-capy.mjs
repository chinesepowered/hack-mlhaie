// Renders assets/capy.svg to PNG in a given state using headless Chromium.
// Usage: node video/scripts/render-capy.mjs <state: default|reject|merge> <out.png> [widthPx]
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const here = path.dirname(fileURLToPath(import.meta.url));
const svgPath = path.resolve(here, "../../assets/capy.svg");
const [state = "merge", out = "capy.png", widthArg = "512"] = process.argv.slice(2);
const width = Number(widthArg);
const height = Math.round((width * 200) / 240);

const stateClass = state === "default" ? "" : ` capy--${state}`;
const svg = readFileSync(svgPath, "utf8").replace('class="capy"', `class="capy${stateClass}" width="${width}" height="${height}"`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${svg}</body></html>`);
await page.screenshot({ path: out, omitBackground: true, animations: "disabled" });
await browser.close();
console.log(`wrote ${out} (${width}x${height}, state=${state})`);
