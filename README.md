# Flight Tracker Sample

This sample demonstrates PublicApi through one OAuth-only, map-first app:

1. Redirect the user to Infinite Flight OAuth.
2. Complete authorization-code + PKCE login.
3. Exchange the code server-side with the client secret.
4. Store the PKCE state and returned access/refresh tokens in browser `localStorage`.
5. Refresh expired access tokens with the OAuth refresh-token grant.
6. Call PublicApi directly from the browser with the OAuth bearer token.

The app centers on a Leaflet map. Sessions, live flights, ATC facilities, flight routes, airport details, logbook entries, aircraft/livery metadata, tracks, NOTAMs, world/airport status, and the v3 Live organization/schedule endpoints are exposed through the side panels and endpoint explorer.

The browser never receives the OAuth client secret. This sample intentionally avoids cookies for local testing; do not treat localStorage token storage as the production recommendation for higher-risk apps.

## Setup

```powershell
cd C:\Fds\infiniteflight-api-samples\flight-tracker
copy .env.example .env
npm start
```

Then open `http://localhost:5117`.

Before logging in, create an OAuth client in the admin dashboard with:

- Redirect URI: `http://localhost:5117/`
- Scopes: `openid`, `profile`, `offline_access`, `live:organizations.read`, `live:aircraft.read`, `live:schedules.read`

`profile` lets the sample show the signed-in user's display name and profile picture from the ID token. `offline_access` is required for refresh tokens. If the OAuth client is not allowed to request it, remove it from `IF_SCOPES`; the sample will still work, but the user must sign in again after the access token expires.

Copy the generated OAuth client ID and one-time secret into `.env`.

## Cloudflare Pages Hosting

The hosted demo uses Cloudflare Pages for static files and Pages Functions for OAuth token exchange:

- Static app: `public/`
- Runtime config: `functions/api/config.js`
- Authorization-code exchange: `functions/api/oauth/token.js`
- Refresh-token exchange: `functions/api/oauth/refresh.js`

The OAuth client secret is stored only in Cloudflare environment variables. It is never shipped to the browser.

### Local Pages Functions Test

```powershell
copy .dev.vars.example .dev.vars
npm run cf:dev
```

Register this redirect URI on the OAuth client while testing with Wrangler:

```text
http://localhost:8788/
```

### Deploy

Create a Cloudflare Pages project named `infiniteflight-api-playground`, then set these production variables/secrets:

```powershell
npx wrangler pages secret put IF_CLIENT_ID --project-name infiniteflight-api-playground
npx wrangler pages secret put IF_CLIENT_SECRET --project-name infiniteflight-api-playground
npx wrangler pages secret put APP_BASE_URL --project-name infiniteflight-api-playground
npx wrangler pages secret put IF_REDIRECT_URI --project-name infiniteflight-api-playground
npx wrangler pages secret put IF_AUTH_BASE --project-name infiniteflight-api-playground
npx wrangler pages secret put IF_PUBLIC_API_BASE --project-name infiniteflight-api-playground
npx wrangler pages secret put IF_SCOPES --project-name infiniteflight-api-playground
```

Suggested production values:

```text
APP_BASE_URL=https://api-playground.infiniteflight.com
IF_REDIRECT_URI=https://api-playground.infiniteflight.com/
IF_AUTH_BASE=https://api.infiniteflight.com/auth
IF_PUBLIC_API_BASE=https://api.infiniteflight.com
IF_SCOPES=openid profile offline_access live:organizations.read live:aircraft.read live:schedules.read
```

Then deploy:

```powershell
npm run cf:deploy
```

In Cloudflare Pages, connect the same GitHub repository and use:

```text
Build command: none
Build output directory: public
```

Pages Functions are picked up from `functions/`.

## Publishing Source To GitHub

This folder is ready to be published as its own GitHub repository. Do not commit `.env` or `.dev.vars`.

```powershell
cd C:\Fds\infiniteflight-api-samples\flight-tracker
git init
git add .
git commit -m "Add Infinite Flight API Playground sample"
gh repo create infiniteflight-api-playground --public --source=. --remote=origin --push
```

After the repo exists, connect it to Cloudflare Pages for automatic deploys on push.

## Local Service Testing

For local AuthApi/PublicApi testing, set:

```env
IF_AUTH_BASE=http://localhost:5068
IF_PUBLIC_API_BASE=http://localhost:5069
```

Do not include `/v2` in `IF_AUTH_BASE` for this sample. OAuth authorize/token routes are mounted at `/connect/*`; `/v2` is for the legacy login APIs that the auth UI calls.

The OAuth client redirect URI must exactly match `IF_REDIRECT_URI`.

Browser DevTools will show raw `http://localhost:5069/v3/...` requests with the OAuth bearer token.

## Auth Host Routing

The sample's `IF_AUTH_BASE` must point to the OAuth server, not just the static auth UI.

Today that is typically:

```env
IF_AUTH_BASE=https://api.infiniteflight.com/auth
```

For local AuthApi development, use:

```env
IF_AUTH_BASE=http://localhost:5068
```

When `auth.infiniteflight.com` is fully routed, it should proxy these AuthApi paths:

- `/connect/authorize`
- `/connect/token`
- `/connect/revocation`
- `/.well-known/openid-configuration`
- `/.well-known/jwks`
- `/oauth/authorize-handoff`
- `/oauth/login`

The static auth site should keep serving `/login`, `/consent`, and `/logout`.

## Endpoint Coverage

The endpoint explorer includes the main PublicApi routes currently demonstrated by the sample:

- v3 sessions, session details, flights, flight details, flight plans, batch flight plans, flight routes, ATC, world status, and NOTAMs.
- v3 user grade/stats, user logbook, individual logbook flight, and user ATC history.
- v3 aircraft catalog, aircraft details, per-aircraft liveries, and all liveries.
- v3 airports, airport details, session airport status, ATIS, and oceanic tracks.
- v3 Live organizations, organization aircraft, and aircraft schedules.

Some buttons require context first. Select a session, flight, airport, aircraft, or logbook entry to enable those contextual calls.

## Notes

- Tokens are stored in browser `localStorage` because this sample is cookie-free by design.
- Refresh tokens are rotating. The sample replaces the stored refresh token whenever the token endpoint returns a new one.
- The profile picture is read from the OAuth ID token `picture` claim. If the token does not include one, the UI falls back to initials.
- Use a hardened token storage strategy before adapting this sample for production.
- This sample decodes JWT payloads only for display. It does not use decoded data for authorization.
