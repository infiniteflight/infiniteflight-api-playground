# Infinite Flight API Playground

The Infinite Flight API Playground is an interactive way to explore PublicApi v3 with your Infinite Flight account.

Open the hosted playground:

[https://api-playground.infiniteflight.com](https://api-playground.infiniteflight.com)

You do not need to create an OAuth app, configure redirect URLs, or manage API keys. Sign in, approve the requested access, and the playground will call PublicApi with your OAuth token.

## What You Can Do

- View public Live sessions on a map.
- Select Casual, Training, or Expert sessions.
- Inspect aircraft, flight plans, routes, ATC, world status, NOTAMs, airports, tracks, and user logbook data.
- Explore Live organization, aircraft, and schedule endpoints.
- See every request and response in a DevTools-style network log.
- Copy formatted JSON responses for debugging or prototyping.

The app is map-first: endpoints that return coordinates plot results on the map, and selecting an aircraft loads related flight details.

## Signing In

1. Open the playground.
2. Select **Sign in**.
3. Continue with your Infinite Flight account.
4. Review the OAuth permissions.
5. Authorize the playground.

After sign-in, the playground shows your account chip, token countdown, session selector, endpoint catalog, response inspector, and network log.

## Requested Permissions

The playground requests read access for the APIs it demonstrates:

- Your basic profile, so the UI can show your name and profile image.
- Live organizations.
- Live aircraft.
- Live schedules.
- PublicApi session, flight, airport, aircraft, ATC, world, route, and logbook reads.

Some Live schedule write endpoints may appear in the catalog for demonstration, but they require the correct OAuth scope and organization permissions. If your account or the playground client is not allowed to write, PublicApi will reject those calls.

## Using The Playground

### Map

The center map shows aircraft returned by the selected session. Click an aircraft to select it, load related APIs, and open the inspector.

### Endpoint Catalog

The left panel lists PublicApi v3 endpoints by category. Click an endpoint to send the request. Disabled endpoints need more context first, such as a selected flight, user, organization, aircraft, or schedule.

### Variables

The **Request context** panel controls URL variables used by contextual endpoints:

- **User**: choose the signed-in user, search loaded session pilots, or paste a user ID.
- **Flight**: choose a flight from the selected session.
- **Airport**: enter an ICAO code for airport status and ATIS calls.
- **Directory aircraft**: load aircraft types, then choose one for aircraft/livery calls.
- **Live organization**: load organizations available to your account.
- **Live aircraft**: load aircraft for the selected organization.
- **Schedule**: load schedules for the selected Live aircraft.
- **Logbook and ATC**: choose a logbook flight or ATC session after running those user endpoints.

Changing a parent variable clears stale child selections. For example, changing the Live organization clears the selected Live aircraft and schedule.

### Inspector

The right panel has two views:

- **Response**: request metadata and a collapsible JSON response tree.
- **Selected**: a flattened key/value view of the selected map item or response entity.

### Network Log

The bottom drawer records every request:

- Method and path.
- HTTP status.
- Latency bar and duration.
- Timestamp.
- Filters for all requests, GET, POST, and errors.

Click a network row to load that request back into the inspector.

## Mobile

On smaller screens, the playground switches to four tabs:

- **Map**
- **Endpoints**
- **Inspect**
- **Network**

The same endpoint and variable controls are available, but each view gets the full screen instead of trying to fit the desktop workbench into a phone layout.

## Data And Tokens

- The playground uses OAuth, not PublicApi v2 API keys.
- Confidential OAuth clients exchange tokens through the sample backend/Cloudflare Function, so the client secret is never sent to your browser.
- Public OAuth clients exchange PKCE authorization codes directly from the browser and do not use a client secret.
- Access and refresh tokens are stored in your browser local storage so the demo can refresh your session without cookies.
- Use **Sign out** to remove stored tokens from the browser.

## OAuth Client Modes

The playground can show both supported OAuth client types side by side:

- **Confidential**: the browser sends the authorization code to the sample backend, and the backend exchanges it with the client secret.
- **Public PKCE**: the browser exchanges the PKCE authorization code directly with `https://api.infiniteflight.com/auth/v2/connect/token`; no client secret is used.

Configure both `IF_CONFIDENTIAL_CLIENT_ID`/`IF_CONFIDENTIAL_CLIENT_SECRET` and `IF_PUBLIC_CLIENT_ID` to enable the side-by-side selector in the top bar. Selecting a different mode signs out the current token so requests always use the chosen client.

The legacy single-client variables still work for quick local testing: set `IF_OAUTH_CLIENT_TYPE=confidential` or `IF_OAUTH_CLIENT_TYPE=public` with `IF_CLIENT_ID`, and include `IF_CLIENT_SECRET` only for confidential clients.

## For Developers

This repository contains the source for the hosted playground. Most users should use the hosted app above.

To run the source locally:

```powershell
npm install
npm run dev
```

Local OAuth settings are intended for Infinite Flight maintainers and are documented in the example environment files. Configure both sample clients to compare confidential and public PKCE flows side by side. Do not commit local `.env` or `.dev.vars` files.

Useful commands:

```powershell
npm run check
npm run build
```
