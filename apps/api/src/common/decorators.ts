import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { Role, SubscriptionTier } from '@mindease/shared';

export const IS_PUBLIC_KEY = 'isPublic';
/** Skip authentication for this route or controller. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
/** Restrict a route or controller to the given roles. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** The authenticated principal attached to the request by JwtAuthGuard. */
export interface RequestUser {
  id: string;
  role: Role;
  tier: SubscriptionTier;
}

export type AuthedRequest = Request & { user?: RequestUser };

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser | undefined =>
    ctx.switchToHttp().getRequest<AuthedRequest>().user,
);
