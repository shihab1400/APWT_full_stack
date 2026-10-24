import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@mindease/shared';
import { RolesGuard } from './roles.guard.js';

function contextFor(user: { role: Role } | undefined): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  afterEach(() => vi.restoreAllMocks());

  it('allows any authenticated user when no roles are required', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(contextFor({ role: 'USER' }))).toBe(true);
  });

  it('allows a user whose role is listed', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    expect(guard.canActivate(contextFor({ role: 'ADMIN' }))).toBe(true);
  });

  it.each<Role>(['USER', 'DOCTOR'])('rejects %s from an admin-only route', (role) => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    expect(() => guard.canActivate(contextFor({ role }))).toThrow(ForbiddenException);
  });

  it('rejects a request with no user', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['USER']);
    expect(() => guard.canActivate(contextFor(undefined))).toThrow(ForbiddenException);
  });
});
