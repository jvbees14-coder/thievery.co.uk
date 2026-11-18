// Make the pair of VAPID keys that Missions signs its notifications with.
//
//   npm run missions:keys
//
// Run it once. Put the two lines it prints into Render's environment (and
// nowhere else: not in git, not in a chat). Making a new pair later means
// every phone has to join again, because each subscription is tied to the
// public key it was made with.

import { generateKeys } from '../server/webpush.js';

const { publicKey, privateKey } = generateKeys();
console.log('VAPID_PUBLIC_KEY=' + publicKey);
console.log('VAPID_PRIVATE_KEY=' + privateKey);
