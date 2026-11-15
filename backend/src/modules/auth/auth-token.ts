import { createHmac, timingSafeEqual } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';

export type AuthTokenUser = {
  id: string;
  username: string;
  role: 'admin' | 'student' | 'platform';
};

type AuthTokenPayload = AuthTokenUser & { expiresAt: number };

function tokenSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('SESSION_SECRET debe estar configurado para emitir tokens de acceso.');
  }
  return secret;
}

export function createAuthToken(user: AuthTokenUser) {
  const payload: AuthTokenPayload = { ...user, expiresAt: Date.now() + 8 * 60 * 60 * 1000 };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', tokenSecret()).update(encodedPayload).digest('base64url');
  return `${encodedPayload}.${signature}`;
}

export function verifyAuthToken(token: string): AuthTokenUser {
  const [encodedPayload, encodedSignature, extra] = token.split('.');
  if (!encodedPayload || !encodedSignature || extra) {
    throw new UnauthorizedException('Token de sesión inválido.');
  }

  const expectedSignature = createHmac('sha256', tokenSecret()).update(encodedPayload).digest();
  let providedSignature: Buffer;
  try {
    providedSignature = Buffer.from(encodedSignature, 'base64url');
  } catch {
    throw new UnauthorizedException('Token de sesión inválido.');
  }
  if (providedSignature.length !== expectedSignature.length || !timingSafeEqual(providedSignature, expectedSignature)) {
    throw new UnauthorizedException('Token de sesión inválido.');
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString()) as AuthTokenPayload;
    if (
      !payload.id ||
      !payload.username ||
      !['admin', 'student', 'platform'].includes(payload.role) ||
      !Number.isFinite(payload.expiresAt) ||
      payload.expiresAt <= Date.now()
    ) {
      throw new Error('invalid payload');
    }
    return { id: payload.id, username: payload.username, role: payload.role };
  } catch {
    throw new UnauthorizedException('Token de sesión inválido o vencido.');
  }
}
