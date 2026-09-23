import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

import { rgbToHex } from "../lib/palette/k-means.js";
import {
  extractOklabKMedoids,
  OKLAB_K_MEDOIDS_ALGORITHM,
  OKLAB_K_MEDOIDS_ITERATIONS,
} from "../lib/palette/oklab-k-medoids.js";

const bucket = "elliotmairet";
const featureCount = 5;
const sampleLongestSide = 96;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.SUPABASE_ADMIN_EMAIL;
const password = process.env.SUPABASE_ADMIN_PASSWORD;
const key = serviceRoleKey ?? publicKey;

if (!url || !key || (!serviceRoleKey && (!email || !password))) {
  throw new Error(
    "Supabase URL and key configuration is required. Provide either " +
      "SUPABASE_SERVICE_ROLE_KEY or an admin email and password.",
  );
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});
if (!serviceRoleKey && email && password) {
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

  if (signInError) throw signInError;
}

const { data: photographs, error: photographsError } = await supabase
  .from("photographs")
  .select("id, storage_path")
  .order("id", { ascending: true });

if (photographsError) throw photographsError;

for (const [index, photograph] of photographs.entries()) {
  const { data: storedFile, error: downloadError } = await supabase.storage
    .from(bucket)
    .download(photograph.storage_path);

  if (downloadError || !storedFile) {
    throw downloadError ?? new Error(`Could not download ${photograph.storage_path}.`);
  }

  const { data, info } = await sharp(Buffer.from(await storedFile.arrayBuffer()))
    .rotate()
    .resize({
      width: sampleLongestSide,
      height: sampleLongestSide,
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

  const features = extractOklabKMedoids(pixels, featureCount).map(
    ({ rgb, oklab, weight }, featureIndex) => ({
      rank: featureIndex + 1,
      red: rgb[0],
      green: rgb[1],
      blue: rgb[2],
      hex: rgbToHex(rgb),
      oklab_l: oklab[0],
      oklab_a: oklab[1],
      oklab_b: oklab[2],
      weight: Number(weight.toFixed(6)),
    }),
  );
  const { error: replaceError } = await supabase.rpc("replace_photo_oklab_analysis", {
    p_photograph_id: photograph.id,
    p_algorithm: OKLAB_K_MEDOIDS_ALGORITHM,
    p_algorithm_iterations: OKLAB_K_MEDOIDS_ITERATIONS,
    p_sample_longest_side: sampleLongestSide,
    p_feature_count: features.length,
    p_analyzed_at: new Date().toISOString(),
    p_features: features,
  });

  if (replaceError) throw replaceError;
  console.log(`[${index + 1}/${photographs.length}] ${photograph.storage_path}`);
}

if (!serviceRoleKey) {
  await supabase.auth.signOut();
}