import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import { ACCESS_TOKEN_COOKIE, type JwtPayload } from '@mindease/shared';

/**
 * Rate limits per signed-in user, falling back to the client IP for guests.
 * Many people in Bangladesh share one public IP through mobile carrier NAT,
 * so limiting by IP alone would let one busy user block their neighbours.
 * Only a token with a valid signature counts, so the key can't be spoofed.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector,
    private readonly jwt: JwtService,
  ) {
    super(options, storage, reflector);
  }

  protected override async getTracker(req: Record<string, any>): Promise<string> {
    const token =
      (req.cookies as Record<string, string> | undefined)?.[ACCESS_TOKEN_COOKIE] ??
      (typeof req.headers?.authorization === 'string' && req.headers.authorization.startsWith('Bearer ')
        ? req.headers.authorization.slice(7)
        : undefined);
    if (token) {
      try {
        const { sub } = await this.jwt.verifyAsync<JwtPayload>(token);
        return `user:${sub}`;
      } catch {
        // Expired or forged: treat as a guest.
      }
    }
    return `ip:${await super.getTracker(req)}`;
  }
}
