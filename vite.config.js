import react from "@vitejs/plugin-react";
import { Buffer } from "node:buffer";
import { defineConfig, loadEnv } from "vite";

const DEFAULT_SCOPES = "openid profile offline_access live:organizations.read live:aircraft.read live:schedules.read";
const KNOWN_SCOPES = [
  "openid",
  "profile",
  "offline_access",
  "live:organizations.read",
  "live:aircraft.read",
  "live:schedules.read",
  "live:schedules.write"
];

export default defineConfig(({ mode }) => {
  const env = {
    ...process.env,
    ...loadEnv(mode, process.cwd(), "")
  };
  const port = Number.parseInt(env.PORT || "5117", 10);

  return {
    plugins: [
      react(),
      localOAuthApi(env, port)
    ],
    server: {
      port,
      strictPort: true
    },
    preview: {
      port,
      strictPort: true
    }
  };
});

function localOAuthApi(env, port) {
  return {
    name: "infinite-flight-local-oauth-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || "/", `http://localhost:${port}`);

        try {
          if (req.method === "GET" && url.pathname === "/api/config") {
            return sendJson(res, 200, publicConfig(env, port));
          }

          if (req.method === "POST" && url.pathname === "/api/oauth/token") {
            const body = await readJsonBody(req);
            if (!body?.code || !body?.codeVerifier) {
              return sendJson(res, 400, { error: "Missing authorization code or PKCE verifier." });
            }

            const clientKey = body.clientKey || "confidential";
            return proxyTokenRequest(res, env, new URLSearchParams({
              grant_type: "authorization_code",
              code: body.code,
              redirect_uri: selectOAuthClient(getOAuthClients(env, appBaseUrl(port, env)), clientKey).redirectUri,
              code_verifier: body.codeVerifier
            }), clientKey);
          }

          if (req.method === "POST" && url.pathname === "/api/oauth/refresh") {
            const body = await readJsonBody(req);
            if (!body?.refreshToken) {
              return sendJson(res, 400, { error: "Missing refresh token." });
            }

            return proxyTokenRequest(res, env, new URLSearchParams({
              grant_type: "refresh_token",
              refresh_token: body.refreshToken
            }), body.clientKey || "confidential");
          }
        } catch (error) {
          return sendJson(res, error.statusCode || 500, {
            error: error.publicMessage || error.message || "Unexpected local OAuth error."
          });
        }

        next();
      });
    }
  };
}

async function proxyTokenRequest(res, env, body, clientKey) {
  const client = selectOAuthClient(getOAuthClients(env), clientKey);
  const missing = missingOAuthConfig(client);
  if (missing.length > 0) {
    return sendJson(res, 500, {
      error: `Missing required environment variables: ${missing.join(", ")}`
    });
  }

  if (client.clientType === "public") {
    return sendJson(res, 400, {
      error: "Public clients exchange tokens directly with the OAuth token endpoint."
    });
  }

  const authBaseUrl = trimTrailingSlash(env.IF_AUTH_BASE || "http://localhost:5068");
  const response = await fetch(`${authBaseUrl}/v2/connect/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${client.clientId}:${client.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json"
    },
    body
  });

  const payload = await response.json().catch(() => null);
  return sendJson(res, response.status, payload || {
    error: response.ok ? null : "Token request failed."
  });
}

function publicConfig(env, port) {
  const appRoot = appBaseUrl(port, env);
  const clients = getOAuthClients(env, appRoot);
  const activeClient = selectOAuthClient(clients, env.IF_OAUTH_CLIENT_TYPE);
  return {
    configured: Boolean(activeClient?.configured),
    hasConfiguredClients: clients.some(client => client.configured),
    authBaseUrl: trimTrailingSlash(env.IF_AUTH_BASE || "http://localhost:5068"),
    publicApiBaseUrl: normalizePublicApiBaseUrl(env.IF_PUBLIC_API_BASE || "https://api.infiniteflight.com/public"),
    scopes: normalizeScopes(env.IF_SCOPES || DEFAULT_SCOPES),
    ...toPublicClientConfig(activeClient),
    clients: clients.map(toPublicClientConfig)
  };
}

function missingOAuthConfig(client) {
  const missing = [];
  if (!client?.clientId) missing.push(client?.clientType === "public" ? "IF_PUBLIC_CLIENT_ID" : "IF_CONFIDENTIAL_CLIENT_ID");
  if (client?.clientType === "confidential" && !client.clientSecret) missing.push("IF_CONFIDENTIAL_CLIENT_SECRET");
  return missing;
}

function normalizeOAuthClientType(value) {
  return String(value || "").trim().toLowerCase() === "public" ? "public" : "confidential";
}

function appBaseUrl(port, env) {
  return trimTrailingSlash(env.APP_BASE_URL || `http://localhost:${port}`);
}

function getOAuthClients(env, appRoot = "") {
  const legacyClientType = normalizeOAuthClientType(env.IF_OAUTH_CLIENT_TYPE);
  const legacyIsConfidential = legacyClientType === "confidential";
  const legacyIsPublic = legacyClientType === "public";
  const fallbackRedirectUri = appRoot ? `${appRoot}/` : "";
  const authBaseUrl = trimTrailingSlash(env.IF_AUTH_BASE || "http://localhost:5068");
  const publicApiBaseUrl = normalizePublicApiBaseUrl(env.IF_PUBLIC_API_BASE || "https://api.infiniteflight.com/public");

  const confidentialClientId = env.IF_CONFIDENTIAL_CLIENT_ID || (legacyIsConfidential ? env.IF_CLIENT_ID : "");
  const confidentialClientSecret = env.IF_CONFIDENTIAL_CLIENT_SECRET || (legacyIsConfidential ? env.IF_CLIENT_SECRET : "");
  const publicClientId = env.IF_PUBLIC_CLIENT_ID || (legacyIsPublic ? env.IF_CLIENT_ID : "");

  return [
    {
      key: "confidential",
      clientType: "confidential",
      label: "Confidential",
      tokenExchange: "backend",
      configured: Boolean(confidentialClientId && confidentialClientSecret),
      clientId: confidentialClientId || "",
      clientSecret: confidentialClientSecret || "",
      redirectUri: env.IF_CONFIDENTIAL_REDIRECT_URI || (legacyIsConfidential ? env.IF_REDIRECT_URI : "") || fallbackRedirectUri,
      scopes: normalizeScopes(env.IF_CONFIDENTIAL_SCOPES || (legacyIsConfidential ? env.IF_SCOPES : "") || env.IF_SCOPES || DEFAULT_SCOPES),
      authBaseUrl,
      publicApiBaseUrl
    },
    {
      key: "public",
      clientType: "public",
      label: "Public PKCE",
      tokenExchange: "browser",
      configured: Boolean(publicClientId),
      clientId: publicClientId || "",
      clientSecret: "",
      redirectUri: env.IF_PUBLIC_REDIRECT_URI || (legacyIsPublic ? env.IF_REDIRECT_URI : "") || fallbackRedirectUri,
      scopes: normalizeScopes(env.IF_PUBLIC_SCOPES || (legacyIsPublic ? env.IF_SCOPES : "") || env.IF_SCOPES || DEFAULT_SCOPES),
      authBaseUrl,
      publicApiBaseUrl
    }
  ];
}

function selectOAuthClient(clients, key) {
  const requestedClient = clients.find(client => client.key === key)
    || clients.find(client => client.clientType === normalizeOAuthClientType(key));
  return requestedClient?.configured
    ? requestedClient
    : clients.find(client => client.configured)
    || clients[0];
}

function toPublicClientConfig(client) {
  const { clientSecret, ...publicClient } = client;
  return publicClient;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 65_536) {
        const error = new Error("Request body is too large.");
        error.statusCode = 413;
        error.publicMessage = error.message;
        reject(error);
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) {
        resolve(null);
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        const error = new Error("Request body must be JSON.");
        error.statusCode = 400;
        error.publicMessage = error.message;
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, value) {
  res.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(value));
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function normalizePublicApiBaseUrl(value) {
  const trimmedValue = trimTrailingSlash(value);
  try {
    const url = new URL(trimmedValue);
    if (url.hostname === "api.infiniteflight.com" && !url.pathname.startsWith("/public")) {
      url.pathname = `${trimTrailingSlash(url.pathname)}/public`;
      return trimTrailingSlash(url.toString());
    }
  } catch {
    return trimmedValue;
  }

  return trimmedValue;
}

function normalizeScopes(value) {
  const scopes = String(value || "")
    .split(/[\s,]+/)
    .filter(Boolean)
  if (scopes.length === 1) {
    const repairedScopes = splitKnownScopes(scopes[0]);
    if (repairedScopes.length > 1) {
      return repairedScopes.join(" ");
    }
  }

  return scopes.join(" ");
}

function splitKnownScopes(value) {
  let remaining = value;
  const scopes = [];

  while (remaining.length > 0) {
    const scope = KNOWN_SCOPES.find(candidate => remaining.startsWith(candidate));
    if (!scope) {
      return [];
    }

    scopes.push(scope);
    remaining = remaining.slice(scope.length);
  }

  return scopes;
}
