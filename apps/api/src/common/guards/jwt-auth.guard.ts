import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ACCESS_TOKEN_COOKIE, ACCOUNT_SUSPENDED_MESSAGE, type JwtPayload } from '@mindease/shared';
import { PrismaService } from '../../prisma/prisma.service.js';
import { IS_PUBLIC_KEY, type AuthedRequest } from '../decorators.js';

/**
 * Global guard. Every route requires a valid access token unless marked @Public().
 * The token comes from the httpOnly cookie, or a Bearer header for API clients.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = extractToken(req);
    if (!token) throw new UnauthorizedException('Not authenticated');

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Session expired');
    }

    // Deactivation and role changes must take effect immediately, not at token expiry.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, status: true },
    });
    if (!user) throw new UnauthorizedException('Not authenticated');
    if (user.status !== 'ACTIVE') throw new ForbiddenException(ACCOUNT_SUSPENDED_MESSAGE);

    req.user = { id: user.id, role: user.role, tier: payload.tier };
    return true;
  }
}

function extractToken(req: AuthedRequest): string | undefined {
  const cookie = (req.cookies as Record<string, string> | undefined)?.[ACCESS_TOKEN_COOKIE];
  if (cookie) return cookie;
  const [scheme, value] = req.headers.authorization?.split(' ') ?? [];
  return scheme === 'Bearer' ? value : undefined;
}
