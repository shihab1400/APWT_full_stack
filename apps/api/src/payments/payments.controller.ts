import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { z } from 'zod';
import {
  ACCESS_TOKEN_COOKIE,
  PaymentStatus,
  refundSchema,
  testCheckoutSchema,
  type RefundDto,
  type TestCheckoutDto,
} from '@mindease/shared';
import { DAY_MS } from '../common/dhaka-time.js';
import { CurrentUser, Public, Roles, type RequestUser } from '../common/decorators.js';
import { ZodValidationPipe, openApiSchema } from '../common/zod.js';
import { ENV, type Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaymentsService } from './payments.service.js';
import { TestPaymentProvider } from './test.provider.js';

/** Form fields SSLCommerz posts back; only the IDs are used, everything else is re-checked. */
interface GatewayCallback {
  tran_id?: string;
  val_id?: string;
}

@ApiTags('payments')
@ApiCookieAuth(ACCESS_TOKEN_COOKIE)
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Roles('USER')
  @Get('subscription')
  @ApiOperation({ summary: 'My plan, Premium end date and price' })
  subscription(@CurrentUser() user: RequestUser) {
    return this.payments.subscriptionStatus(user.id);
  }

  @Roles('USER')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('subscription')
  @ApiOperation({ summary: 'Start paying for (or extending) Premium; returns the checkout URL' })
  startSubscription(@CurrentUser() user: RequestUser) {
    return this.payments.startSubscription(user.id);
  }

  @Roles('USER')
  @Get()
  @ApiOperation({ summary: 'My payment history' })
  list(@CurrentUser() user: RequestUser) {
    return this.payments.listMine(user.id);
  }

  @Roles('USER')
  @Post('test/complete')
  @HttpCode(200)
  @ApiOperation({ summary: 'Test checkout only: finish a payment as paid, failed or cancelled' })
  @ApiBody({ schema: openApiSchema(testCheckoutSchema) })
  async testComplete(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(testCheckoutSchema)) dto: TestCheckoutDto,
  ) {
    const provider = this.payments.provider;
    if (!(provider instanceof TestPaymentProvider)) throw new NotFoundException();
    const mine = await this.prisma.payment.findFirst({ where: { reference: dto.reference, userId: user.id } });
    if (!mine || !provider.complete(dto.reference, dto.outcome)) throw new NotFoundException('Payment not found');
    await this.payments.reconcile(dto.reference, { userGaveUp: dto.outcome !== 'PAID' });
    return this.payments.getMine(user.id, dto.reference);
  }

  @Public()
  @Post('sslcommerz/ipn')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async ipn(@Body() body: GatewayCallback): Promise<string> {
    if (body.tran_id) await this.payments.reconcile(body.tran_id, { valId: body.val_id }).catch(() => undefined);
    return 'OK';
  }

  /** The gateway sends the browser here (form POST) after checkout. */
  @Public()
  @Post('sslcommerz/:outcome')
  @ApiExcludeEndpoint()
  async gatewayReturn(
    @Param('outcome') outcome: string,
    @Body() body: GatewayCallback,
    @Res() res: Response,
  ): Promise<void> {
    let target = '/dashboard/billing';
    if (body.tran_id) {
      try {
        const payment = await this.payments.reconcile(body.tran_id, {
          valId: body.val_id,
          userGaveUp: outcome === 'fail' || outcome === 'cancel',
        });
        target = `/dashboard/payments/${payment.reference}`;
      } catch {
        // Unknown reference: fall back to the billing page.
      }
    }
    res.redirect(303, new URL(target, this.env.WEB_ORIGIN).toString());
  }

  @Roles('USER')
  @Get(':reference')
  @ApiOperation({ summary: 'One of my payments (checks the gateway if still pending)' })
  get(@CurrentUser() user: RequestUser, @Param('reference') reference: string) {
    return this.payments.getMine(user.id, reference);
  }
}

const ledgerSchema = z.object({
  status: z.enum(Object.values(PaymentStatus) as [PaymentStatus]).optional(),
  purpose: z.enum(['APPOINTMENT', 'SUBSCRIPTION']).optional(),
  /** Dhaka calendar dates, inclusive. */
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
type LedgerQuery = z.infer<typeof ledgerSchema>;

const dhakaMidnight = (date: string) => new Date(`${date}T00:00:00+06:00`);

@ApiTags('admin')
@ApiCookieAuth(ACCESS_TOKEN_COOKIE)
@Roles('ADMIN')
@Controller('admin/payments')
export class AdminPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @ApiOperation({ summary: 'Transaction ledger with totals, filterable by status, purpose and dates (FR #19)' })
  ledger(@Query(new ZodValidationPipe(ledgerSchema)) q: LedgerQuery) {
    return this.payments.ledger({
      status: q.status,
      purpose: q.purpose,
      from: q.from ? dhakaMidnight(q.from) : undefined,
      to: q.to ? new Date(dhakaMidnight(q.to).getTime() + DAY_MS) : undefined,
    });
  }

  @Post(':id/refund')
  @ApiOperation({ summary: 'Record that a due refund was sent back to the patient (audited)' })
  @ApiBody({ schema: openApiSchema(refundSchema) })
  refund(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(refundSchema)) dto: RefundDto,
  ) {
    return this.payments.markRefunded(actor.id, id, dto.note);
  }
}
