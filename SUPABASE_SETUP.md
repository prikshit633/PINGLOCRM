# Pinglo Supabase setup

Pinglo is connected to the Supabase project `pmmiolofzrwgkgnsnzvk`. The database tables and per-user row security policies have already been created in that project.

## Run the app

Open the app through a local web server or its deployed website. Email/password and database calls may work from a local file, but social sign-in and password-reset redirects need a web address; a local server is recommended while developing.

## Email and password

Email/password sign-in is handled by Supabase Auth. If email confirmation is enabled in the Supabase project, a new user must confirm their email before signing in.

## Google and Apple sign-in

In the Supabase dashboard, open **Authentication → Sign In / Providers** and configure Google and/or Apple with their OAuth credentials. Enable each provider after its credentials are saved.

For Pinglo's production deployment, use these values in **Authentication → URL Configuration**:

- **Site URL:** `https://shrill-silence-d679.prikshitcanva.workers.dev/`
- **Allowed redirect URL:** `https://shrill-silence-d679.prikshitcanva.workers.dev/`

The app returns to its current page after sign-in, so add the exact deployed URL above. Add the localhost URL and path used during development as a separate allowed redirect URL if you still use the local version.

The OAuth provider's callback URL is different from the app URL. For Google and Apple provider setup, use `https://pmmiolofzrwgkgnsnzvk.supabase.co/auth/v1/callback` as the callback URL in the provider's console.

## Data and access

The app stores customer records, business profile details, and the five message templates in `pinglo_customers`, `pinglo_profiles`, and `pinglo_templates`. Row Level Security restricts each signed-in user to rows with their own user ID. The browser uses only the public publishable key in `supabase-config.js`; never add a secret or `service_role` key to the web app.
