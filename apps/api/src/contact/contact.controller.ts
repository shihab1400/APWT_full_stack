import { Body, Controller, Logger, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { contactSchema, type ContactDto, type ContactReceipt } from '@mindease/shared';
import { Public } from '../common/decorators.js';
import { ZodValidationPipe, openApiSchema } from '../common/zod.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { referenceOf } from './reference.js';

@ApiTags('contact')
@Controller('contact')
export class ContactController {
  private readonly logger = new Logger(ContactController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  @ApiOperation({ summary: 'Send a message to support (no login needed)' })
  @ApiBody({ schema: openApiSchema(contactSchema) })
  async submit(@Body(new ZodValidationPipe(contactSchema)) dto: ContactDto): Promise<ContactReceipt> {
    const msg = await this.prisma.contactMessage.create({ data: dto });
    const reference = referenceOf(msg.id);
    this.logger.log(`Contact message ${reference} received from ${msg.email}`);
    // Nothing the visitor typed is echoed back, so the form can't relay text to an arbitrary address.
    this.mail.send({
      to: msg.email,
      subject: `We received your message (${reference})`,
      paragraphs: [
        `Thank you for contacting MindEase Oasis. Your reference number is ${reference}.`,
        'Our support team will reply to this address. Please keep the reference number in case you need to follow up.',
      ],
    });
    return { reference, receivedAt: msg.createdAt.toISOString() };
  }
}

