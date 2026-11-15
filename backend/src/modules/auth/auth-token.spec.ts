import { UnauthorizedException } from '@nestjs/common';
import { createAuthToken, verifyAuthToken } from './auth-token.js';

describe('Auth token', () => {
  const originalSecret = process.env.SESSION_SECRET;

  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-secret-for-token-spec';
  });

  afterAll(() => {
    if (originalSecret === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = originalSecret;
    }
  });

  it('verifies a signed token and returns its role identity', () => {
    const user = { id: 'student-1', username: '1001', role: 'student' as const };

    expect(verifyAuthToken(createAuthToken(user))).toEqual(user);
  });

  it('rejects a token whose signature has been changed', () => {
    const token = createAuthToken({ id: 'admin', username: 'admin', role: 'admin' });
    const [payload, signature] = token.split('.');
    const alteredSignature = `${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`;

    expect(() => verifyAuthToken(`${payload}.${alteredSignature}`)).toThrow(UnauthorizedException);
  });
});