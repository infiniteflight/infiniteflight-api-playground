import { json, publicConfig } from "../_oauth.js";

export function onRequestGet({ env, request }) {
  return json(publicConfig(env, request));
}
