import { createECDH, ECDH } from 'node:crypto';
import { AppError } from '../../common/app-error.js';
export interface PushConfiguration { subject: string; publicKey: string; privateKey: string }
export function pushConfiguration(env = process.env): PushConfiguration | null {
  const publicKey = env.PUSH_VAPID_PUBLIC_KEY, privateKey = env.PUSH_VAPID_PRIVATE_KEY, subject = env.PUSH_VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return null;
  try {
    if (!/^[A-Za-z0-9_-]{87}$/.test(publicKey) || !/^[A-Za-z0-9_-]{43}$/.test(privateKey)) return null;
    const parsed = new URL(subject);
    if (!['mailto:', 'https:'].includes(parsed.protocol)) return null;
    if (parsed.protocol === 'mailto:' && !/^[^\s@]+@[^\s@]+$/.test(parsed.pathname)) return null;
    const curve = createECDH('prime256v1'); curve.setPrivateKey(Buffer.from(privateKey, 'base64url'));
    if (curve.getPublicKey().toString('base64url') !== publicKey) return null;
    return { subject, publicKey, privateKey };
  } catch { return null; }
}
export function validPushEndpoint(endpoint: string): void {
  let url: URL;
  try { url = new URL(endpoint); } catch { throw new AppError(400, 'INVALID_PUSH_ENDPOINT', '推送订阅地址无效'); }
  const hosts = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'];
  if (url.protocol !== 'https:' || !hosts.includes(url.hostname) || url.port || url.username || url.password || url.hash || url.pathname === '/') throw new AppError(400, 'INVALID_PUSH_ENDPOINT', '暂仅支持标准 Google、Mozilla 和 Apple HTTPS 推送地址');
}
export function validPushKeys(keys: { p256dh: string; auth: string }): void {
  try {
    const publicKey = Buffer.from(keys.p256dh, 'base64url'), auth = Buffer.from(keys.auth, 'base64url');
    if (publicKey.length !== 65 || auth.length !== 16 || publicKey[0] !== 4) throw new Error('Invalid key size');
    ECDH.convertKey(publicKey, 'prime256v1', undefined, undefined, 'uncompressed');
  } catch { throw new AppError(400, 'INVALID_PUSH_KEYS', '浏览器推送密钥无效，请重新订阅'); }
}
