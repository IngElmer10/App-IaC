import {
  openSecret,
  sealSecret,
  studentPasswordFor,
} from './platform-secrets.js';

describe('Credenciales de tenants', () => {
  const original = process.env.SESSION_SECRET;
  beforeEach(() => {
    process.env.SESSION_SECRET = 'platform-encryption-test-secret';
  });
  afterAll(() => {
    if (original === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = original;
  });

  it('cifra con nonce aleatorio y permite recuperar el valor original', () => {
    const first = sealSecret('owner-password');
    const second = sealSecret('owner-password');
    expect(first).not.toBe(second);
    expect(first).not.toContain('owner-password');
    expect(openSecret(first)).toBe('owner-password');
  });

  it('asigna una contraseña de estudiantes estable y diferente para cada institución', () => {
    expect(studentPasswordFor('tenant-a-secret')).toBe(
      studentPasswordFor('tenant-a-secret'),
    );
    expect(studentPasswordFor('tenant-a-secret')).not.toBe(
      studentPasswordFor('tenant-b-secret'),
    );
    expect(studentPasswordFor('tenant-a-secret')).toHaveLength(20);
  });

  it('rechaza modificaciones del texto cifrado o una clave diferente', () => {
    const sealed = sealSecret('owner-password');
    const parts = sealed.split('.');
    const bytes = Buffer.from(parts[2], 'base64url');
    bytes[0] ^= 1;
    parts[2] = bytes.toString('base64url');
    expect(() => openSecret(parts.join('.'))).toThrow();
    process.env.SESSION_SECRET = 'another-secret';
    expect(() => openSecret(sealed)).toThrow();
  });
});
