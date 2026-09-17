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

// Trimmed on the way in. A value pasted into a dashboard field very often
// arrives with a trailing space or newline attached, and a key with an
// invisible character on the end fails to authenticate in a way that looks
// nothing like the cause.
const env = (name) => (process.env[name] || '').trim();

const ENDPOINT = env('R2_ENDPOINT');
const ACCESS_KEY_ID = env('R2_ACCESS_KEY_ID');
const SECRET_ACCESS_KEY = env('R2_SECRET_ACCESS_KEY');

export const BUCKET = env('R2_BUCKET_NAME');

/** All four, in the order a person would set them. */
export const REQUIRED_VARS = ['R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME'];

const VALUES = {
  R2_ENDPOINT: ENDPOINT,
  R2_ACCESS_KEY_ID: ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY: SECRET_ACCESS_KEY,
  R2_BUCKET_NAME: BUCKET,
};

/**
 * Which of the four are absent or empty, by name.
 *
 * Only ever the names. Whether a variable is set is a thing worth putting in a
 * log; what it is set to is not, and a secret that reaches a log has reached
 * everywhere the logs go.
 */
export const missing = () => REQUIRED_VARS.filter((name) => !VALUES[name]);

/** And which did arrive, so a half-configured service is obvious at a glance. */
export const present = () => REQUIRED_VARS.filter((name) => VALUES[name]);

/** Whether there is enough in the environment to talk to R2 at all. */
export const configured = missing().length === 0;

/**
 * A guess at what went wrong, for the log. These are the three that actually
 * happen, and each has a different fix, so naming them saves a lot of staring
 * at an error that only says the request failed.
 */
export function hintFor(err) {
  // The useful label can be on the error, or on something it wraps, and it can
  // be any of three properties depending on whether it came from the SDK
  // (name/Code) or from the socket underneath it (code). So the whole chain is
  // searched rather than just the top.
  const labels = [];
  let statuses = [];
  for (let e = err, depth = 0; e && depth < 8; e = e.cause, depth++) {
    for (const key of ['name', 'code', 'Code']) if (e[key]) labels.push(String(e[key]));
    if (e.$metadata?.httpStatusCode) statuses.push(e.$metadata.httpStatusCode);
  }
  const has = (...names) => names.some((n) => labels.includes(n));
  const status = (n) => statuses.includes(n);

  if (has('AccessDenied', 'InvalidAccessKeyId', 'SignatureDoesNotMatch', 'Forbidden') || status(403)) {
    return 'The key was refused. Check it covers this bucket, and that a rotated token was copied into the environment.';
  }
  if (has('NoSuchBucket') || status(404)) {
    return 'There is no such bucket under this account. Check R2_BUCKET_NAME.';
  }
  if (has('ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'TimeoutError') ||
      labels.some((l) => l.includes('Timeout'))) {
    return 'The endpoint could not be reached. Check R2_ENDPOINT, which is the account-id host, not the bucket URL.';
  }
  return 'Check the four R2_* variables and that the bucket exists.';
}

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
  // Only the *key* being absent counts, and it has to say so by name. A bare
  // 404 is not enough: a bucket that does not exist answers with one too, and
  // reading that as "there is nothing here yet" is the whole disaster in one
  // step — the room opens empty on a name nobody has ever written to, and the
  // first save writes that emptiness down. A typo in R2_BUCKET_NAME is a
  // reason to close the room, not to start a new one.
  const code = err?.name || err?.Code;
  return code === 'NoSuchKey' || code === 'NotFound';
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
