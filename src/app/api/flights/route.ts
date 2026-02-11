import { NextRequest, NextResponse } from 'next/server';
import { OPENSKY_API_URL, CACHE_TTL } from '@/lib/constants';
import type { BoundingBox, Flight, FlightsResponse } from '@/lib/types';

interface CacheEntry {
  data: FlightsResponse;
  bounds: BoundingBox;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

const CACHE_KEY_STEP = 0.5;
const DEFAULT_RATE_LIMIT_BACKOFF_MS = 15_000;
const MAX_STALE_FALLBACK_MS = 60_000;
let rateLimitedUntil = 0;

// OAuth2 token cache
let accessToken: string | null = null;
let tokenExpiry = 0;

const TOKEN_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';

async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.OPENSKY_CLIENT_ID;
  const clientSecret = process.env.OPENSKY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  // Reuse token if still valid (with 60s buffer)
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

function quantize(v: number): number {
  return Math.round(v / CACHE_KEY_STEP) * CACHE_KEY_STEP;
}

function getCacheKey(bounds: BoundingBox): string {
  return [
    quantize(bounds.lamin).toFixed(2),
    quantize(bounds.lomin).toFixed(2),
    quantize(bounds.lamax).toFixed(2),
    quantize(bounds.lomax).toFixed(2),
  ].join('_');
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeBounds(lamin: number, lomin: number, lamax: number, lomax: number): BoundingBox {
  return {
    lamin: clamp(Math.min(lamin, lamax), -90, 90),
    lomin: clamp(Math.min(lomin, lomax), -180, 180),
    lamax: clamp(Math.max(lamin, lamax), -90, 90),
    lomax: clamp(Math.max(lomin, lomax), -180, 180),
  };
}

function inBounds(flight: Flight, bounds: BoundingBox): boolean {
  return (
    flight.latitude >= bounds.lamin &&
    flight.latitude <= bounds.lamax &&
    flight.longitude >= bounds.lomin &&
    flight.longitude <= bounds.lomax
  );
}

function filterResponseToBounds(data: FlightsResponse, bounds: BoundingBox): FlightsResponse {
  const flights = data.flights.filter(f => inBounds(f, bounds));
  return {
    flights,
    timestamp: data.timestamp,
    count: flights.length,
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

function getFallbackResponse(bounds: BoundingBox, now: number, exact?: CacheEntry): FlightsResponse | null {
  if (exact && now - exact.timestamp < MAX_STALE_FALLBACK_MS) {
    return filterResponseToBounds(exact.data, bounds);
  }

  let covering: CacheEntry | null = null;
  let overlapping: CacheEntry | null = null;
  let freshest: CacheEntry | null = null;

  for (const entry of cache.values()) {
    if (now - entry.timestamp > MAX_STALE_FALLBACK_MS) continue;

    if (!freshest || entry.timestamp > freshest.timestamp) {
      freshest = entry;
    }

    const covers =
      entry.bounds.lamin <= bounds.lamin &&
      entry.bounds.lomin <= bounds.lomin &&
      entry.bounds.lamax >= bounds.lamax &&
      entry.bounds.lomax >= bounds.lomax;

    if (covers) {
      if (!covering || entry.timestamp > covering.timestamp) {
        covering = entry;
      }
      continue;
    }

    const overlaps = !(
      entry.bounds.lamax < bounds.lamin ||
      entry.bounds.lamin > bounds.lamax ||
      entry.bounds.lomax < bounds.lomin ||
      entry.bounds.lomin > bounds.lomax
    );

    if (overlaps && (!overlapping || entry.timestamp > overlapping.timestamp)) {
      overlapping = entry;
    }
  }

  const fallback = covering ?? overlapping ?? freshest;
  if (!fallback) return null;
  return filterResponseToBounds(fallback.data, bounds);
}

function jsonResponse(data: FlightsResponse, status: number = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
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

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const rawLamin = parseFloat(searchParams.get('lamin') || '45');
  const rawLomin = parseFloat(searchParams.get('lomin') || '5');
  const rawLamax = parseFloat(searchParams.get('lamax') || '55');
  const rawLomax = parseFloat(searchParams.get('lomax') || '25');

  if ([rawLamin, rawLomin, rawLamax, rawLomax].some(v => Number.isNaN(v))) {
    return NextResponse.json(
      { flights: [], timestamp: Date.now(), count: 0, error: 'Invalid bounds' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const bounds = normalizeBounds(rawLamin, rawLomin, rawLamax, rawLomax);
  const cacheKey = getCacheKey(bounds);
  const cached = cache.get(cacheKey);
  const now = Date.now();

  if (cached && now - cached.timestamp < CACHE_TTL) {
    return jsonResponse(filterResponseToBounds(cached.data, bounds));
  }

  if (now < rateLimitedUntil) {
    const retryAfterSeconds = Math.max(1, Math.ceil((rateLimitedUntil - now) / 1000));
    const fallback = getFallbackResponse(bounds, now, cached);
    if (fallback) {
      return jsonResponse({
        ...fallback,
        error: 'Rate limited: serving cached data',
        rateLimited: true,
        retryAfterSeconds,
      });
    }

    return NextResponse.json(
      { flights: [], timestamp: now, count: 0, error: 'Rate limited', rateLimited: true, retryAfterSeconds },
      { status: 429, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const url = `${OPENSKY_API_URL}?lamin=${bounds.lamin}&lomin=${bounds.lomin}&lamax=${bounds.lamax}&lomax=${bounds.lomax}`;
    const headers: Record<string, string> = {};
    const token = await getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(8000),
    });

    if (res.status === 429) {
      const retryAfterMs = parseRateLimitRetryAfterMs(res.headers) || DEFAULT_RATE_LIMIT_BACKOFF_MS;
      rateLimitedUntil = Math.max(rateLimitedUntil, now + retryAfterMs);
      const retryAfterSeconds = Math.max(1, Math.ceil((rateLimitedUntil - now) / 1000));

      const fallback = getFallbackResponse(bounds, now, cached);
      if (fallback) {
        return jsonResponse({
          ...fallback,
          error: 'Rate limited: serving cached data',
          rateLimited: true,
          retryAfterSeconds,
        });
      }

      return NextResponse.json(
        { flights: [], timestamp: now, count: 0, error: 'Rate limited', rateLimited: true, retryAfterSeconds },
        { status: 429, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    if (!res.ok) {
      const fallback = getFallbackResponse(bounds, now, cached);
      if (fallback) {
        return jsonResponse({ ...fallback, error: `Upstream ${res.status}: serving cached data` });
      }

      return NextResponse.json(
        { flights: [], timestamp: now, count: 0, error: `API error: ${res.status}` },
        { status: 502, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    rateLimitedUntil = 0;

    const data = await res.json();
    const states: unknown[][] = data.states || [];
    const flights: Flight[] = [];

    for (const state of states) {
      const flight = transformState(state);
      if (flight) flights.push(flight);
    }

    const response: FlightsResponse = {
      flights,
      timestamp: (data.time as number) * 1000 || now,
      count: flights.length,
    };

    cache.set(cacheKey, { data: response, bounds, timestamp: now });

    // Prune old cache entries
    if (cache.size > 50) {
      for (const [key, entry] of cache) {
        if (now - entry.timestamp > MAX_STALE_FALLBACK_MS) {
          cache.delete(key);
        }
      }
    }

    return jsonResponse(response);
  } catch (err) {
    const fallback = getFallbackResponse(bounds, now, cached);
    if (fallback) {
      return jsonResponse({ ...fallback, error: 'Network issue: serving cached data' });
    }

    return NextResponse.json(
      { flights: [], timestamp: now, count: 0, error: String(err) },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
