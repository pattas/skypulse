import { NextRequest, NextResponse } from 'next/server';
import { OPENSKY_API_URL } from '@/lib/constants';
import type { Flight } from '@/lib/types';
import { getOpenSkyAccessToken } from '@/lib/opensky-auth';
import { parseOpenSkyStatesPayload, transformOpenSkyStateToFlight } from '@/lib/opensky-state';

// Lightweight cache for single-aircraft queries (1s TTL)
let singleCache: { icao24: string; data: Flight; timestamp: number } | null = null;
const SINGLE_CACHE_TTL = 1_500;
const RATE_LIMIT_BACKOFF_MS = 15_000;
let rateLimitedUntil = 0;

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

  if (!/^[0-9a-f]{6}$/.test(normalizedIcao24)) {
    return NextResponse.json(
      { flight: null, error: 'Invalid icao24 parameter' },
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
    const token = await getOpenSkyAccessToken();
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
        { flight: null, error: 'Data provider unavailable' },
        { status: 502, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    rateLimitedUntil = 0;

    const payload: unknown = await res.json();
    const parsedPayload = parseOpenSkyStatesPayload(payload);
    if (!parsedPayload) {
      return NextResponse.json(
        { flight: null, error: 'Data provider returned invalid payload' },
        { status: 502, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const states = parsedPayload.states;

    if (states.length === 0) {
      return NextResponse.json(
        { flight: null, error: 'Aircraft not found' },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const flight = transformOpenSkyStateToFlight(states[0]);
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
    console.error('Failed to fetch single flight from OpenSky', err);
    if (singleCache && singleCache.icao24 === normalizedIcao24) {
      return NextResponse.json(
        { flight: singleCache.data, timestamp: singleCache.timestamp },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    return NextResponse.json(
      { flight: null, error: 'Unexpected server error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
