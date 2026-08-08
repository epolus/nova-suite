/* SPDX-License-Identifier: AGPL-3.0-only */
import nodemailer from 'nodemailer';
import type { AutomationSendEmail } from '@nova-suite/shared';

export const sendAutomationEmail: AutomationSendEmail = async (input) => {
  if (process.env.MAIL_NOTIFICATIONS_ENABLED !== 'true' || !process.env.SMTP_HOST) {
    return { ok: false, error: 'Email is not configured (MAIL_NOTIFICATIONS_ENABLED / SMTP_HOST)' };
  }
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number.parseInt(process.env.SMTP_PORT || '587', 10) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
        : undefined,
    });
    const info = await transporter.sendMail({
      from: process.env.MAIL_FROM || 'no-reply@nova.local',
      to: input.to,
      subject: input.subject,
      text: input.text,
    });
    const accepted = Array.isArray(info.accepted) && info.accepted.length > 0;
    return accepted ? { ok: true } : { ok: false, error: 'SMTP accepted no recipients' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
};
