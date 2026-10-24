import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { ENV, type Env } from '../config/env.js';
import { renderEmail, type EmailInput } from './templates.js';

export interface OutgoingEmail extends EmailInput {
  to: string;
}

/**
 * Sends email over SMTP (e.g. Gmail with an App Password). Without SMTP
 * credentials, or in tests, emails are logged instead of sent.
 */
@Injectable()
export class MailService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MailService.name);
  private readonly transport?: Transporter;
  private readonly from: string;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.from = env.MAIL_FROM || `MindEase Oasis <${env.SMTP_USER ?? 'no-reply@mindease.local'}>`;
    if (env.SMTP_USER && env.SMTP_PASS && env.NODE_ENV !== 'test') {
      this.transport = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      });
    }
  }

  get enabled(): boolean {
    return !!this.transport;
  }

  async onApplicationBootstrap() {
    if (!this.transport) {
      if (this.env.NODE_ENV !== 'test') {
        this.logger.log('SMTP not configured: emails will be logged, not sent');
      }
      return;
    }
    try {
      await this.transport.verify();
      this.logger.log(`SMTP ready (${this.env.SMTP_HOST} as ${this.env.SMTP_USER})`);
    } catch (err) {
      this.logger.warn(`SMTP login failed, check SMTP_USER/SMTP_PASS: ${describe(err)}`);
    }
  }

  /**
   * Queues an email and returns immediately. A delivery failure is logged and
   * never fails the request that triggered it.
   */
  send(email: OutgoingEmail): void {
    void this.deliver(email);
  }

  /** Sends and resolves once delivered (or logged). Never rejects. */
  async deliver({ to, ...input }: OutgoingEmail): Promise<boolean> {
    const content = renderEmail(input);
    if (!this.transport) {
      this.logger.log(`Email to ${to}: ${content.subject}`);
      return false;
    }
    try {
      await this.transport.sendMail({ from: this.from, to, ...content });
      return true;
    } catch (err) {
      this.logger.error(`Email to ${to} failed (${content.subject}): ${describe(err)}`);
      return false;
    }
  }

  /** Absolute link into the web app for a path like /dashboard/appointments. */
  link(path: string): string {
    return new URL(path, this.env.WEB_ORIGIN).toString();
  }
}

function describe(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 300);
}
