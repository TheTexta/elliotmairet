import sharp from "sharp";

import {
  extractKMeansPalette,
  K_MEANS_ALGORITHM,
  K_MEANS_ITERATIONS,
  rgbToHex,
  rgbToLab,
} from "../lib/palette/k-means.js";

const BUCKET = "elliotmairet";
const RENDER_WIDTH = 640;
const RENDER_QUALITY = 82;
const SAMPLE_LONGEST_SIDE = 96;
const PALETTE_SIZE = 5;
const CONCURRENCY = 4;

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}.`);
  }
  return value;
}

function configuration() {
  return {
    supabaseUrl: (
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ""
    ).replace(/\/$/, ""),
    serviceRoleKey: requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

function parseLimit() {
  const argument = process.argv.find((value) => value.startsWith("--limit="));
  if (!argument) {
    return undefined;
  }

  const value = Number(argument.slice("--limit=".length));
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("--limit must be a positive integer.");
  }
  return value;
}

function renderUrl(supabaseUrl, storagePath) {
  const encodedPath = storagePath.split("/").map(encodeURIComponent).join("/");
  return `${supabaseUrl}/storage/v1/render/image/public/${BUCKET}/${encodedPath}?width=${RENDER_WIDTH}&quality=${RENDER_QUALITY}`;
}

async function request(config, path, init = {}) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(
      `Supabase request failed (${response.status}): ${(await response.text()).slice(0, 600)}`,
    );
  }

  return response;
}

async function photographs(config) {
  const response = await request(
    config,
    "photographs?select=id,storage_path,filename,image_width,image_height&order=captured_at.desc.nullslast,filename.desc&limit=1000",
  );
  return response.json();
}

async function existingPhotographIds(config) {
  const response = await request(
    config,
    `photo_palette_analyses?select=photograph_id&algorithm=eq.${encodeURIComponent(K_MEANS_ALGORITHM)}&limit=1000`,
  );
  const rows = await response.json();
  return new Set(rows.map((row) => row.photograph_id));
}

async function imagePixels(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Image request failed (${response.status}).`);
  }

  const { data, info } = await sharp(Buffer.from(await response.arrayBuffer()))
    .rotate()
    .resize({
      width: SAMPLE_LONGEST_SIDE,
      height: SAMPLE_LONGEST_SIDE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels = [];

  for (let offset = 0; offset < data.length; offset += info.channels) {
    if (data[offset + 3] > 200) {
      pixels.push([data[offset], data[offset + 1], data[offset + 2]]);
    }
  }

  return pixels;
}

async function analysePhoto(config, photo) {
  const pixels = await imagePixels(
    renderUrl(config.supabaseUrl, photo.storage_path),
  );
  const clusters = extractKMeansPalette(pixels, PALETTE_SIZE);

  return {
    analysis: {
      photograph_id: photo.id,
      algorithm: K_MEANS_ALGORITHM,
      algorithm_iterations: K_MEANS_ITERATIONS,
      sample_longest_side: SAMPLE_LONGEST_SIDE,
      palette_size: PALETTE_SIZE,
      analyzed_at: new Date().toISOString(),
    },
    colours: clusters.map(({ rgb, weight }, index) => {
      const [labL, labA, labB] = rgbToLab(rgb);
      return {
        rank: index + 1,
        red: rgb[0],
        green: rgb[1],
        blue: rgb[2],
        hex: rgbToHex(rgb),
        lab_l: labL,
        lab_a: labA,
        lab_b: labB,
        weight: Number(weight.toFixed(6)),
      };
    }),
  };
}

async function persist(config, result) {
  await request(config, "rpc/replace_photo_palette_analysis", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...result.analysis,
      colours: result.colours,
    }),
  });
}

async function mapWithConcurrency(values, mapper) {
  let nextIndex = 0;
  const failures = [];

  async function worker() {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= values.length) {
        return;
      }

      try {
        await mapper(values[index], index);
      } catch (error) {
        failures.push({ photo: values[index].filename, error });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, values.length) }, worker));
  return failures;
}

async function main() {
  const config = configuration();
  if (!config.supabaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL.");
  }

  const dryRun = process.argv.includes("--dry-run");
  const force = process.argv.includes("--force");
  const limit = parseLimit();
  const catalogue = await photographs(config);
  const archive = limit ? catalogue.slice(0, limit) : catalogue;
  const alreadyAnalysed = force
    ? new Set()
    : await existingPhotographIds(config);
  const pending = archive.filter((photo) => !alreadyAnalysed.has(photo.id));

  console.log(
    `${dryRun ? "Analysing" : "Backfilling"} ${pending.length} of ${archive.length} requested photographs (${alreadyAnalysed.size} already stored).`,
  );

  let completed = 0;
  const failures = await mapWithConcurrency(pending, async (photo) => {
    const result = await analysePhoto(config, photo);
    if (!dryRun) {
      await persist(config, result);
    }
    completed += 1;
    process.stdout.write(`\r${completed}/${pending.length} ${photo.filename}`);
  });
  process.stdout.write("\n");

  if (failures.length) {
    for (const { photo, error } of failures) {
      console.error(`${photo}: ${error instanceof Error ? error.message : String(error)}`);
    }
    throw new Error(`Palette backfill stopped with ${failures.length} failed photograph(s). Re-run to continue.`);
  }

  console.log(
    `${dryRun ? "Analysed" : "Stored"} ${completed} photograph palettes; each contains ${PALETTE_SIZE} ranked K-means colours.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
