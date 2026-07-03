import { json, readJson, redirectUri, tokenRequest } from "../../_oauth.js";

export async function onRequestPost({ env, request }) {
  const bodyResult = await readJson(request);
  if (bodyResult.error) {
    return bodyResult.error;
  }

  const requestBody = bodyResult.value;
  if (!requestBody?.code || !requestBody?.codeVerifier) {
    return json({ error: "Missing authorization code or PKCE verifier." }, 400);
  }

  const clientKey = requestBody.clientKey || "confidential";
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: requestBody.code,
    redirect_uri: redirectUri(env, request, clientKey),
    code_verifier: requestBody.codeVerifier
  });

  return tokenRequest(env, body, clientKey);
}
