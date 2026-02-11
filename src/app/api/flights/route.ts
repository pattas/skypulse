import { NextRequest, NextResponse } from 'next/server';
import { OPENSKY_API_URL, CACHE_TTL } from '@/lib/constants';
import type { BoundingBox, Flight, FlightsResponse } from '@/lib/types';
import { getOpenSkyAccessToken } from '@/lib/opensky-auth';
import { parseOpenSkyStatesPayload, transformOpenSkyStateToFlight } from '@/lib/opensky-state';

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
    const token = await getOpenSkyAccessToken();
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
        return jsonResponse({ ...fallback, error: 'Data provider unavailable: serving cached data' });
      }

      return NextResponse.json(
        { flights: [], timestamp: now, count: 0, error: 'Data provider unavailable' },
        { status: 502, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    rateLimitedUntil = 0;

    const payload: unknown = await res.json();
    const parsedPayload = parseOpenSkyStatesPayload(payload);
    if (!parsedPayload) {
      const fallback = getFallbackResponse(bounds, now, cached);
      if (fallback) {
        return jsonResponse({ ...fallback, error: 'Data provider returned invalid payload: serving cached data' });
      }

      return NextResponse.json(
        { flights: [], timestamp: now, count: 0, error: 'Data provider returned invalid payload' },
        { status: 502, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const states = parsedPayload.states;
    const flights: Flight[] = [];

    for (const state of states) {
      const flight = transformOpenSkyStateToFlight(state);
      if (flight) flights.push(flight);
    }

    const response: FlightsResponse = {
      flights,
      timestamp: parsedPayload.timeSeconds ? parsedPayload.timeSeconds * 1000 : now,
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
    console.error('Failed to fetch flights from OpenSky', err);
    const fallback = getFallbackResponse(bounds, now, cached);
    if (fallback) {
      return jsonResponse({ ...fallback, error: 'Network issue: serving cached data' });
    }

    return NextResponse.json(
      { flights: [], timestamp: now, count: 0, error: 'Unexpected server error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
