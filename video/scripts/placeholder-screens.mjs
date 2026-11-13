// Writes tasteful 1920x1080 placeholder screenshots until real dashboard captures exist.
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../assets/screens");
const shots = { floor: "Factory floor", reject: "Slop bounced", merged: "Clean merge" };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
for (const [name, label] of Object.entries(shots)) {
  await page.setContent(`<!doctype html><body style="margin:0;width:1920px;height:1080px;display:grid;place-items:center;background:#FCEBD5;font-family:sans-serif">
    <div style="width:1600px;height:860px;border-radius:36px;background:#FFF7EC;border:4px dashed #D9B99B;display:grid;place-items:center;text-align:center;color:#8A5A3B">
      <div><div style="font-size:72px;font-weight:800">${label}</div><div style="font-size:40px;margin-top:16px">dashboard screenshot placeholder</div></div>
    </div></body>`);
  await page.screenshot({ path: path.join(out, `${name}.png`) });
}
await browser.close();
console.log("placeholders written");
