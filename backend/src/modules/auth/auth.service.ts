import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { createAuthToken } from './auth-token.js';

export type AuthUserRole = 'admin' | 'student';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async validateCredentials(username: string, password: string) {
    const normalizedUsername = username?.trim();
    const normalizedPassword = password?.trim();

    if (!normalizedUsername || !normalizedPassword) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD ?? 'admin123';
    const studentPassword = process.env.DEFAULT_STUDENT_PASSWORD ?? '12345678';

    if (normalizedUsername.toLowerCase() === 'platform') {
      if (process.env.PLATFORM_ENABLED === 'false' || !process.env.PLATFORM_ADMIN_PASSWORD || normalizedPassword !== process.env.PLATFORM_ADMIN_PASSWORD) {
        throw new UnauthorizedException('Credenciales de plataforma inválidas.');
      }
      const user = { id: 'platform', username: 'platform', role: 'platform' as const };
      return { authenticated: true, user, accessToken: createAuthToken(user) };
    }

    if (normalizedUsername.toLowerCase() === 'admin' || (process.env.ADMIN_EMAIL && normalizedUsername.toLowerCase() === process.env.ADMIN_EMAIL.toLowerCase())) {
      if (normalizedPassword !== adminPassword) {
        throw new UnauthorizedException('Credenciales inválidas');
      }
      const user = { id: 'admin', username: 'admin', role: 'admin' as const };
      return { authenticated: true, user, accessToken: createAuthToken(user) };
    }

    if (normalizedPassword !== studentPassword) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const student = await this.prisma.student.findFirst({
      where: {
        active: true,
        module: { is: { active: true } },
        OR: [
          { registrationCode: { equals: normalizedUsername, mode: 'insensitive' } },
          { email: { equals: normalizedUsername, mode: 'insensitive' } },
        ],
      },
      select: { id: true, registrationCode: true },
    });

    if (!student) {
      throw new UnauthorizedException('No eres un estudiante del módulo activo.');
    }

    const user = { id: student.id, username: student.registrationCode, role: 'student' as const };
    return { authenticated: true, user, accessToken: createAuthToken(user) };
  }
}
