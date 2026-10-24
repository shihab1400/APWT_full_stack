import type { Env } from '../config/env.js';
import { MailService } from './mail.service.js';
import { renderEmail } from './templates.js';

describe('renderEmail', () => {
  const email = renderEmail({
    subject: 'Hello',
    name: 'Rahat <script>',
    paragraphs: ['Reason: "late" & <b>busy</b>'],
    action: { label: 'Open', url: 'http://localhost:3000/doctor?a=1&b=2' },
  });

  it('escapes user text in the HTML version', () => {
    expect(email.html).toContain('Hi Rahat &lt;script&gt;,');
    expect(email.html).toContain('Reason: &quot;late&quot; &amp; &lt;b&gt;busy&lt;/b&gt;');
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('href="http://localhost:3000/doctor?a=1&amp;b=2"');
  });

  it('has a plain-text version with the link and crisis lines', () => {
    expect(email.text).toContain('Open: http://localhost:3000/doctor?a=1&b=2');
    expect(email.text).toContain('999');
    expect(email.text).toContain('01568978234');
  });
});

describe('MailService', () => {
  const base = { NODE_ENV: 'development', WEB_ORIGIN: 'http://localhost:3000', SMTP_HOST: 'smtp.example.com', SMTP_PORT: 465, SMTP_SECURE: true } as Env;

  it('only logs when SMTP is not configured', async () => {
    const mail = new MailService(base);
    expect(mail.enabled).toBe(false);
    expect(await mail.deliver({ to: 'a@b.test', subject: 's', paragraphs: [] })).toBe(false);
  });

  it('never sends in tests', () => {
    expect(new MailService({ ...base, NODE_ENV: 'test', SMTP_USER: 'u', SMTP_PASS: 'p' }).enabled).toBe(false);
  });

  it('sends through the transport and swallows delivery errors', async () => {
    const mail = new MailService({ ...base, SMTP_USER: 'me@gmail.com', SMTP_PASS: 'app-password' });
    const sent: Record<string, unknown>[] = [];
    let fail = false;
    (mail as unknown as { transport: unknown }).transport = {
      sendMail: async (m: Record<string, unknown>) => {
        if (fail) throw new Error('535 auth failed');
        sent.push(m);
      },
    };

    expect(await mail.deliver({ to: 'a@b.test', subject: 'Hi', paragraphs: ['x'] })).toBe(true);
    expect(sent[0]).toMatchObject({ from: 'MindEase Oasis <me@gmail.com>', to: 'a@b.test', subject: 'Hi' });

    fail = true;
    expect(await mail.deliver({ to: 'a@b.test', subject: 'Hi', paragraphs: ['x'] })).toBe(false);
  });

  it('builds absolute links into the web app', () => {
    expect(new MailService(base).link('/verify-email?token=abc')).toBe('http://localhost:3000/verify-email?token=abc');
  });
});
