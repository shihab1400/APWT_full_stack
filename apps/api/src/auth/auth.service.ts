import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import {
  ACCOUNT_SUSPENDED_MESSAGE,
  type AuthUser,
  type JwtPayload,
  type LoginDto,
  type RegisterDto,
  type SubscriptionTier,
} from '@mindease/shared';
import { ENV, type Env } from '../config/env.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TierService } from '../subscriptions/tier.service.js';
import type { User } from '../generated/prisma/client.js';

const BCRYPT_ROUNDS = 12;

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export interface AuthResult {
  user: AuthUser;
  tokens: IssuedTokens;
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly tiers: TierService,
    @Inject(ENV) private readonly env: Env,
    private readonly mail: MailService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('An account with this email already exists');

    const verificationToken = randomBytes(32).toString('hex');
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
        role: dto.role,
        consentAt: new Date(),
        emailVerificationToken: verificationToken,
        // Doctors start with an unverified profile that admins must approve.
        doctorProfile: dto.role === 'DOCTOR' ? { create: {} } : undefined,
      },
    });

    this.sendVerification(user, verificationToken);
    return this.issueFor(user);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    // Same message for unknown email and wrong password, so accounts can't be enumerated.
    const valid = user && (await bcrypt.compare(dto.password, user.passwordHash));
    if (!user || !valid) throw new UnauthorizedException('Invalid email or password');
    if (user.status !== 'ACTIVE') throw new ForbiddenException(ACCOUNT_SUSPENDED_MESSAGE);

    return this.issueFor(user);
  }

  /** Rotates a refresh token. Reusing a revoked token revokes the whole family. */
  async refresh(rawToken: string | undefined): Promise<AuthResult> {
    if (!rawToken) throw new UnauthorizedException('Not authenticated');

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      include: { user: true },
    });
    if (!stored) throw new UnauthorizedException('Not authenticated');

    if (stored.revokedAt) {
      await this.revokeAll(stored.userId);
      this.logger.warn(`Refresh token reuse detected for user ${stored.userId}`);
      throw new UnauthorizedException('Session revoked, please log in again');
    }
    if (stored.expiresAt <= new Date()) throw new UnauthorizedException('Session expired');
    if (stored.user.status !== 'ACTIVE') throw new ForbiddenException(ACCOUNT_SUSPENDED_MESSAGE);

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    return this.issueFor(stored.user);
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async verifyEmail(token: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { emailVerificationToken: token } });
    if (!user) throw new NotFoundException('Verification link is invalid or already used');
    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, emailVerificationToken: null },
    });
  }

  /** Issues a fresh verification link, invalidating the previous one. */
  async resendVerification(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Not authenticated');
    if (user.emailVerified) throw new ConflictException('Your email is already verified');
    const token = randomBytes(32).toString('hex');
    await this.prisma.user.update({ where: { id: userId }, data: { emailVerificationToken: token } });
    this.sendVerification(user, token);
  }

  private sendVerification(user: Pick<User, 'email' | 'name'>, token: string) {
    const url = this.mail.link(`/verify-email?token=${token}`);
    // Without SMTP, the link only reaches the developer through the log.
    if (!this.mail.enabled && this.env.NODE_ENV === 'development') {
      this.logger.log(`Verify ${user.email}: ${url}`);
    }
    this.mail.send({
      to: user.email,
      name: user.name,
      subject: 'Confirm your email for MindEase Oasis',
      paragraphs: [
        'Thanks for joining MindEase Oasis. Please confirm this is your email address.',
        "If you didn't create an account, you can ignore this email.",
      ],
      action: { label: 'Confirm email', url },
    });
  }

  async me(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Not authenticated');
    return this.toAuthUser(user, await this.tiers.tierOf(user));
  }

  private async issueFor(user: User): Promise<AuthResult> {
    const tier = await this.tiers.tierOf(user);
    const payload: JwtPayload = { sub: user.id, role: user.role, tier };
    const accessToken = await this.jwt.signAsync(payload);

    const refreshToken = randomBytes(48).toString('base64url');
    const refreshExpiresAt = new Date(Date.now() + this.env.REFRESH_TTL_DAYS * 86_400_000);
    await this.prisma.refreshToken.create({
      data: { userId: user.id, tokenHash: hashToken(refreshToken), expiresAt: refreshExpiresAt },
    });

    return {
      user: this.toAuthUser(user, tier),
      tokens: { accessToken, refreshToken, refreshExpiresAt },
    };
  }

  private async revokeAll(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private toAuthUser(user: User, tier: SubscriptionTier): AuthUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      emailVerified: user.emailVerified,
      tier,
    };
  }
}
