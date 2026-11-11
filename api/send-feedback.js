'use strict';

const nodemailer = require('nodemailer');
const { authenticate, json, parseBody } = require('../lib/razorpay-server');

const SUPPORT_EMAIL = 'pinglocrm@gmail.com';
const CATEGORY_LABELS = {
  suggestion: 'Suggestion',
  issue: 'Report a problem',
  other: 'Other feedback'
};
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT = 5;
const attemptsByUser = new Map();

function allowSubmission(userId) {
  const now = Date.now();
  for (const [id, timestamps] of attemptsByUser) {
    const recent = timestamps.filter(timestamp => now - timestamp < RATE_WINDOW_MS);
    if (recent.length) attemptsByUser.set(id, recent);
    else attemptsByUser.delete(id);
  }
  const recent = attemptsByUser.get(userId) || [];
  if (recent.length >= RATE_LIMIT) return false;
  recent.push(now);
  attemptsByUser.set(userId, recent);
  return true;
}

function cleanBusinessName(value) {
  return String(value || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 120);
}

module.exports = async function sendFeedback(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Method not allowed.' });
  }

  const auth = await authenticate(req);
  if (auth.error) return json(res, auth.status, { error: auth.error });

  const body = parseBody(req) || {};
  if (typeof body.website === 'string' && body.website.trim()) {
    return json(res, 200, { ok: true });
  }

  const category = body.category;
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!Object.hasOwn(CATEGORY_LABELS, category)) {
    return json(res, 400, { error: 'Choose a valid feedback type.' });
  }
  if (message.length < 10 || message.length > 1500) {
    return json(res, 400, { error: 'Please enter a message between 10 and 1500 characters.' });
  }

  if (!process.env.PINGLO_SUPPORT_GMAIL_APP_PASSWORD) {
    console.error('Pinglo feedback email is not configured: missing app password.');
    return json(res, 503, { error: 'In-site email is not configured yet. Please try again later.' });
  }
  if (!allowSubmission(auth.user.id)) {
    return json(res, 429, { error: 'You have sent several messages. Please try again in 15 minutes.' });
  }

  const accountEmail = typeof auth.user.email === 'string'
    && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(auth.user.email)
    ? auth.user.email
    : '';
  const businessName = cleanBusinessName(body.businessName);
  const subject = 'Pinglo feedback: ' + CATEGORY_LABELS[category];
  const text = [
    'Feedback type: ' + CATEGORY_LABELS[category],
    'Business: ' + (businessName || 'Not provided'),
    'Account email: ' + (accountEmail || 'Not provided'),
    '',
    message
  ].join('\n');

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: SUPPORT_EMAIL,
        pass: process.env.PINGLO_SUPPORT_GMAIL_APP_PASSWORD.replace(/\s+/g, '')
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000
    });
    await transporter.sendMail({
      from: { name: 'Pinglo Support', address: SUPPORT_EMAIL },
      to: SUPPORT_EMAIL,
      replyTo: accountEmail || undefined,
      subject,
      text
    });
    return json(res, 200, { ok: true });
  } catch (error) {
    console.error('Pinglo feedback email failed:', error?.code || error?.responseCode || 'unknown error');
    return json(res, 502, { error: 'Pinglo could not send your message. Please try again later.' });
  }
};
