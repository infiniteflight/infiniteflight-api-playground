import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("..", import.meta.url);
const rootPath = fileURLToPath(root);

loadEnvFile();

const port = Number.parseInt(process.env.PORT || "5117", 10);
const config = {
  port,
  legacyPortRedirect: Number.parseInt(process.env.LEGACY_PORT_REDIRECT || "0", 10),
  appBaseUrl: trimTrailingSlash(process.env.APP_BASE_URL || `http://localhost:${port}`),
  authBaseUrl: trimTrailingSlash(process.env.IF_AUTH_BASE || "http://localhost:5068"),
  publicApiBaseUrl: trimTrailingSlash(process.env.IF_PUBLIC_API_BASE || "https://api.infiniteflight.com"),
  redirectUri: process.env.IF_REDIRECT_URI || `http://localhost:${port}/`,
  scopes: process.env.IF_SCOPES || "openid profile offline_access live:organizations.read live:aircraft.read live:schedules.read",
  clientId: process.env.IF_CLIENT_ID,
  clientSecret: process.env.IF_CLIENT_SECRET
};

createServer(async (req, res) => {
  try {
    await route(req, res);
  } catch (error) {
    console.error(error);
    sendJson(res, error.statusCode || 500, {
      error: error.publicMessage || "Unexpected sample server error."
    });
  }
}).listen(config.port, () => {
  console.log(`Infinite Flight API Playground sample running at http://localhost:${config.port}`);
});

startLegacyRedirectServer();

async function route(req, res) {
  const url = new URL(req.url, config.appBaseUrl);

  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/oauth/callback")) {
    return sendHtml(res, renderPage());
  }

  if (req.method === "GET" && url.pathname.startsWith("/public/")) {
    return serveStatic(url.pathname, res);
  }

  if (req.method === "GET" && url.pathname === "/login") {
    return redirect(res, "/");
  }

  if (req.method === "POST" && url.pathname === "/api/oauth/token") {
    const body = await readJsonBody(req);
    return exchangeCode(res, body);
  }

  if (req.method === "POST" && url.pathname === "/api/oauth/refresh") {
    const body = await readJsonBody(req);
    return refreshToken(res, body);
  }

  sendJson(res, 404, { error: "Not found." });
}

async function exchangeCode(res, request) {
  assertOAuthConfig();

  if (!request?.code || !request?.codeVerifier) {
    return sendJson(res, 400, { error: "Missing authorization code or PKCE verifier." });
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: request.code,
    redirect_uri: config.redirectUri,
    code_verifier: request.codeVerifier
  });

  const tokens = await tokenRequest(body);
  sendJson(res, 200, tokens);
}

async function refreshToken(res, request) {
  assertOAuthConfig();

  if (!request?.refreshToken) {
    return sendJson(res, 400, { error: "Missing refresh token." });
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: request.refreshToken
  });

  const tokens = await tokenRequest(body);
  sendJson(res, 200, tokens);
}

async function tokenRequest(body) {
  const response = await fetch(authUrl("/connect/token"), {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json"
    },
    body
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error_description || payload?.error || "Token request failed.");
    error.statusCode = response.status;
    error.publicMessage = error.message;
    throw error;
  }

  return payload;
}

function publicConfig() {
  return {
    configured: Boolean(config.clientId && config.clientSecret),
    authBaseUrl: config.authBaseUrl,
    publicApiBaseUrl: config.publicApiBaseUrl,
    scopes: config.scopes,
    clientId: config.clientId,
    redirectUri: config.redirectUri
  };
}

function assertOAuthConfig() {
  const missing = [];
  if (!config.clientId) missing.push("IF_CLIENT_ID");
  if (!config.clientSecret) missing.push("IF_CLIENT_SECRET");

  if (missing.length > 0) {
    const error = new Error(`Missing required environment variables: ${missing.join(", ")}`);
    error.statusCode = 500;
    error.publicMessage = error.message;
    throw error;
  }
}

function renderPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Infinite Flight API Playground</title>
  <link rel="icon" href="data:,">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;450;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/public/styles.css">
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
</head>
<body>
  <header class="topbar">
    <div class="brand">
      <img class="brand-logo" src="/public/infinite-flight-logo-horizontal.svg" alt="Infinite Flight">
      <div class="brand-product">
        <strong>API Playground</strong>
      </div>
    </div>
    <div class="top-spacer"></div>
    <div class="status-pill" id="apiStatus"><span class="status-dot"></span>API operational</div>
    <label class="session-control" for="sessionSelect">
      <span>Session</span>
      <select id="sessionSelect" disabled>
        <option>Sign in to load sessions</option>
      </select>
    </label>
    <div class="layout-controls" id="layoutControls" aria-label="Workbench layout controls">
      <button class="layout-button" type="button" data-layout-toggle="left" title="Show or hide endpoint catalog" aria-label="Show or hide endpoint catalog">
        <span class="layout-icon left-pane" aria-hidden="true"></span>
      </button>
      <button class="layout-button" type="button" data-layout-toggle="bottom" title="Show or hide network log" aria-label="Show or hide network log">
        <span class="layout-icon bottom-pane" aria-hidden="true"></span>
      </button>
      <button class="layout-button" type="button" data-layout-toggle="right" title="Show or hide inspector" aria-label="Show or hide inspector">
        <span class="layout-icon right-pane" aria-hidden="true"></span>
      </button>
      <button class="layout-button" type="button" data-layout-reset title="Reset layout" aria-label="Reset layout">
        <span class="layout-icon reset-layout" aria-hidden="true"></span>
      </button>
    </div>
    <div class="account-chip" id="accountChip">
      <div class="account-copy">
        <strong id="profileName">Signed out</strong>
        <span id="tokenExpiry">token - unavailable</span>
      </div>
      <div class="avatar" id="profileAvatar" aria-hidden="true">IF</div>
    </div>
    <button class="auth-button" type="button" id="loginButton">Sign in</button>
    <button class="auth-button secondary" type="button" id="logoutButton" hidden>Sign out</button>
  </header>

  <main class="main" id="workbench">
    <aside class="col left" id="leftPane">
      <div class="colhead">
        <div><span class="sub">Explore</span><h2>Endpoints</h2></div>
        <span class="count" id="endpointCount">0</span>
      </div>
      <div class="search">
        <input id="endpointSearch" type="search" placeholder="Search endpoints... e.g. flights, atc, user">
      </div>
      <div class="catalog" id="catalog"></div>
    </aside>

    <div class="splitter left-splitter" data-resize-pane="left" role="separator" aria-orientation="vertical" aria-label="Resize endpoint catalog" tabindex="0"></div>

    <section class="col center">
      <div id="map" aria-label="Live Infinite Flight map"></div>
      <div class="map-overlay">
        <span class="radar-dot"></span>
        <div><strong id="mapTitle">Live</strong> <span id="mapCount">Select a session</span></div>
      </div>
      <div class="map-legend">
        <div><span class="triangle-swatch"></span> Active aircraft</div>
        <div class="legend-muted">Geo responses plot here</div>
      </div>
    </section>

    <div class="splitter right-splitter" data-resize-pane="right" role="separator" aria-orientation="vertical" aria-label="Resize inspector" tabindex="0"></div>

    <aside class="col right" id="rightPane">
      <div class="colhead">
        <div><span class="sub">Inspect</span><h2>Response</h2></div>
      </div>
      <div class="tabs" role="tablist" aria-label="Inspector">
        <button class="tab active" type="button" data-inspector-tab="response">Response</button>
        <button class="tab" type="button" data-inspector-tab="selected">Selected</button>
      </div>
      <div class="inspector-body" id="inspectorBody">
        <div class="empty">
          <div class="empty-mark">+</div>
          <p>Pick an endpoint on the left to fire a request and read the response here.</p>
        </div>
      </div>
    </aside>
  </main>

  <section class="drawer" id="networkDrawer">
    <div class="drawer-resize" data-resize-pane="bottom" role="separator" aria-orientation="horizontal" aria-label="Resize network log" tabindex="0"></div>
    <div class="drawer-head" id="drawerHead">
      <h2><span class="live-dot"></span>Network</h2>
      <div class="filters" id="networkFilters">
        <button class="chip active" type="button" data-filter="all">All</button>
        <button class="chip" type="button" data-filter="GET">GET</button>
        <button class="chip" type="button" data-filter="POST">POST</button>
        <button class="chip" type="button" data-filter="errors">Errors</button>
      </div>
      <span class="network-stat" id="networkStat">0 requests - avg 0 ms</span>
      <div class="top-spacer"></div>
      <button class="clear-button" type="button" id="clearLogButton">Clear</button>
      <button class="drawer-toggle" type="button" id="drawerToggle" aria-label="Toggle network log">v</button>
    </div>
    <div class="log" id="networkLog">
      <div class="log-grid-head">
        <span>Method</span><span>Path</span><span>Status</span><span>Latency</span><span></span><span>Time</span>
      </div>
      <div id="logRows"><div class="log-empty">No requests yet. Fire one from the catalog.</div></div>
    </div>
  </section>
  <script>window.IF_SAMPLE_CONFIG=${serializeJsonForHtml(publicConfig())};</script>
  <script type="module" src="/public/app.js"></script>
</body>
</html>`;
}

function serveStatic(pathname, res) {
  const publicRoot = join(rootPath, "public");
  const requested = normalize(join(publicRoot, pathname.replace(/^\/public\//, "")));
  if (!requested.startsWith(publicRoot) || !existsSync(requested)) {
    return sendJson(res, 404, { error: "Static asset not found." });
  }

  const contentType = {
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".svg": "image/svg+xml; charset=utf-8"
  }[extname(requested)] || "application/octet-stream";

  res.writeHead(200, { "Content-Type": contentType });
  res.end(readFileSync(requested));
}

function loadEnvFile() {
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) {
    return;
  }

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]] !== undefined) {
      continue;
    }

    process.env[match[1]] = match[2].replace(/^"|"$/g, "");
  }
}

async function readJsonBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 65_536) {
      const error = new Error("Request body is too large.");
      error.statusCode = 413;
      error.publicMessage = error.message;
      throw error;
    }
  }

  if (!body) {
    return null;
  }

  try {
    return JSON.parse(body);
  } catch {
    const error = new Error("Request body must be JSON.");
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function startLegacyRedirectServer() {
  if (!Number.isInteger(config.legacyPortRedirect) || config.legacyPortRedirect <= 0 || config.legacyPortRedirect === config.port) {
    return;
  }

  createServer((req, res) => {
    const url = new URL(req.url || "/", config.appBaseUrl);
    redirect(res, `${config.appBaseUrl}${url.pathname}${url.search}`);
  }).listen(config.legacyPortRedirect, () => {
    console.log(`Forwarding http://localhost:${config.legacyPortRedirect} to ${config.appBaseUrl}`);
  }).on("error", error => {
    if (error.code === "EADDRINUSE") {
      console.warn(`Legacy redirect port ${config.legacyPortRedirect} is already in use.`);
      return;
    }

    throw error;
  });
}

function sendHtml(res, html) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

function sendJson(res, statusCode, value) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(value));
}

function serializeJsonForHtml(value) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, char => {
    if (char === "<") return "\\u003c";
    if (char === ">") return "\\u003e";
    if (char === "&") return "\\u0026";
    if (char === "\u2028") return "\\u2028";
    return "\\u2029";
  });
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function authUrl(path) {
  return `${config.authBaseUrl}/${path.replace(/^\/+/, "")}`;
}
