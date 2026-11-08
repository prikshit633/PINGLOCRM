# Pinglo

A lightweight CRM for customer records and follow-ups, designed for small local businesses.

## Project contents

This is a static web app built with HTML, CSS, and JavaScript. Supabase handles authentication and per-user data storage.

## Setup

See [SUPABASE_SETUP.md](SUPABASE_SETUP.md) for the Supabase configuration and database setup notes. The browser app uses the public publishable key; never place a Supabase secret or `service_role` key in client-side code.

## Deployment

The production app is hosted on Vercel. Vercel serves the static HTML app and the server-side API functions in `api/`.

## Razorpay prepaid checkout (test mode)

The Plans & Pricing screen uses Razorpay Standard Checkout. Orders are created by `/api/create-order`; `/api/verify-payment` validates the Razorpay signature, confirms the payment is captured, and updates the existing Supabase plan records. The Razorpay secret and Supabase service key are used only by server functions.

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` for local development and fill in the values. Never commit `.env`.
3. Set the same server variables in the Vercel project for Production, Preview, and Development. Mark `RAZORPAY_KEY_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` as sensitive.
4. Start the local Vercel runtime with `npx vercel dev`, sign in to Pinglo, open **Plans & Pricing**, choose a billing period, and click **Pay with Razorpay**.

The server requires `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. Until all are set, checkout returns a setup message without creating an order. Use Razorpay test credentials for the current test-mode checkout; test payments do not charge real money.

