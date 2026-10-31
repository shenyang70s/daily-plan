import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { generateVAPIDKeys } = require('web-push');
const keys = generateVAPIDKeys();
console.log(`PUSH_VAPID_PUBLIC_KEY=${keys.publicKey}\nPUSH_VAPID_PRIVATE_KEY=${keys.privateKey}\nPUSH_VAPID_SUBJECT=mailto:you@example.com`);
