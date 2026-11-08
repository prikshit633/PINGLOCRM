'use strict';

const {
  authenticate,
  databaseRequest,
  json,
  missingPaymentEnvironment,
  parseBody,
  razorpayClient
} = require('../lib/razorpay-server');

const PRICE_PAISE = { monthly: 29900, annual: 249900 };

module.exports = async function createOrder(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Method not allowed.' });
  }

  const auth = await authenticate(req);
  if (auth.error) return json(res, auth.status, { error: auth.error });

  const missing = missingPaymentEnvironment();
  if (missing.length) {
    console.error('Razorpay checkout setup is missing server environment variables:', missing.join(', '));
    return json(res, 503, { error: 'Secure checkout is still being configured. Please try again later.' });
  }

  const body = parseBody(req);
  const cycle = body?.cycle;
  if (!Object.hasOwn(PRICE_PAISE, cycle)) return json(res, 400, { error: 'Choose a valid Premium Pro billing period.' });

  const amount = PRICE_PAISE[cycle];
  if (!Number.isInteger(amount) || amount < 100) return json(res, 400, { error: 'The payment amount is below Razorpay’s minimum.' });

  try {
    const receipt = `pl${auth.user.id.slice(0, 8)}${require('node:crypto').randomBytes(12).toString('hex')}`;
    const order = await razorpayClient().orders.create({
      amount,
      currency: 'INR',
      receipt,
      notes: { user_id: auth.user.id, plan_cycle: cycle }
    });

    const saved = await databaseRequest('pinglo_plan_orders', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify({
        user_id: auth.user.id,
        razorpay_order_id: order.id,
        plan_cycle: cycle,
        amount_paise: amount,
        status: 'created'
      })
    });
    if (!saved.ok) {
      console.error('Could not save Razorpay order record; Supabase returned status', saved.status);
      return json(res, 500, { error: 'Could not prepare this checkout. Please try again.' });
    }

    return json(res, 200, {
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: process.env.RAZORPAY_KEY_ID,
      cycle
    });
  } catch (error) {
    const code = error?.statusCode === 401 || error?.statusCode === 403 ? 401 : 500;
    console.error('Razorpay order creation failed with status', error?.statusCode || 'unknown');
    return json(res, code, { error: code === 401 ? 'Razorpay credentials could not be authenticated.' : 'Could not create a payment order. Please try again.' });
  }
};

