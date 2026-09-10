import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Cloudflare R2, spoken to over the S3 protocol.
 *
 * R2 is the intended home for book files, for a reason specific to this
 * workload: a reader streams the same object repeatedly, and R2 charges
 * nothing for egress. Storing a lab's shelf on a per-gigabyte-transferred
 * service would make reading the thing the expensive part.
 *
 * This is deliberately optional. Without the environment set, storage falls
 * back to Supabase Storage, which the local stack already runs — so the
 * feature works end to end on a laptop with no cloud account, and moving to R2
 * is a matter of setting five variables and copying the bucket across. Nothing
 * in the database changes, because rows hold an object path and never a URL.
 */

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** Optional public domain, for objects served without a signature. */
  publicBase?: string;
};

export function r2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicBase: process.env.R2_PUBLIC_BASE || undefined,
  };
}

export function isR2Configured(): boolean {
  return r2Config() !== null;
}

let cached: S3Client | null = null;

function client(config: R2Config): S3Client {
  if (!cached) {
    cached = new S3Client({
      // R2 is region-less but the SDK insists on one; "auto" is what
      // Cloudflare document for this.
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }
  return cached;
}

export async function r2Put(
  path: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  const config = r2Config();
  if (!config) throw new Error("R2 is not configured");

  await client(config).send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: path,
      Body: bytes,
      ContentType: contentType,
      // The path already contains the content hash, so an object can be
      // checked against its own name and is safe to cache indefinitely.
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
}

export async function r2Get(path: string): Promise<Uint8Array | null> {
  const config = r2Config();
  if (!config) throw new Error("R2 is not configured");

  try {
    const res = await client(config).send(
      new GetObjectCommand({ Bucket: config.bucket, Key: path }),
    );
    if (!res.Body) return null;
    return new Uint8Array(await res.Body.transformToByteArray());
  } catch {
    return null;
  }
}

export async function r2Delete(path: string): Promise<void> {
  const config = r2Config();
  if (!config) return;
  await client(config).send(
    new DeleteObjectCommand({ Bucket: config.bucket, Key: path }),
  );
}

export async function r2Exists(path: string): Promise<boolean> {
  const config = r2Config();
  if (!config) return false;
  try {
    await client(config).send(
      new HeadObjectCommand({ Bucket: config.bucket, Key: path }),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * A short-lived URL for one object.
 *
 * Signed rather than public even when a public domain is configured, because
 * the bucket holds a lab's private shelf and a bucket-wide public base would
 * make every object guessable-by-path readable by anyone. The expiry is an
 * hour: long enough to read a chapter, short enough that a leaked URL stops
 * working before it is useful.
 */
export async function r2SignedUrl(path: string, seconds = 3600): Promise<string> {
  const config = r2Config();
  if (!config) throw new Error("R2 is not configured");

  return getSignedUrl(
    client(config),
    new GetObjectCommand({ Bucket: config.bucket, Key: path }),
    { expiresIn: seconds },
  );
}
