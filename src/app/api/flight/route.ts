import { NextRequest, NextResponse } from 'next/server';
import { OPENSKY_API_URL } from '@/lib/constants';
import type { Flight } from '@/lib/types';

// Lightweight cache for single-aircraft queries (1s TTL)
let singleCache: { icao24: string; data: Flight; timestamp: number } | null = null;
const SINGLE_CACHE_TTL = 1_500;
const RATE_LIMIT_BACKOFF_MS = 15_000;
let rateLimitedUntil = 0;

// Reuse the token from the flights endpoint via a shared module would be ideal,
// but to keep it simple we'll re-implement token fetching here
let accessToken: string | null = null;
let tokenExpiry = 0;
const TOKEN_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';

async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.OPENSKY_CLIENT_ID;
  const clientSecret = process.env.OPENSKY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  if (accessToken && Date.now() < tokenExpiry - 60_000) {
    return accessToken;
  }

  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return null;

    const data = await res.json();
    accessToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in ?? 1800) * 1000;
    return accessToken;
  } catch {
    return null;
  }
}

function transformState(state: unknown[]): Flight | null {
  const lat = state[6] as number | null;
  const lng = state[5] as number | null;
  if (lat === null || lng === null) return null;

  return {
    icao24: (state[0] as string).trim(),
    callsign: ((state[1] as string) || '').trim(),
    country: (state[2] as string) || '',
    longitude: lng,
    latitude: lat,
    altitude: state[7] as number | null,
    heading: state[10] as number | null,
    velocity: state[9] as number | null,
    verticalRate: state[11] as number | null,
    onGround: state[8] as boolean,
    squawk: state[14] as string | null,
    baroAltitude: state[7] as number | null,
    geoAltitude: state[13] as number | null,
    lastContact: state[4] as number,
    lastPositionUpdate: state[3] as number | null,
    category: (state[17] as number) || 0,
    positionSource: (state[16] as number) || 0,
  };
}

function parseRetryAfterHeaderMs(retryAfterHeader: string | null): number {
  if (!retryAfterHeader) return 0;

  const retrySeconds = Number.parseInt(retryAfterHeader, 10);
  if (Number.isFinite(retrySeconds) && retrySeconds > 0) {
    return retrySeconds * 1000;
  }

  const retryAt = Date.parse(retryAfterHeader);
  if (Number.isFinite(retryAt)) {
    return Math.max(0, retryAt - Date.now());
  }

  return 0;
}

function parseRateLimitRetryAfterMs(headers: Headers): number {
  const retryAfterSecondsHeader = headers.get('x-rate-limit-retry-after-seconds');
  const retryAfterSeconds = Number.parseInt(retryAfterSecondsHeader ?? '', 10);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return retryAfterSeconds * 1000;
  }

  return parseRetryAfterHeaderMs(headers.get('retry-after'));
}

export async function GET(request: NextRequest) {
  const icao24 = request.nextUrl.searchParams.get('icao24');
  if (!icao24) {
    return NextResponse.json(
      { flight: null, error: 'Missing icao24 parameter' },
      { status: 400 },
    );
  }

  const normalizedIcao24 = icao24.trim().toLowerCase();
  if (!normalizedIcao24) {
    return NextResponse.json(
      { flight: null, error: 'Missing icao24 parameter' },
      { status: 400 },
    );
  }

  const now = Date.now();

  // Return cached if fresh
  if (singleCache && singleCache.icao24 === normalizedIcao24 && now - singleCache.timestamp < SINGLE_CACHE_TTL) {
    return NextResponse.json(
      { flight: singleCache.data, timestamp: singleCache.timestamp },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  if (now < rateLimitedUntil && singleCache && singleCache.icao24 === normalizedIcao24) {
    return NextResponse.json(
      { flight: singleCache.data, timestamp: singleCache.timestamp },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  if (now < rateLimitedUntil) {
    const retryAfterSeconds = Math.max(1, Math.ceil((rateLimitedUntil - now) / 1000));
    return NextResponse.json(
      { flight: null, error: 'Rate limited', rateLimited: true, retryAfterSeconds },
      { status: 429, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const url = `${OPENSKY_API_URL}?icao24=${encodeURIComponent(normalizedIcao24)}`;
    const headers: Record<string, string> = {};
    const token = await getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(5000),
    });

    if (res.status === 429) {
      const retryAfterMs = parseRateLimitRetryAfterMs(res.headers) || RATE_LIMIT_BACKOFF_MS;
      rateLimitedUntil = Math.max(rateLimitedUntil, now + retryAfterMs);
      const retryAfterSeconds = Math.max(1, Math.ceil((rateLimitedUntil - now) / 1000));

      if (singleCache && singleCache.icao24 === normalizedIcao24) {
        return NextResponse.json(
          { flight: singleCache.data, timestamp: singleCache.timestamp, rateLimited: true, retryAfterSeconds },
          { headers: { 'Cache-Control': 'no-store' } },
        );
      }
      return NextResponse.json(
        { flight: null, error: 'Rate limited', rateLimited: true, retryAfterSeconds },
        { status: 429, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    if (!res.ok) {
      // Return stale cache if available
      if (singleCache && singleCache.icao24 === normalizedIcao24) {
        return NextResponse.json(
          { flight: singleCache.data, timestamp: singleCache.timestamp },
          { headers: { 'Cache-Control': 'no-store' } },
        );
      }
      return NextResponse.json(
        { flight: null, error: `API error: ${res.status}` },
        { status: 502, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    rateLimitedUntil = 0;

    const data = await res.json();
    const states: unknown[][] = data.states || [];

    if (states.length === 0) {
      return NextResponse.json(
        { flight: null, error: 'Aircraft not found' },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const flight = transformState(states[0]);
    if (!flight) {
      return NextResponse.json(
        { flight: null, error: 'No position data' },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    singleCache = { icao24: normalizedIcao24, data: flight, timestamp: now };

    return NextResponse.json(
      { flight, timestamp: now },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    if (singleCache && singleCache.icao24 === normalizedIcao24) {
      return NextResponse.json(
        { flight: singleCache.data, timestamp: singleCache.timestamp },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    return NextResponse.json(
      { flight: null, error: String(err) },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
