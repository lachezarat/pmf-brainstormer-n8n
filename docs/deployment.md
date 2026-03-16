# Deployment

## Recommended Shape

Use a split deployment:

- Netlify for the public case-study or portfolio frontend
- a VPS for `n8n + Postgres`
- Airtable as the external operator database

This project should not run entirely on Netlify. The long-lived n8n service and Postgres database belong on a VPS or similar container host.

## VPS Layout

Recommended services:

- `n8n`
- `postgres`
- reverse proxy with TLS

The simplest production-style setup is still Docker Compose on a VPS.

## Public Access Pattern

Expose only:

- `POST /webhook/pmf-brainstorm`
- `GET /webhook/pmf-brainstorm-status?run_id=<run_id>`
- `POST /webhook/pmf-brainstorm-review`

Protect the public demo with:

- basic auth or demo key for preview environments
- rate limiting
- a portfolio-only domain or subdomain

Suggested domain split:

- `portfolio.example.com` for Netlify
- `api.example.com` for the workflow backend

## Netlify Role

Netlify is best used here for:

- static portfolio pages
- case-study content
- screenshots and architecture copy
- optional lightweight redirect/proxy behavior if you want a nicer frontend path

The actual workflow runtime stays on the VPS.

## Operational Checklist

- keep `.env` private
- rotate any local keys before public release
- back up the workflow JSON files before production changes
- document how to reimport workflows into n8n
- keep Airtable optional so local development does not depend on it
