# Pinglo

A lightweight CRM for customer records and follow-ups, designed for small local businesses.

## Project contents

This is a static web app built with HTML, CSS, and JavaScript. Supabase handles authentication and per-user data storage.

## Setup

See [SUPABASE_SETUP.md](SUPABASE_SETUP.md) for the Supabase configuration and database setup notes. The browser app uses the public publishable key; never place a Supabase secret or `service_role` key in client-side code.

## Deployment

The production app is hosted on Cloudflare Workers. This repository contains the app source and Supabase migration.

