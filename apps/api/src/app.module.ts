import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module.js';
import { AiModule } from './ai/ai.module.js';
import { AppointmentsModule } from './appointments/appointments.module.js';
import { AssessmentModule } from './assessment/assessment.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ChatModule } from './chat/chat.module.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { RolesGuard } from './common/guards/roles.guard.js';
import { ConfigModule } from './config/config.module.js';
import { ConsultationsModule } from './consultations/consultations.module.js';
import { ContactModule } from './contact/contact.module.js';
import { ContentModule } from './content/content.module.js';
import { DoctorsModule } from './doctors/doctors.module.js';
import { HealthController } from './health.controller.js';
import { MailModule } from './mail/mail.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ReviewsModule } from './reviews/reviews.module.js';
import { RiskModule } from './risk/risk.module.js';
import { SchedulingModule } from './scheduling/scheduling.module.js';
import { SubscriptionsModule } from './subscriptions/subscriptions.module.js';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    SubscriptionsModule,
    MailModule,
    NotificationsModule,
    AuthModule,
    AdminModule,
    ContentModule,
    DoctorsModule,
    ContactModule,
    RiskModule,
    AiModule,
    AssessmentModule,
    ChatModule,
    SchedulingModule,
    AppointmentsModule,
    PaymentsModule,
    ReviewsModule,
    ConsultationsModule,
  ],
  controllers: [HealthController],
  providers: [
    // Order matters: rate limit, then authenticate, then authorize.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
