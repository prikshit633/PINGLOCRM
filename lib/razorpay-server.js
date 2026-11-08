'use strict';

const Razorpay = require('razorpay');

const supabaseUrl = () => String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const publishableKey = () => process.env.SUPABASE_PUBLISHABLE_KEY || '';
const serviceRoleKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  return null;
}

function missingPaymentEnvironment() {
  return ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY']
    .filter(key => !process.env[key]);
}

async function authenticate(req) {
  const baseUrl = supabaseUrl();
  const publicKey = publishableKey();
  if (!baseUrl || !publicKey) return { status: 503, error: 'Authentication service is not configured.' };
  const authorization = req.headers.authorization || req.headers.Authorization || '';
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { status: 401, error: 'Sign in is required.' };

  try {
    const response = await fetch(`${baseUrl}/auth/v1/user`, {
      headers: { apikey: publicKey, Authorization: `Bearer ${token}` }
    });
    if (response.status === 401 || response.status === 403) return { status: 401, error: 'Your session has expired. Sign in again.' };
    if (!response.ok) return { status: 503, error: 'Could not validate your account.' };
    const user = await response.json();
    if (!user?.id) return { status: 401, error: 'Sign in is required.' };
    return { user };
  } catch {
    return { status: 503, error: 'Could not connect to the account service.' };
  }
}

function razorpayClient() {
  return new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
}

function adminHeaders(prefer = '') {
  const key = serviceRoleKey();
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json'
  };
  if (prefer) headers.Prefer = prefer;
  return headers;
}

async function databaseRequest(path, options = {}) {
  return fetch(`${supabaseUrl()}/rest/v1/${path}`, {
    ...options,
    headers: { ...adminHeaders(options.prefer || ''), ...(options.headers || {}) }
  });
}

function signatureMatches(orderId, paymentId, signature) {
  if (!/^[a-f0-9]{64}$/i.test(signature || '')) return false;
  const expected = require('node:crypto')
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest();
  const received = Buffer.from(signature, 'hex');
  return received.length === expected.length && require('node:crypto').timingSafeEqual(expected, received);
}

function addDays(dateString, days) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateString || '')
    ? new Date(`${dateString}T00:00:00.000Z`)
    : new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

module.exports = {
  addDays,
  adminHeaders,
  authenticate,
  databaseRequest,
  json,
  missingPaymentEnvironment,
  parseBody,
  razorpayClient,
  signatureMatches,
  supabaseUrl
};

