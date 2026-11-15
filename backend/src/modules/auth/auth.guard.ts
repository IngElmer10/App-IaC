import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { verifyAuthToken, type AuthTokenUser } from './auth-token.js';

export const AUTH_ROLES_KEY = 'auth-roles';
export const RequireRoles = (...roles: AuthTokenUser['role'][]) => SetMetadata(AUTH_ROLES_KEY, roles);

export type AuthenticatedRequest = Request & { authUser?: AuthTokenUser };

@Injectable()
export class ApiAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Inicia sesión para continuar.');
    }
    request.authUser = verifyAuthToken(authorization.slice('Bearer '.length));
    return true;
  }
}

@Injectable()
export class AuthRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const roles = this.reflector.getAllAndOverride<AuthTokenUser['role'][]>(AUTH_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.authUser || !roles.includes(request.authUser.role)) {
      throw new ForbiddenException('No tienes permisos para realizar esta acción.');
    }
    return true;
  }
}