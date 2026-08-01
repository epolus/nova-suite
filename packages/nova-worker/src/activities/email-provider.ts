/* SPDX-License-Identifier: AGPL-3.0-only */
import nodemailer from 'nodemailer';
import { config } from '../config';

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string | null;
  html: string | null;
};

export type SendEmailResult = {
  accepted: boolean;
  providerMessageId: string | null;
  error?: string;
};

export interface EmailProvider {
  send(input: SendEmailInput): Promise<SendEmailResult>;
}

class DisabledEmailProvider implements EmailProvider {
  async send(): Promise<SendEmailResult> {
    return {
      accepted: false,
      providerMessageId: null,
      error: 'Email notifications are disabled',
    };
  }
}

class SmtpEmailProvider implements EmailProvider {
  private readonly transporter = nodemailer.createTransport({
    host: config.notifications.smtp.host,
    port: config.notifications.smtp.port,
    secure: config.notifications.smtp.secure,
    auth: config.notifications.smtp.user
      ? { user: config.notifications.smtp.user, pass: config.notifications.smtp.pass }
      : undefined,
  });

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    try {
      const info = await this.transporter.sendMail({
        from: config.notifications.sender,
        to: input.to,
        subject: input.subject,
        text: input.text || undefined,
        html: input.html || undefined,
      });
      return {
        accepted: info.accepted.length > 0,
        providerMessageId: info.messageId || null,
      };
    } catch (err) {
      return {
        accepted: false,
        providerMessageId: null,
        error: err instanceof Error ? err.message : 'unknown email send error',
      };
    }
  }
}

let provider: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (provider) return provider;
  const smtpConfigured = Boolean(config.notifications.smtp.host);
  provider = config.notifications.emailEnabled && smtpConfigured
    ? new SmtpEmailProvider()
    : new DisabledEmailProvider();
  return provider;
}

