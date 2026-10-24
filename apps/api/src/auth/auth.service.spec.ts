import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import type { Env } from '../config/env.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { MailService } from '../mail/mail.service.js';
import { TierService } from '../subscriptions/tier.service.js';
import { AuthService } from './auth.service.js';

const env = {
  JWT_ACCESS_SECRET: 'test-secret-at-least-16',
  JWT_ACCESS_TTL_SECONDS: 900,
  REFRESH_TTL_DAYS: 7,
  WEB_ORIGIN: 'http://localhost:3000',
} as Env;

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    email: 'a@b.com',
    name: 'Ana',
    passwordHash: bcrypt.hashSync('Secret123', 4),
    role: 'USER',
    status: 'ACTIVE',
    emailVerified: false,
    emailVerificationToken: null,
    consentAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makePrisma() {
  return {
    user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    refreshToken: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    subscription: { findFirst: vi.fn().mockResolvedValue(null) },
  };
}

describe('AuthService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: AuthService;
  const jwt = new JwtService({ secret: env.JWT_ACCESS_SECRET });

  beforeEach(() => {
    prisma = makePrisma();
    const db = prisma as unknown as PrismaService;
    service = new AuthService(db, jwt, new TierService(db), env, new MailService(env));
  });

  describe('register', () => {
    const dto = {
      name: 'Ana',
      email: 'a@b.com',
      password: 'Secret123',
      role: 'USER' as const,
      consent: true as const,
    };

    it('rejects a duplicate email', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());
      await expect(service.register(dto)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('hashes the password and issues tokens', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(({ data }) => makeUser(data));

      const { user, tokens } = await service.register(dto);

      const data = prisma.user.create.mock.calls[0][0].data;
      expect(data.passwordHash).not.toBe(dto.password);
      expect(await bcrypt.compare(dto.password, data.passwordHash)).toBe(true);
      expect(data.doctorProfile).toBeUndefined();
      expect(user).toMatchObject({ email: 'a@b.com', role: 'USER', tier: 'FREE' });
      expect(user).not.toHaveProperty('passwordHash');
      expect(jwt.verify(tokens.accessToken)).toMatchObject({ sub: 'u1', role: 'USER' });
      // Only the hash of the refresh token is stored.
      expect(prisma.refreshToken.create.mock.calls[0][0].data.tokenHash).not.toBe(
        tokens.refreshToken,
      );
    });

    it('creates a pending doctor profile for doctors', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(({ data }) => makeUser({ ...data, role: 'DOCTOR' }));

      await service.register({ ...dto, role: 'DOCTOR' });

      expect(prisma.user.create.mock.calls[0][0].data.doctorProfile).toEqual({ create: {} });
    });
  });

  describe('login', () => {
    it('rejects an unknown email with a generic message', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.login({ email: 'x@y.com', password: 'whatever1' })).rejects.toThrow(
        new UnauthorizedException('Invalid email or password'),
      );
    });

    it('rejects a wrong password with the same message', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());
      await expect(service.login({ email: 'a@b.com', password: 'Wrong1234' })).rejects.toThrow(
        new UnauthorizedException('Invalid email or password'),
      );
    });

    it('rejects a deactivated account', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser({ status: 'DEACTIVATED' }));
      await expect(
        service.login({ email: 'a@b.com', password: 'Secret123' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('reports PAID tier when an active paid subscription exists', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());
      prisma.subscription.findFirst.mockResolvedValue({ id: 's1' });
      const { user } = await service.login({ email: 'a@b.com', password: 'Secret123' });
      expect(user.tier).toBe('PAID');
    });
  });

  describe('refresh', () => {
    it('rotates a valid token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt1',
        userId: 'u1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        user: makeUser(),
      });

      const { tokens } = await service.refresh('raw-token');

      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt1' },
        data: { revokedAt: expect.any(Date) },
      });
      expect(tokens.refreshToken).not.toBe('raw-token');
    });

    it('revokes every session when a revoked token is reused', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt1',
        userId: 'u1',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        user: makeUser(),
      });

      await expect(service.refresh('raw-token')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('rejects an expired token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt1',
        userId: 'u1',
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1),
        user: makeUser(),
      });
      await expect(service.refresh('raw-token')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a missing token', async () => {
      await expect(service.refresh(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
