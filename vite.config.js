import react from "@vitejs/plugin-react";
import { Buffer } from "node:buffer";
import { defineConfig, loadEnv } from "vite";

const DEFAULT_SCOPES = "openid profile offline_access live:organizations.read live:aircraft.read live:schedules.read";

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

            return proxyTokenRequest(res, env, new URLSearchParams({
              grant_type: "authorization_code",
              code: body.code,
              redirect_uri: publicConfig(env, port).redirectUri,
              code_verifier: body.codeVerifier
            }));
          }

          if (req.method === "POST" && url.pathname === "/api/oauth/refresh") {
            const body = await readJsonBody(req);
            if (!body?.refreshToken) {
              return sendJson(res, 400, { error: "Missing refresh token." });
            }

            return proxyTokenRequest(res, env, new URLSearchParams({
              grant_type: "refresh_token",
              refresh_token: body.refreshToken
            }));
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

async function proxyTokenRequest(res, env, body) {
  const missing = missingOAuthConfig(env);
  if (missing.length > 0) {
    return sendJson(res, 500, {
      error: `Missing required environment variables: ${missing.join(", ")}`
    });
  }

  const authBaseUrl = trimTrailingSlash(env.IF_AUTH_BASE || "http://localhost:5068");
  const response = await fetch(`${authBaseUrl}/connect/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.IF_CLIENT_ID}:${env.IF_CLIENT_SECRET}`).toString("base64")}`,
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
  const appBaseUrl = trimTrailingSlash(env.APP_BASE_URL || `http://localhost:${port}`);
  return {
    configured: missingOAuthConfig(env).length === 0,
    authBaseUrl: trimTrailingSlash(env.IF_AUTH_BASE || "http://localhost:5068"),
    publicApiBaseUrl: trimTrailingSlash(env.IF_PUBLIC_API_BASE || "https://api.infiniteflight.com"),
    scopes: env.IF_SCOPES || DEFAULT_SCOPES,
    clientId: env.IF_CLIENT_ID || "",
    redirectUri: env.IF_REDIRECT_URI || `${appBaseUrl}/`
  };
}

function missingOAuthConfig(env) {
  const missing = [];
  if (!env.IF_CLIENT_ID) missing.push("IF_CLIENT_ID");
  if (!env.IF_CLIENT_SECRET) missing.push("IF_CLIENT_SECRET");
  return missing;
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
