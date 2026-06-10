# LINE Bot Edge Function

This directory contains the Supabase Edge Function that acts as a webhook handler for our LINE Bot integration.

## 🚨 CRITICAL DEPLOYMENT INSTRUCTION

Every time you deploy this function, you **MUST** include the `--no-verify-jwt` flag.

### Command
```bash
supabase functions deploy line-bot --no-verify-jwt
```

### Why is this flag required?
By default, Supabase Edge Functions require a valid Supabase JWT in the `Authorization` header. Since LINE webhooks are sent directly from LINE's servers, they do not include this header.

- **If you omit this flag:** Supabase's API Gateway will reject all incoming LINE messages with an **HTTP 401 Unauthorized** error before they even reach Deno. The bot will stop responding completely.
- **If you use this flag:** The gateway will allow the requests to pass through to Deno, where the function will securely verify the request authenticity using the LINE Channel Signature check (`x-line-signature` header verified with the `LINE_CHANNEL_SECRET`).
