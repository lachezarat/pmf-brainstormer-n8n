# Deployment

## Portfolio Default

For this project, the default portfolio setup is:

- public GitHub repository
- workflow screenshots
- Mermaid diagrams in the docs
- Airtable screenshots if the control plane is enabled

That is enough to present the architecture without publishing a live runtime.

## If You Later Want A Live Demo

Only deploy the backend stack:

- `n8n`
- `postgres`
- reverse proxy with TLS

The simplest production-style setup is Docker Compose on a VPS or similar container host with persistent storage.

## Public Access Pattern

If you choose to expose a live demo later, keep the public surface narrow:

- `POST /webhook/pmf-brainstorm`
- `GET /webhook/pmf-brainstorm-status?run_id=<run_id>`
- `POST /webhook/pmf-brainstorm-review`

Protect it with:

- basic auth or a demo key
- rate limiting
- a portfolio-only domain or subdomain

## Operational Checklist

- keep `.env` private
- rotate any local keys before public release
- back up the workflow JSON files before production changes
- document how to reimport workflows into n8n
- keep Airtable optional so local development does not depend on it
