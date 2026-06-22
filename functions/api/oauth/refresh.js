import { json, readJson, tokenRequest } from "../../_oauth.js";

export async function onRequestPost({ env, request }) {
  const bodyResult = await readJson(request);
  if (bodyResult.error) {
    return bodyResult.error;
  }

  const requestBody = bodyResult.value;
  if (!requestBody?.refreshToken) {
    return json({ error: "Missing refresh token." }, 400);
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: requestBody.refreshToken
  });

  return tokenRequest(env, body);
}
