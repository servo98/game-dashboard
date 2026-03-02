import { Hono } from "hono";
import { makeSession } from "./factories";

/**
 * Create a request with a valid session cookie for authenticated routes.
 */
export function authedRequest(path: string, init?: RequestInit, token = "valid-token"): Request {
  const headers = new Headers(init?.headers);
  headers.set("cookie", `session=${token}`);
  return new Request(`http://localhost${path}`, { ...init, headers });
}

/**
 * Create a request with the X-Bot-Api-Key header.
 */
export function botKeyRequest(path: string, init?: RequestInit): Request {
  const headers = new Headers(init?.headers);
  headers.set("X-Bot-Api-Key", "test-bot-key");
  return new Request(`http://localhost${path}`, { ...init, headers });
}

/**
 * Create an unauthenticated request.
 */
export function unauthRequest(path: string, init?: RequestInit): Request {
  return new Request(`http://localhost${path}`, init);
}

/**
 * A valid session object that the mocked sessionQueries.get.get() should return.
 */
export const validSession = makeSession();
