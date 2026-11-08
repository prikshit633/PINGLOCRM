'use strict';

const {
  addDays,
  authenticate,
  databaseRequest,
  json,
  missingPaymentEnvironment,
  parseBody,
  razorpayClient,
  signatureMatches
} = require('../lib/razorpay-server');

function isOrderId(value) { return typeof value === 'string' && /^order_[A-Za-z0-9]+$/.test(value); }
function isPaymentId(value) { return typeof value === 'string' && /^pay_[A-Za-z0-9]+$/.test(value); }

module.exports = async function verifyPayment(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Method not allowed.' });
  }

  const auth = await authenticate(req);
  if (auth.error) return json(res, auth.status, { error: auth.error });

  const missing = missingPaymentEnvironment();
  if (missing.length) {
    console.error('Razorpay verification setup is missing server environment variables:', missing.join(', '));
    return json(res, 503, { error: 'Secure payment verification is still being configured.' });
  }

  const body = parseBody(req) || {};
  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = body;
  if (!orderId || !paymentId || !signature) return json(res, 400, { error: 'Payment verification details are incomplete.' });
  if (!isOrderId(orderId) || !isPaymentId(paymentId) || typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature)) {
    return json(res, 400, { error: 'Payment verification details are invalid.' });
  }

  try {
    const query = new URLSearchParams({
      select: 'id,user_id,razorpay_order_id,razorpay_payment_id,plan_cycle,amount_paise,status',
      user_id: `eq.${auth.user.id}`,
      razorpay_order_id: `eq.${orderId}`,
      limit: '1'
    });
    const orderResponse = await databaseRequest(`pinglo_plan_orders?${query}`);
    if (!orderResponse.ok) {
      console.error('Could not read the Razorpay order record; Supabase returned status', orderResponse.status);
      return json(res, 503, { error: 'Could not verify this order right now.' });
    }
    const [order] = await orderResponse.json();
    if (!order) return json(res, 404, { error: 'This payment order does not belong to your account.' });
    if (order.status !== 'created' && order.status !== 'paid') return json(res, 400, { error: 'This order is not available for payment verification.' });
    if (!signatureMatches(order.razorpay_order_id, paymentId, signature)) {
      return json(res, 400, { error: 'Razorpay signature verification failed. The payment was not applied.' });
    }

    const payment = await razorpayClient().payments.fetch(paymentId);
    if (payment.order_id !== order.razorpay_order_id || payment.amount !== order.amount_paise || payment.currency !== 'INR') {
      return json(res, 400, { error: 'The payment details do not match this order.' });
    }
    if (payment.status !== 'captured' || payment.captured !== true) {
      return json(res, 409, { error: 'The payment is not captured yet. Please retry verification shortly.' });
    }
    if (order.status === 'paid') {
      if (order.razorpay_payment_id !== paymentId) return json(res, 400, { error: 'This order was already paid with a different payment.' });
      return json(res, 200, { verified: true, status: 'paid' });
    }

    const profileQuery = new URLSearchParams({
      select: 'user_id,plan_tier,pro_valid_until,last_payment_id',
      user_id: `eq.${auth.user.id}`,
      limit: '1'
    });
    const profileResponse = await databaseRequest(`pinglo_profiles?${profileQuery}`);
    if (!profileResponse.ok) {
      console.error('Could not read the Pinglo plan profile; Supabase returned status', profileResponse.status);
      return json(res, 503, { error: 'Payment verified, but the plan could not be updated. Please contact support.' });
    }
    const [profile] = await profileResponse.json();
    if (!profile) return json(res, 503, { error: 'Payment verified, but the account profile is not ready for plan activation.' });

    let validUntil = profile.pro_valid_until;
    if (profile.last_payment_id !== paymentId) {
      const today = new Date().toISOString().slice(0, 10);
      const startsFrom = profile.pro_valid_until && profile.pro_valid_until > today ? profile.pro_valid_until : today;
      const termDays = order.plan_cycle === 'annual' ? 365 : 30;
      validUntil = addDays(startsFrom, termDays);

      const profileUpdate = await databaseRequest(`pinglo_profiles?user_id=eq.${encodeURIComponent(auth.user.id)}`, {
        method: 'PATCH',
        prefer: 'return=representation',
        body: JSON.stringify({ plan_tier: 'pro', pro_valid_until: validUntil, last_payment_id: paymentId })
      });
      if (!profileUpdate.ok || !(await profileUpdate.json()).length) {
        console.error('Could not activate the verified Premium Pro plan; Supabase returned status', profileUpdate.status);
        return json(res, 503, { error: 'Payment verified, but the plan could not be activated. Please contact support.' });
      }
    }

    const paidUpdate = await databaseRequest(`pinglo_plan_orders?id=eq.${encodeURIComponent(order.id)}&status=eq.created`, {
      method: 'PATCH',
      prefer: 'return=representation',
      body: JSON.stringify({ status: 'paid', razorpay_payment_id: paymentId, paid_at: new Date().toISOString() })
    });
    if (!paidUpdate.ok) {
      console.error('Could not mark the verified Razorpay order paid; Supabase returned status', paidUpdate.status);
      return json(res, 503, { error: 'Payment verified, but its receipt could not be saved. Please retry.' });
    }
    const paidRows = await paidUpdate.json();
    if (!paidRows.length) {
      const latest = await databaseRequest(`pinglo_plan_orders?select=status,razorpay_payment_id&id=eq.${encodeURIComponent(order.id)}&limit=1`);
      const [existing] = latest.ok ? await latest.json() : [];
      if (existing?.status !== 'paid' || existing.razorpay_payment_id !== paymentId) {
        return json(res, 409, { error: 'This payment order changed while it was being verified. Please contact support.' });
      }
    }

    return json(res, 200, { verified: true, status: 'paid', plan: 'pro', valid_until: validUntil });
  } catch (error) {
    const code = error?.statusCode === 401 || error?.statusCode === 403 ? 401 : 500;
    console.error('Razorpay payment verification failed with status', error?.statusCode || 'unknown');
    return json(res, code, { error: code === 401 ? 'Razorpay credentials could not be authenticated.' : 'Could not verify the payment. Please retry or contact support.' });
  }
};

