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

Production sign-in opens an in-app dialog and uses Auth0's popup flow with the
`google-oauth2` connection only. Enable that Google connection in Auth0 and
allow the deployed app URL as an Auth0 callback URL. Local development retains
the app's labeled local test account.

## Image generation

Text chat and CyberMail use NVIDIA's Nemotron 3.5 Bolt E4B model. Conversation titles are generated from the first non-empty user message; title generation and image-intent classification use Moonshot AI's Kimi K3.1 Pro through NVIDIA's API by default, overridable independently with `NVIDIA_TITLE_MODEL` and `NVIDIA_CLASSIFIER_MODEL`. Set the server-side `NVIDIA_API_KEY`; there is no provider fallback. NVIDIA's endpoint defaults to `https://integrate.api.nvidia.com/v1/chat/completions`; override it with `NVIDIA_API_BASE_URL` and set the chat model with `NVIDIA_CHAT_MODEL` (default `nvidia/nemotron-3.5-bolt-e4b`). Image analysis and audio transcription use `NVIDIA_MODEL` (configured as Nemotron 3.5 Super VL in `.env.local`).

AI replies include an opt-in **Listen** control that formats the reply for speech (removing Markdown and reading link labels instead of URLs). While audio plays, the current spoken text is displayed under the reply. NVIDIA's Magpie TTS Zero-Shot model generates WAV audio first; if NVIDIA is unavailable, speech falls back to OpenRouter's `heygen/heygen-voice-1-turbo:free` model and returns WAV. Both providers use the shared voice sample. Set the server-only `OPENROUTER_API_KEY` to enable the TTS fallback; it is used only for speech. The sample is managed by `orticalinkworkflow@gmail.com` in **Account Settings** and is used for speech generation across all accounts. The manager can upload or replace the sample using any browser-supported audio format. The sample is stored in PostgreSQL. The browser automatically takes the first 10 seconds, downmixes to mono, resamples to 22.05 kHz, and encodes 16-bit PCM WAV; recordings must be at least 3 seconds. For initial setup without using the UI, `NVIDIA_TTS_VOICE_PROMPT_PATH` can seed the shared Postgres sample when it has not been uploaded. The sample is sent to the speech provider with each synthesis request and is not exposed to the browser. `NVIDIA_TTS_API_URL` can override the default NVIDIA hosted endpoint. Magpie Zero-Shot requires NVIDIA access approval; see [NVIDIA's voice-cloning setup](https://docs.nvidia.com/nim/speech/latest/tts/voice-cloning.html). TTS playback requires the user to be signed in; voice-sample uploads are restricted to the manager account.

The verified `orticalinkworkflow@gmail.com` manager can download a JSON export of registered Auth0 accounts from **Account Settings**. It includes email, name, plan, country, phone number, and the account profile's last-updated timestamp. The existing server-side Auth0 M2M client ID (`AUTH0_CLIENT_ID` or `NEXT_PUBLIC_AUTH0_CLIENT_ID`) and `AUTH0_CLIENT_SECRET` must be authorized for the Management API `read:users` scope. The export endpoint also reads account profile and plan data from `DATABASE_URL`; it does not include credentials, tokens, or chat contents.

Signed-in users can permanently delete their Teller data and Auth0 login from **Account Settings** by typing the exact account name. This removes Teller profile data, chats and media, memories, usage data, personal voice samples, saved Google connection data, and pending Composio confirmations. Account deletion does not cancel a paid subscription; users must cancel billing separately. The Auth0 M2M credentials must also have the Management API `delete:users` scope. If Teller data is removed but Auth0 deletion fails, the user sees an error and can retry after fixing the Management API permission.

Teller AI may make mistakes; check important information. Signed-in users can save up to 20 personal memory details by starting a chat message with “Remember that…” or adding them in Account Settings. Saved memory is included in future Teller AI, CyberMaps, and CyberMail replies when relevant. Users can review or delete saved details in Account Settings; the app does not automatically summarize or save chat history.

Image generation uses only Cloudflare Workers AI's FLUX.2 Klein 4B model (`@cf/black-forest-labs/flux-2-klein-4b`); the model is fixed and cannot be overridden. Set the server-only `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` values; the token needs Workers AI Read and Edit permissions. For signed-in Teller chats, Kimi K3.1 Pro classifies each text prompt as image-only, mixed image-and-chat, or chat-only, and FLUX.2 generates requested images. Mixed requests continue through chat after image generation so other requested tasks are handled too. Generated images default to 1024 × 1024. Before an image is saved or presented as complete, NVIDIA verifies that it contains a visible result and follows the requested change, using the reference image when one is provided; its factual caption is also used for the image's Listen reply. Keep `NVIDIA_API_KEY` configured for validation, captions, and image follow-up questions. Users can request edits or ask for another variation in the same conversation, and the app uses the latest generated image as the reference. JPEG, PNG, and WebP uploads up to 3 MB are analyzed when the prompt asks a question and used as reference images when the prompt asks for an edit. Reference images are resized to fit within 511 × 511 pixels for FLUX.2 Klein.

Teller AI can use Parallel's remote MCP server for web search, page fetch, web research, structured web decisions, and image search in regular chats. Image search results appear as linked thumbnails with source pages; requests without a key use the fast mode. The server is available without a key at lower rate limits; set the optional server-only `PARALLEL_API_KEY` to enable authenticated access, including `web_research`. Authenticated requests are billed to the Parallel account. Retrieved web content is treated as untrusted input. Configure the key in the deployment environment and do not expose it through `NEXT_PUBLIC_*` variables.

## App integrations

The **Tools** page in chat lists Composio app connectors and lets signed-in users connect their own accounts. Set the server-only `COMPOSIO_API_KEY` to a Composio project API key with session management and session tool execution enabled. Add the deployed `/chat` URL as an allowed Composio connection callback. Teller creates an MCP-enabled Composio session for the authenticated user when browsing or connecting apps; connection status is scoped to that user. Regular chat routes connected-app actions through Composio; CyberMail uses it specifically for Gmail and keeps Google Calendar on Google OAuth. The first pass uses `NVIDIA_COMPOSIO_DISCOVERY_MODEL` (defaulting to `NVIDIA_CLASSIFIER_MODEL`) to discover connector tools; results and schemas are handed to `NVIDIA_CHAT_MODEL`, which routes selected actions through `COMPOSIO_MULTI_EXECUTE_TOOL`. For document and file requests, Grope checks the matching actions in the user's Tools-page connector catalog before claiming it cannot create or export formats such as DOCX or PDF; it confirms file creation only when a tool reports success. Before any batch containing an app action not explicitly marked read-only, Teller shows the requested operations and waits for explicit confirmation. The MCP URL and headers stay on the server and are not exposed to the browser.

The main Grope chat is a productivity orchestrator: it can combine Parallel research with the signed-in user's discovered Composio connectors, use results to guide later steps, and report completed work separately from actions waiting for confirmation. Signed-out users can still use public Parallel research, but do not have personal app connectors or account-scoped document/file actions; Grope offers to draft document content in chat instead.

Daily image-generation limits are 5 for Free, 25 for Pro, and 30 for Business plans. Limits reset at midnight UTC. When the daily limit is reached, the chat reports that image generation is unavailable until tomorrow.

Account profiles, resized profile pictures, and plan subscriptions are stored in PostgreSQL. Profile updates and PayPal subscription activation do not require Auth0 Management API access. Existing subscribers whose plan was previously stored only in Auth0 metadata need their `teller_user_accounts.plan_key` migrated in PostgreSQL.

PayPal checkout uses the Live API by default. Configure `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` with the Live app credentials and set `PAYPAL_ENVIRONMENT=production` in the deployment environment. Set `PAYPAL_ENVIRONMENT=sandbox` only when intentionally testing with Sandbox credentials. `NEXT_PUBLIC_APP_URL` must be the deployed application URL for PayPal return and cancellation redirects.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## CyberMail: Gmail and Calendar

Choose CyberMail from the Mode menu to use the Composio Gmail add-on for Gmail searches, thread reads, and draft creation, and the Google Calendar API for listing and creating primary-calendar events. Connect Gmail from the chat's **Tools** page; Google Calendar is connected separately through CyberMail or Account Settings. CyberMail never sends email. Creating a Gmail draft or Calendar event requires an explicit confirmation in the chat. Each mode has a separate chat history; switching modes resumes the latest chat in that mode or starts one if none exists.

To enable the Google connection:

1. In Google Cloud, enable the Google Calendar API for the project.
2. Configure the OAuth consent screen. Add `https://www.googleapis.com/auth/calendar.events` to the app's Data Access settings.
3. Create a **Web application** OAuth client. Add the exact deployed callback URL (for local development, `http://localhost:3000/api/google/callback`) as an authorized redirect URI.
4. Set these server-only environment variables from `.env.example`:
   - `CYBERMAIL_DATABASE_URL` — optional dedicated Postgres connection string for CyberMail's Google OAuth tokens, OAuth states, and pending actions. If omitted, these use `DATABASE_URL`.
   - `GOOGLE_OAUTH_CLIENT_ID`
   - `GOOGLE_OAUTH_CLIENT_SECRET`
   - `GOOGLE_OAUTH_REDIRECT_URI`
   - `GOOGLE_TOKEN_ENCRYPTION_KEY` — a base64-encoded 32-byte key; for example, generate one with `openssl rand -base64 32`.
5. Ensure `DATABASE_URL` and, if using a separate CyberMail database, `CYBERMAIL_DATABASE_URL` are configured. OAuth tokens are encrypted before being stored in Postgres. If you switch to a new CyberMail database, reconnect the Google account there. Do not put database credentials or Google credentials in `NEXT_PUBLIC_*` variables or commit them.

After the server is configured, sign in to Teller and connect Google Calendar from CyberMail or Account Settings. To use Gmail, open the chat's **Tools** page and install/connect the Gmail add-on. The standalone `gmail_teller.py` script and its `credentials.json` file are not used by the Next.js app.

Google may require OAuth app verification before external users can grant the Calendar scope. While the consent screen is in testing mode, add the intended accounts as test users.

CyberMail treats retrieved email and calendar content as untrusted input. Users should still review draft/event details before confirming.

## CyberMaps: interactive maps and directions

Choose CyberMaps from the Mode menu in the chat prompt. Connect the Google Maps add-on from the chat **Tools** page to let CyberMaps discover and call Google Maps actions through Composio for place and directions requests, such as “directions from Cape Town Station to Table Mountain by transit.” The NVIDIA chat model uses the discovered Google Maps action and its results; it does not invent route details. The app also embeds an interactive Google Maps search or directions map and stores the latest map request with the CyberMaps chat.

To enable the embedded map:

1. Enable the **Maps Embed API** in the Google Cloud project.
2. Create an API key and restrict it to the Maps Embed API and your app's HTTP referrers.
3. Set `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY` in `.env.local`. This key is intentionally visible in the browser for the embed request, so restrict it in Google Cloud; do not use an unrestricted key.

Without the key, CyberMaps still provides a link to open the requested search or route in Google Maps. The embedded map works independently of the Composio connector; connecting Google Maps in Tools enables the assistant's Google Maps lookups. The chat assistant does not claim live traffic or route estimates unless returned by an available tool.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
