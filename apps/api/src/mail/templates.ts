export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

export interface EmailInput {
  subject: string;
  /** Greeting name, e.g. the recipient's first name. */
  name?: string;
  /** Paragraphs of plain text; escaped for HTML. */
  paragraphs: string[];
  /** Optional call to action. `url` must be absolute. */
  action?: { label: string; url: string };
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const FOOTER =
  'If you are in crisis, call 999 or the MindEase Emergency Service on 01568978234 (24/7, free).';

/** One plain layout for every email, rendered as HTML and as text. */
export function renderEmail(input: EmailInput): EmailContent {
  const greeting = input.name ? `Hi ${input.name},` : 'Hello,';

  const text = [
    greeting,
    ...input.paragraphs,
    ...(input.action ? [`${input.action.label}: ${input.action.url}`] : []),
    '— MindEase Oasis',
    FOOTER,
  ].join('\n\n');

  const p = (s: string, style = '') =>
    `<p style="margin:0 0 16px;line-height:1.6;${style}">${escapeHtml(s)}</p>`;
  const button = input.action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(input.action.url)}" style="background:#2f7d73;color:#ffffff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">${escapeHtml(input.action.label)}</a></p>`
    : '';

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f7f8f6;font-family:Arial,Helvetica,sans-serif;color:#1f2a2a">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #dfe5e2;border-radius:16px" cellspacing="0" cellpadding="0"><tr><td style="padding:28px">
<p style="margin:0 0 20px;font-weight:700;color:#2f7d73">◎ MindEase Oasis</p>
${p(greeting)}
${input.paragraphs.map((s) => p(s)).join('\n')}
${button}
<p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#5d6b6a">${escapeHtml(FOOTER)}</p>
</td></tr></table>
</td></tr></table>
</body></html>`;

  return { subject: input.subject, text, html };
}
