import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { extractImagePalette } from "../lib/palette/analyse-buffer.ts";
import { rgbToHex } from "../lib/palette/k-means.js";
import { MMCQ_VIBRANT_ALGORITHM } from "../lib/palette/mmcq-vibrant.js";

/** Only public, bounded derivatives; never download archive originals. */
export function reviewImageUrl(source) {
  const url = new URL(source);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Invalid public image source.");
  if (url.origin === "https://images.dextery.dev" && url.pathname.startsWith("/elliotmairet/")) {
    url.search = "";
    url.searchParams.set("width", "640");
    url.searchParams.set("quality", "82");
    url.searchParams.set("format", "auto");
  } else if (url.origin === "https://api.dextery.dev" && url.pathname.startsWith("/storage/v1/object/public/elliotmairet/")) {
    url.pathname = url.pathname.replace("/object/", "/render/image/");
    url.search = "";
    url.searchParams.set("width", "640");
    url.searchParams.set("quality", "82");
  } else throw new Error("Unsupported public image origin/path.");
  return url.toString();
}

export function reviewSample(photographs, count) {
  const chroma = photo => Math.sqrt(photo.palette.reduce((sum, p) => sum + p.axisA ** 2 + p.axisB ** 2, 0) / photo.palette.length);
  const groups = [[], [], []];
  for (const photo of photographs) {
    if (!photo.palette.length || photo.palette[0].featureSpace !== "oklab") continue;
    const value = chroma(photo);
    groups[value <= 0.012 ? 0 : value <= 0.045 ? 1 : 2].push(photo);
  }
  const sample = [];
  for (const [index, group] of groups.entries()) {
    const amount = Math.min(group.length, Math.floor(count / 3) + (index < count % 3 ? 1 : 0));
    for (let i = 0; i < amount; i++) sample.push(group[amount === 1 ? 0 : Math.round(i * (group.length - 1) / (amount - 1))]);
  }
  for (const photo of photographs) {
    if (sample.length >= count) break;
    if (!sample.some(p => p.filename === photo.filename)) sample.push(photo);
  }
  return sample;
}

const escape = text => String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const swatches = palette => `<div class="swatches">${palette.map(p =>
  `<span style="background:${/^#[0-9a-f]{6}$/i.test(p.hex) ? p.hex : "#ffffff"}" title="${escape(p.hex)}${p.weight === undefined ? "" : ` · ${(p.weight * 100).toFixed(1)}% assigned population`}"></span>`,
).join("")}</div><small>${palette.map(p => escape(p.hex)).join(" · ")}</small>`;

export async function reviewPalettes({ count = 24, output }) {
  if (!Number.isInteger(count) || count < 1 || count > 60) throw new Error("Review count must be between 1 and 60.");
  const response = await fetch("https://elliotmairet.com/api/gallery/palettes", { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Public catalogue read failed (${response.status}).`);
  const sample = reviewSample(await response.json(), count);
  const directory = resolve(output);
  await mkdir(dirname(directory), { recursive: true });
  // Refuse to overwrite a previous review or user work.
  await mkdir(directory);
  const results = [];
  for (const [index, photo] of sample.entries()) {
    const imageUrl = reviewImageUrl(photo.imageUrl);
    const image = await fetch(imageUrl, { signal: AbortSignal.timeout(30000), redirect: "error", headers: { Accept: "image/jpeg" } });
    if (!image.ok || !image.body || !image.headers.get("content-type")?.startsWith("image/")) {
      throw new Error(`Preview unavailable for ${photo.filename} (HTTP ${image.status}).`);
    }
    const chunks = [];
    let bytes = 0;
    for await (const chunk of image.body) {
      bytes += chunk.length;
      if (bytes > 8 * 1024 * 1024) throw new Error("Preview exceeded the 8 MiB safety limit.");
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    const started = performance.now();
    const palette = (await extractImagePalette(buffer)).map(p => ({ hex: rgbToHex(p.rgb), weight: p.weight }));
    const preview = `${String(index + 1).padStart(2, "0")}.image`;
    await writeFile(resolve(directory, preview), buffer);
    results.push({ filename: photo.filename, oldPalette: photo.palette, palette, preview, imageUrl, durationMs: performance.now() - started });
    await writeFile(resolve(directory, "results.json"), JSON.stringify({ algorithm: MMCQ_VIBRANT_ALGORITHM, results }, null, 2));
  }
  const rows = results.map(photo => `<tr><th scope="row"><img src="${photo.preview}" alt="${escape(photo.filename)}"><div>${escape(photo.filename)}</div></th><td>${swatches(photo.oldPalette)}</td><td>${swatches(photo.palette)}</td></tr>`).join("");
  await writeFile(resolve(directory, "index.html"), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Elliot palette comparison</title><style>body{font:14px system-ui,sans-serif;margin:24px;color:#111;background:white}h1{font-size:24px}table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border-bottom:1px solid #ddd;padding:16px;text-align:left;vertical-align:middle}th{font-weight:400;overflow-wrap:anywhere}img{display:block;max-width:100%;max-height:200px;margin-bottom:8px}.swatches{display:flex;height:48px;margin-bottom:8px}.swatches span{flex:1}small{display:block;overflow-wrap:anywhere;color:#444}@media(max-width:600px){body{margin:8px}th,td{padding:8px}.swatches{height:32px}}</style><h1>Palette comparison</h1><p>Existing catalogue versus ${escape(MMCQ_VIBRANT_ALGORITHM)}. Read-only local review; no database or media writes. These use 640px public derivatives, so colours may differ slightly from original-file analysis. Swatch widths are equal; hover for assigned population.</p><table><thead><tr><th>Photograph</th><th>Existing</th><th>MMCQ + vibrancy + diversity</th></tr></thead><tbody>${rows}</tbody></table></html>`);
  return { directory, count: results.length, algorithm: MMCQ_VIBRANT_ALGORITHM };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.some(arg => !/^--(?:count|output)=/.test(arg))) throw new Error("Use --count=N and --output=NEW_DIRECTORY only. This tool has no apply mode.");
  const count = Number(args.find(arg => arg.startsWith("--count="))?.slice(8) ?? 24);
  const output = args.find(arg => arg.startsWith("--output="))?.slice(9)
    ?? `.local/palette-review/${new Date().toISOString().replaceAll(":", "-")}`;
  console.log(JSON.stringify(await reviewPalettes({ count, output }), null, 2));
}
