type R2Environment = Record<string, string | undefined>;

export type R2Configuration = {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  publishedBucket: string;
  stagingBucket: string;
};

function required(environment: R2Environment, name: string) {
  const value = environment[name]?.trim();

  if (!value) {
    throw new Error(`Missing required R2 environment variable: ${name}.`);
  }

  return value;
}

export function parseR2Configuration(environment: R2Environment): R2Configuration {
  const endpointValue = required(environment, "CLOUDFLARE_S3_API_ENDPOINT");
  const endpoint = new URL(endpointValue);

  if (
    endpoint.protocol !== "https:"
    || endpoint.username
    || endpoint.password
    || endpoint.search
    || endpoint.hash
    || !["", "/"].includes(endpoint.pathname)
  ) {
    throw new Error("CLOUDFLARE_S3_API_ENDPOINT must be an HTTPS origin.");
  }

  const publishedBucket = required(environment, "CLOUDFLARE_R2_BUCKET");
  const stagingBucket = required(environment, "CLOUDFLARE_R2_STAGING_BUCKET");

  if (publishedBucket === stagingBucket) {
    throw new Error("The R2 staging and published buckets must be different.");
  }

  return {
    endpoint: endpoint.origin,
    accessKeyId: required(environment, "CLOUDFLARE_ACCESS_ID"),
    secretAccessKey: required(environment, "CLOUDFLARE_SECRET_KEY"),
    publishedBucket,
    stagingBucket,
  };
}