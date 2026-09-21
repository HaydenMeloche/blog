# Resume API Worker

This Worker exposes the resume at `https://api.hayden.dev/resume` and selects a representation from the request's `Accept` header:

- `application/json` → `/resume/index.json`
- `text/markdown` or `text/plain` → `/resume/index.md`
- `text/html` or no matching header → `/resume/`

## Deploy

From this directory:

```bash
npx wrangler login
npx wrangler deploy
```

The `api.hayden.dev` custom domain must be in the same Cloudflare account and zone as the Worker.
