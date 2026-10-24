import { Injectable, Logger } from '@nestjs/common';
import type { RiskLevel } from '@mindease/shared';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class RiskService {
  private readonly logger = new Logger(RiskService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Records a risk alert for the admin "Risk Alerts" view. */
  async raise(alert: {
    userId: string;
    source: 'QUIZ' | 'CHAT' | 'CONSULTATION';
    severity: RiskLevel;
    sourceId?: string;
    detail?: string;
  }) {
    const created = await this.prisma.riskAlert.create({ data: alert });
    this.logger.warn(`Risk alert ${created.id}: ${alert.severity} from ${alert.source}`);
    return created;
  }
}
