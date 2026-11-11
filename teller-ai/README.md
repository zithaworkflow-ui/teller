This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Image generation

Text chat, conversation titles, and CyberMail try NVIDIA's Nemotron 3.5 Bolt E4B model first, then fall back to OpenRouter's `openrouter/auto` router if NVIDIA fails. Set both server-side `NVIDIA_API_KEY` and `OPENROUTER_API_KEY` to enable both providers; either provider can serve requests on its own. NVIDIA's endpoint defaults to `https://integrate.api.nvidia.com/v1/chat/completions`; override it with `NVIDIA_API_BASE_URL` and set the chat model with `NVIDIA_CHAT_MODEL` (default `nvidia/nemotron-3.5-bolt-e4b`). Image analysis and audio transcription continue using `NVIDIA_MODEL`, so that model configuration is unchanged. `AI_API_KEY` is accepted as a legacy NVIDIA key variable.

AI replies include an opt-in **Listen** control that formats the reply for speech (removing Markdown and reading link labels instead of URLs) and generates a WAV with NVIDIA's Magpie TTS Zero-Shot model. The shared voice sample is managed by `sizwe@qqwertyworkflow.co.za` in **Account Settings** and is used for speech generation across all accounts. The manager can upload or replace the sample using any browser-supported audio format. The sample is stored in PostgreSQL. The browser automatically takes the first 10 seconds, downmixes to mono, resamples to 22.05 kHz, and encodes 16-bit PCM WAV; recordings must be at least 3 seconds. For initial setup without using the UI, `NVIDIA_TTS_VOICE_PROMPT_PATH` can seed the shared Postgres sample when it has not been uploaded. The sample is sent to NVIDIA with each synthesis request and is not exposed to the browser. `NVIDIA_TTS_API_URL` can override the default NVIDIA hosted endpoint. Magpie Zero-Shot requires NVIDIA access approval; see [NVIDIA's voice-cloning setup](https://docs.nvidia.com/nim/speech/latest/tts/voice-cloning.html). TTS playback requires the user to be signed in; voice-sample uploads are restricted to the manager account.

Image generation uses Cloudflare Workers AI's `@cf/black-forest-labs/flux-2-klein-4b` model by default. Set the server-only `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` values; the token needs Workers AI Read and Edit permissions. `IMAGE_GENERATION_MODEL` can override the model. Generated images default to 1024 × 1024. The app uses the configured NVIDIA vision model to caption generated images and answer follow-up questions about them; keep `NVIDIA_API_KEY` configured for those features. Users can request edits or ask for another variation in the same conversation, and the app uses the latest generated image as the reference. JPEG, PNG, and WebP uploads up to 3 MB are analyzed when the prompt asks a question and used as reference images when the prompt asks for an edit. Reference images are resized to fit within 511 × 511 pixels for FLUX.2 Klein.

Daily image-generation limits are 5 for Free, 25 for Pro, and 30 for Business plans. Limits reset at midnight UTC. When the daily limit is reached, the chat reports that image generation is unavailable until tomorrow.

Account profiles and plan subscriptions are stored in PostgreSQL. Profile updates and PayPal subscription activation do not require Auth0 Management API access. Existing subscribers whose plan was previously stored only in Auth0 metadata need their `teller_user_accounts.plan_key` migrated in PostgreSQL.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## CyberMail: Gmail and Calendar

Choose CyberMail from the Mode menu in the chat prompt to use Google's remote Gmail MCP server for supported Gmail searches, thread reads, and draft creation, and the Google Calendar API for listing and creating primary-calendar events. It never sends email. Creating a Gmail draft or Calendar event requires an explicit confirmation in the chat. Each mode has a separate chat history; switching modes resumes the latest chat in that mode or starts one if none exists.

To enable the Google connection:

1. In Google Cloud, enable the Gmail API, Gmail MCP API, and Google Calendar API for the project.
2. Configure the OAuth consent screen. Add these scopes to the app's Data Access settings:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.compose`
   - `https://www.googleapis.com/auth/calendar.events`
3. Create a **Web application** OAuth client. Add the exact deployed callback URL (for local development, `http://localhost:3000/api/google/callback`) as an authorized redirect URI.
4. Set these server-only environment variables from `.env.example`:
   - `CYBERMAIL_DATABASE_URL` — optional dedicated Postgres connection string for CyberMail's Google OAuth tokens, OAuth states, and pending actions. If omitted, these use `DATABASE_URL`.
   - `GOOGLE_OAUTH_CLIENT_ID`
   - `GOOGLE_OAUTH_CLIENT_SECRET`
   - `GOOGLE_OAUTH_REDIRECT_URI`
   - `GOOGLE_TOKEN_ENCRYPTION_KEY` — a base64-encoded 32-byte key; for example, generate one with `openssl rand -base64 32`.
   - `GMAIL_MCP_SERVER_URL` is optional and defaults to `https://gmailmcp.googleapis.com/mcp/v1`.
5. Ensure `DATABASE_URL` and, if using a separate CyberMail database, `CYBERMAIL_DATABASE_URL` are configured. OAuth tokens are encrypted before being stored in Postgres. If you switch to a new CyberMail database, reconnect the Google account there. Do not put database credentials or Google credentials in `NEXT_PUBLIC_*` variables or commit them.

Google may require OAuth app verification before external users can grant sensitive Gmail and Calendar scopes. While the consent screen is in testing mode, add the intended accounts as test users.

CyberMail treats retrieved email and calendar content as untrusted input. Users should still review draft/event details before confirming. For Google's Gmail MCP setup and security guidance, see [Configure the Gmail MCP server](https://developers.google.com/workspace/gmail/api/guides/configure-mcp-server).

## CyberMaps: interactive maps and directions

Choose CyberMaps from the Mode menu in the chat prompt. Ask it to show a place or give directions, such as “directions from Cape Town Station to Table Mountain by transit.” The app embeds an interactive Google Maps search or directions map and stores the latest map request with the CyberMaps chat.

To enable the embedded map:

1. Enable the **Maps Embed API** in the Google Cloud project.
2. Create an API key and restrict it to the Maps Embed API and your app's HTTP referrers.
3. Set `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY` in `.env.local`. This key is intentionally visible in the browser for the embed request, so restrict it in Google Cloud; do not use an unrestricted key.

Without the key, CyberMaps still provides a link to open the requested search or route in Google Maps. The embedded map provides current interactive Google Maps content; the chat assistant does not claim live traffic or route estimates.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
