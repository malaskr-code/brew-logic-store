---
name: api-through-secrets
description: Use when adding or changing any external API call, secret, or server route.
---

# External APIs through Secrets

- Store every API URL and key in Replit Secrets. Never write them in code or send them to the browser.
- Put each external API behind a server route under /api/. The frontend calls only /api/ routes.
- Return only the fields the page needs.
- Cache responses on the server for as long as the data stays fresh.
- Define a fallback when a call fails, so the page still works.
- Location lookups must use the visitor's IP from the x-forwarded-for header, not the server's IP.
- Keep any attribution link a provider requires.
- Existing secrets: EXCHANGE_RATE_API_URL, GEO_API_URL, GROQ_API_KEY, GROQ_MODEL.
- Existing routes: /api/rates, /api/geo, /api/chat.
