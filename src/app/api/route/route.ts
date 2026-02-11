import { NextRequest, NextResponse } from 'next/server';
import { parseAdsbdbRouteResponse } from '@/lib/adsbdb';

interface AirportData {
  icao: string;
  iata: string;
  name: string;
  latitude: number;
  longitude: number;
}

interface RouteResponse {
  callsign: string;
  departure: AirportData | null;
  destination: AirportData | null;
  operatorIata: string | null;
  flightNumber: string | null;
  error?: string;
}

interface CacheEntry {
  data: RouteResponse;
  timestamp: number;
}

const ROUTE_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const cache = new Map<string, CacheEntry>();

function emptyResponse(callsign: string, error?: string): RouteResponse {
  return { callsign, departure: null, destination: null, operatorIata: null, flightNumber: null, error };
}

export async function GET(request: NextRequest) {
  const callsign = request.nextUrl.searchParams.get('callsign')?.trim();

  if (!callsign) {
    return NextResponse.json(emptyResponse('', 'Missing callsign'), { status: 400 });
  }

  const now = Date.now();
  const normalizedCallsign = callsign.toUpperCase();
  const cached = cache.get(normalizedCallsign);
  if (cached && now - cached.timestamp < ROUTE_CACHE_TTL) {
    const status = cached.data.departure ? 200 : 404;
    return NextResponse.json(cached.data, { status });
  }

  try {
    const url = `https://api.adsbdb.com/v0/callsign/${encodeURIComponent(normalizedCallsign)}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
    });

    if (res.status === 404 || res.status === 400) {
      const response = emptyResponse(normalizedCallsign, 'Route not found');
      cache.set(normalizedCallsign, { data: response, timestamp: now });
      return NextResponse.json(response, { status: 404 });
    }

    if (!res.ok) {
      return NextResponse.json(emptyResponse(normalizedCallsign, 'Data provider unavailable'), { status: 502 });
    }

    const payload: unknown = await res.json();
    const parsedRoute = parseAdsbdbRouteResponse(payload);

    if (!parsedRoute) {
      const response = emptyResponse(normalizedCallsign, 'No route data');
      cache.set(normalizedCallsign, { data: response, timestamp: now });
      return NextResponse.json(response, { status: 404 });
    }

    const response: RouteResponse = {
      callsign: normalizedCallsign,
      departure: parsedRoute.departure as AirportData | null,
      destination: parsedRoute.destination as AirportData | null,
      operatorIata: parsedRoute.operatorIata,
      flightNumber: parsedRoute.flightNumber,
    };

    cache.set(normalizedCallsign, { data: response, timestamp: now });

    // Prune old cache entries
    if (cache.size > 200) {
      for (const [key, entry] of cache) {
        if (now - entry.timestamp > ROUTE_CACHE_TTL * 3) {
          cache.delete(key);
        }
      }
    }

    return NextResponse.json(response);
  } catch (err) {
    console.error('Failed to fetch route data from ADSBDB', err);
    return NextResponse.json(emptyResponse(normalizedCallsign, 'Unexpected server error'), { status: 500 });
  }
}
