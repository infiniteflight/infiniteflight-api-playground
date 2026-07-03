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

export function publicConfig(env, request) {
  const appBaseUrl = trimTrailingSlash(env.APP_BASE_URL || new URL(request.url).origin);
  const clients = getOAuthClients(env, appBaseUrl);
  const activeClient = selectOAuthClient(clients, env.IF_OAUTH_CLIENT_TYPE);

  return {
    configured: Boolean(activeClient?.configured),
    hasConfiguredClients: clients.some(client => client.configured),
    authBaseUrl: trimTrailingSlash(env.IF_AUTH_BASE || "https://api.infiniteflight.com/auth"),
    publicApiBaseUrl: normalizePublicApiBaseUrl(env.IF_PUBLIC_API_BASE || "https://api.infiniteflight.com/public"),
    scopes: normalizeScopes(env.IF_SCOPES || DEFAULT_SCOPES),
    ...toPublicClientConfig(activeClient),
    clients: clients.map(toPublicClientConfig)
  };
}

export async function tokenRequest(env, body, clientKey) {
  const client = selectOAuthClient(getOAuthClients(env), clientKey);
  const configError = oauthConfigError(client);
  if (configError) {
    return configError;
  }

  if (client.clientType === "public") {
    return json({
      error: "Public clients exchange tokens directly with the OAuth token endpoint."
    }, 400);
  }

  const authBaseUrl = trimTrailingSlash(env.IF_AUTH_BASE || "https://api.infiniteflight.com/auth");
  const credentials = btoa(`${client.clientId}:${client.clientSecret}`);
  const response = await fetch(`${authBaseUrl}/v2/connect/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json"
    },
    body
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    return json({
      error: payload?.error_description || payload?.error || "Token request failed."
    }, response.status);
  }

  return json(payload, 200);
}

export async function readJson(request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 65_536) {
    return { error: json({ error: "Request body is too large." }, 413) };
  }

  try {
    return { value: await request.json() };
  } catch {
    return { error: json({ error: "Request body must be JSON." }, 400) };
  }
}

export function redirectUri(env, request, clientKey) {
  const appBaseUrl = request?.url
    ? trimTrailingSlash(env.APP_BASE_URL || new URL(request.url).origin)
    : trimTrailingSlash(env.APP_BASE_URL || "");
  return selectOAuthClient(getOAuthClients(env, appBaseUrl), clientKey).redirectUri;
}

export function json(value, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

function oauthConfigError(client) {
  const missing = missingOAuthConfig(client);

  if (missing.length > 0) {
    return json({
      error: `Missing required environment variables: ${missing.join(", ")}`
    }, 500);
  }

  return null;
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

function getOAuthClients(env, appBaseUrl = "") {
  const legacyClientType = normalizeOAuthClientType(env.IF_OAUTH_CLIENT_TYPE);
  const legacyIsConfidential = legacyClientType === "confidential";
  const legacyIsPublic = legacyClientType === "public";
  const fallbackRedirectUri = appBaseUrl ? `${appBaseUrl}/` : "";
  const authBaseUrl = trimTrailingSlash(env.IF_AUTH_BASE || "https://api.infiniteflight.com/auth");
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
