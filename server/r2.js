// ---------------------------------------------------------------------------
// Cloudflare R2, which is where the flashcards live when the site is hosted.
//
// Render's free tier hands the process a fresh, empty filesystem every time it
// deploys or wakes from a spin-down, so a JSON file on local disk lasts until
// the first quiet evening and no longer. R2 is an S3-compatible object store
// that does not evaporate, and it is the same file — one key, one blob of
// JSON, read at boot and written back when it changes.
//
// Nothing in here is configured in code. All four values come from the
// environment:
//
//   R2_ENDPOINT           https://<account id>.r2.cloudflarestorage.com
//   R2_ACCESS_KEY_ID
//   R2_SECRET_ACCESS_KEY
//   R2_BUCKET_NAME
//
// If any of them is missing the module reports itself unconfigured and
// store.js falls back to the local disk, which is what happens on a developer's
// laptop and in the tests. Running with no credentials is therefore a
// supported state, not a broken one.
//
// A WORD ON THE BUCKET. The object this writes holds every account's password
// hash and the digest of every live session token. It must live in a *private*
// bucket, reachable only through this API with these credentials. If the
// bucket is also serving public assets over a public r2.dev or custom-domain
// URL, put this somewhere else.
// ---------------------------------------------------------------------------

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const ENDPOINT = process.env.R2_ENDPOINT || '';
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';

export const BUCKET = process.env.R2_BUCKET_NAME || '';

/** Whether there is enough in the environment to talk to R2 at all. */
export const configured = Boolean(ENDPOINT && ACCESS_KEY_ID && SECRET_ACCESS_KEY && BUCKET);

/**
 * The client. R2 wants region "auto" — it has no regions in the AWS sense —
 * and the endpoint carries the account id, so neither is written down here.
 */
export function makeClient() {
  if (!configured) {
    throw new Error(
      'R2 is not configured. Set R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME.'
    );
  }
  return new S3Client({
    region: 'auto',
    endpoint: ENDPOINT,
    credentials: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY },
    // The SDK began adding CRC32 checksums and aws-chunked encoding to every
    // upload by default, which R2 has historically rejected. Asking for them
    // only where the protocol actually requires them keeps this working
    // against R2 whichever side changes next. Harmless against real S3 too.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}

/** The one the app uses. Null when there are no credentials to build it from. */
export const client = configured ? makeClient() : null;

// --- telling "there is nothing there yet" from "something went wrong" -------
//
// This is the most important distinction in the whole module. A missing object
// means first run, and the app should start with an empty shelf. Anything else
// — a network blip, an expired key, a 500 from Cloudflare — means the data is
// probably fine and simply out of reach, and starting empty would let the next
// save write an empty file over every account there is. So the two cases are
// told apart carefully, and everything that is not unambiguously "not found"
// is treated as an error worth refusing to start over.

export function isNotFound(err) {
  const code = err?.name || err?.Code;
  const status = err?.$metadata?.httpStatusCode;
  return code === 'NoSuchKey' || code === 'NotFound' || status === 404;
}

/**
 * A place to keep one blob of text, built on a bucket and a key.
 *
 * Taking the client as an argument rather than reaching for the module's own
 * is what lets the tests drive this with a stub and check the awkward paths —
 * a missing object, a 500, a burst of writes — without credentials or a
 * network.
 */
export function blobStore({ client: s3, bucket, key, contentType = 'application/json' }) {
  if (!s3) throw new Error('blobStore needs a client.');
  if (!bucket) throw new Error('blobStore needs a bucket.');
  if (!key) throw new Error('blobStore needs a key.');

  return {
    describe: () => `r2://${bucket}/${key}`,

    /** The text, or null if the object does not exist. Throws on anything else. */
    async read() {
      try {
        const out = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        return await out.Body.transformToString();
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },

    async write(text) {
      await s3.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: text, ContentType: contentType })
      );
    },

    /**
     * Put a copy somewhere out of the way, under a dated key beside the
     * original. Used when what came back will not parse: the damaged data is
     * kept rather than quietly overwritten by whatever is written next.
     */
    async quarantine(text) {
      const kept = `${key}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}`;
      await s3.send(
        new PutObjectCommand({ Bucket: bucket, Key: kept, Body: text, ContentType: contentType })
      );
      return kept;
    },

    async remove() {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}
