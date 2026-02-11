import { getNumber, getString, isRecord } from './runtime';

const TOKEN_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
const TOKEN_REFRESH_BUFFER_MS = 60_000;
const DEFAULT_TOKEN_TTL_SECONDS = 1800;

let cachedToken: string | null = null;
let tokenExpiryMs = 0;
let inFlightTokenRequest: Promise<string | null> | null = null;

function hasValidToken(now: number): boolean {
  return cachedToken !== null && now < tokenExpiryMs - TOKEN_REFRESH_BUFFER_MS;
}

async function requestAccessToken(clientId: string, clientSecret: string): Promise<string | null> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) return null;

  const data: unknown = await response.json();
  if (!isRecord(data)) return null;

  const token = getString(data, 'access_token');
  if (!token) return null;

  const expiresInSeconds = getNumber(data, 'expires_in') ?? DEFAULT_TOKEN_TTL_SECONDS;
  tokenExpiryMs = Date.now() + Math.max(1, Math.floor(expiresInSeconds)) * 1000;
  cachedToken = token;
  return token;
}

export async function getOpenSkyAccessToken(): Promise<string | null> {
  const clientId = process.env.OPENSKY_CLIENT_ID;
  const clientSecret = process.env.OPENSKY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const now = Date.now();
  if (hasValidToken(now)) {
    return cachedToken;
  }

  if (!inFlightTokenRequest) {
    inFlightTokenRequest = requestAccessToken(clientId, clientSecret)
      .catch(() => null)
      .finally(() => {
        inFlightTokenRequest = null;
      });
  }

  return inFlightTokenRequest;
}
