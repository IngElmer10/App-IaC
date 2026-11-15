import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from 'node:crypto';

export function studentPasswordFor(sessionSecret: string) {
  return createHmac('sha256', sessionSecret)
    .update('student-default-password')
    .digest('hex')
    .slice(0, 20);
}

function key() {
  if (!process.env.SESSION_SECRET) throw new Error('Configura SESSION_SECRET.');
  return createHash('sha256').update(process.env.SESSION_SECRET).digest();
}

export function sealSecret(value: string) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), nonce);
  const ciphertext = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  return [nonce, cipher.getAuthTag(), ciphertext]
    .map((part) => part.toString('base64url'))
    .join('.');
}

export function openSecret(value: string) {
  const [nonce, tag, ciphertext] = value
    .split('.')
    .map((part) => Buffer.from(part, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', key(), nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8');
}
