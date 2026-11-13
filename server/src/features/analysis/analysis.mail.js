import nodemailer from 'nodemailer';
import { notificationRecipient } from '../pullRequest/github.app.js';
import { claimEmailNotification, saveEmailNotification } from './analysis.repository.js';

const emailAddress = value => typeof value === 'string' && value.length <= 254 && /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(value);

// Delivery is a separate outcome; a mail outage must never undo a saved review.
async function sendReviewEmail(report, userId, { getRecipient = notificationRecipient, transport } = {}) {
  if (process.env.EMAIL_ENABLED !== 'true' || !userId) return { status: 'skipped' };
  let notification;
  try {
    if (!await claimEmailNotification(report.id)) return { status: 'skipped' };
    const to = await getRecipient(userId, report);
    if (!to) notification = { status: 'skipped' };
    else {
      const origin = new URL(process.env.APP_ORIGIN || '');
      if (origin.origin !== process.env.APP_ORIGIN || (origin.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && origin.protocol === 'http:')) || !emailAddress(to) || !emailAddress(process.env.EMAIL_FROM) || !/^[a-z\d_-]{1,128}$/i.test(report.id)) throw Error('Invalid notification configuration.');
      const port = Number(process.env.SMTP_PORT || 587);
      if (!transport) {
        if (!process.env.SMTP_HOST || ![465, 587].includes(port)) throw Error('SMTP unavailable.');
        transport = nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465, requireTLS: port === 587,
          connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000,
          ...(process.env.SMTP_USER ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } } : {}) });
      }
      const status = report.aiStatus === 'completed' ? 'AI review completed' : report.aiStatus === 'partial' ? 'AI review partial' : 'AI review unavailable; rule-based results remain available';
      // Only an access-controlled link/status is mailed, never findings or private code.
      await transport.sendMail({ from: process.env.EMAIL_FROM, to, subject: 'PRism AI review ready', text: `${status}.\nThis review is advisory, not merge approval.\nOpen your report: ${origin.origin}/analyses/${report.id}` });
      notification = { status: 'sent' };
    }
  } catch { notification = { status: 'unavailable', errorCode: 'EMAIL_DELIVERY_FAILED' }; }
  try { await saveEmailNotification(report.id, notification); } catch { /* Keep delivery failure separate from review persistence. */ }
  return notification;
}

export { sendReviewEmail };
