const DEFAULT_SCOPES = "openid profile offline_access live:organizations.read live:aircraft.read live:schedules.read";

export function publicConfig(env, request) {
  const appBaseUrl = trimTrailingSlash(env.APP_BASE_URL || new URL(request.url).origin);
  return {
    configured: Boolean(env.IF_CLIENT_ID && env.IF_CLIENT_SECRET),
    authBaseUrl: trimTrailingSlash(env.IF_AUTH_BASE || "https://api.infiniteflight.com/auth"),
    publicApiBaseUrl: trimTrailingSlash(env.IF_PUBLIC_API_BASE || "https://api.infiniteflight.com"),
    scopes: env.IF_SCOPES || DEFAULT_SCOPES,
    clientId: env.IF_CLIENT_ID || "",
    redirectUri: env.IF_REDIRECT_URI || `${appBaseUrl}/`
  };
}

export async function tokenRequest(env, body) {
  const configError = oauthConfigError(env);
  if (configError) {
    return configError;
  }

  const authBaseUrl = trimTrailingSlash(env.IF_AUTH_BASE || "https://api.infiniteflight.com/auth");
  const credentials = btoa(`${env.IF_CLIENT_ID}:${env.IF_CLIENT_SECRET}`);
  const response = await fetch(`${authBaseUrl}/connect/token`, {
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

export function redirectUri(env, request) {
  return publicConfig(env, request).redirectUri;
}

export function json(value, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

function oauthConfigError(env) {
  const missing = [];
  if (!env.IF_CLIENT_ID) missing.push("IF_CLIENT_ID");
  if (!env.IF_CLIENT_SECRET) missing.push("IF_CLIENT_SECRET");

  if (missing.length > 0) {
    return json({
      error: `Missing required environment variables: ${missing.join(", ")}`
    }, 500);
  }

  return null;
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}
