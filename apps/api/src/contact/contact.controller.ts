import { Body, Controller, Logger, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { contactSchema, type ContactDto, type ContactReceipt } from '@mindease/shared';
import { Public } from '../common/decorators.js';
import { ZodValidationPipe, openApiSchema } from '../common/zod.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { referenceOf } from './reference.js';

@ApiTags('contact')
@Controller('contact')
export class ContactController {
  private readonly logger = new Logger(ContactController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  @ApiOperation({ summary: 'Send a message to support (no login needed)' })
  @ApiBody({ schema: openApiSchema(contactSchema) })
  async submit(@Body(new ZodValidationPipe(contactSchema)) dto: ContactDto): Promise<ContactReceipt> {
    const msg = await this.prisma.contactMessage.create({ data: dto });
    const reference = referenceOf(msg.id);
    // Email delivery arrives in a later phase; the on-screen receipt is the confirmation for now.
    this.logger.log(`Contact message ${reference} received from ${msg.email}`);
    return { reference, receivedAt: msg.createdAt.toISOString() };
  }
}

