import { Injectable } from '@nestjs/common';
import type { Role, SubscriptionTier } from '@mindease/shared';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class TierService {
  constructor(private readonly prisma: PrismaService) {}

  /** PAID while a USER has an active, current paid subscription; FREE otherwise. */
  async tierOf(user: { id: string; role: Role }): Promise<SubscriptionTier> {
    if (user.role !== 'USER') return 'FREE';
    const now = new Date();
    const paid = await this.prisma.subscription.findFirst({
      where: {
        userId: user.id,
        tier: 'PAID',
        status: 'ACTIVE',
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      select: { id: true },
    });
    return paid ? 'PAID' : 'FREE';
  }
}
