# Pinglo

A lightweight CRM for customer records and follow-ups, designed for small local businesses.

## Project contents

This is a static web app built with HTML, CSS, and JavaScript. Supabase handles authentication and per-user data storage.

## Setup

See [SUPABASE_SETUP.md](SUPABASE_SETUP.md) for the Supabase configuration and database setup notes. The browser app uses the public publishable key; never place a Supabase secret or `service_role` key in client-side code.

## Deployment

The production app is hosted on Vercel. Vercel serves the static HTML app and the server-side API functions in `api/`.

## In-site feedback email

The Feedback & Suggestions form sends messages through the Vercel Function at `/api/send-feedback` directly to `pinglocrm@gmail.com`. It requires the support Gmail account's App Password as a server-only Vercel environment variable.

1. Turn on 2-Step Verification for `pinglocrm@gmail.com`, then create an App Password for Pinglo. Google requires 2-Step Verification for App Passwords.
2. In Vercel, add `PINGLO_SUPPORT_GMAIL_APP_PASSWORD` as a **Sensitive** environment variable for Production. Add it to Preview and Development only if feedback sending should work there.
3. Redeploy after saving the secret. For local Vercel development, set the same variable in your ignored `.env.local` file.

Never commit the App Password or put it in browser code. The endpoint requires a signed-in Pinglo account and limits each account to five feedback submissions per 15 minutes.

## Razorpay prepaid checkout (test mode)

The Plans & Pricing screen uses Razorpay Standard Checkout. Orders are created by `/api/create-order`; `/api/verify-payment` validates the Razorpay signature, confirms the payment is captured, and updates the existing Supabase plan records. The Razorpay secret and Supabase service key are used only by server functions.

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` for local development and fill in the values. Never commit `.env`.
3. Set the same server variables in the Vercel project for Production, Preview, and Development. Mark `RAZORPAY_KEY_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` as sensitive.
4. Start the local Vercel runtime with `npx vercel dev`, sign in to Pinglo, open **Plans & Pricing**, choose a billing period, and click **Pay with Razorpay**.

The server requires `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. Until all are set, checkout returns a setup message without creating an order. Use Razorpay test credentials for the current test-mode checkout; test payments do not charge real money.

