import { NextRequest, NextResponse } from 'next/server';

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

function parseAdsbdbAirport(ap: Record<string, unknown>): AirportData | null {
  if (!ap || !ap.icao_code) return null;
  return {
    icao: ap.icao_code as string,
    iata: (ap.iata_code as string) || '',
    name: (ap.name as string) || '',
    latitude: ap.latitude as number,
    longitude: ap.longitude as number,
  };
}

function emptyResponse(callsign: string, error?: string): RouteResponse {
  return { callsign, departure: null, destination: null, operatorIata: null, flightNumber: null, error };
}

export async function GET(request: NextRequest) {
  const callsign = request.nextUrl.searchParams.get('callsign')?.trim();

  if (!callsign) {
    return NextResponse.json(emptyResponse('', 'Missing callsign'), { status: 400 });
  }

  const now = Date.now();
  const cached = cache.get(callsign);
  if (cached && now - cached.timestamp < ROUTE_CACHE_TTL) {
    const status = cached.data.departure ? 200 : 404;
    return NextResponse.json(cached.data, { status });
  }

  try {
    const url = `https://api.adsbdb.com/v0/callsign/${encodeURIComponent(callsign)}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
    });

    if (res.status === 404 || res.status === 400) {
      const response = emptyResponse(callsign, 'Route not found');
      cache.set(callsign, { data: response, timestamp: now });
      return NextResponse.json(response, { status: 404 });
    }

    if (!res.ok) {
      return NextResponse.json(emptyResponse(callsign, `API error: ${res.status}`), { status: 502 });
    }

    const data = await res.json();
    const flightroute = data?.response?.flightroute;

    if (!flightroute) {
      const response = emptyResponse(callsign, 'No route data');
      cache.set(callsign, { data: response, timestamp: now });
      return NextResponse.json(response, { status: 404 });
    }

    const response: RouteResponse = {
      callsign,
      departure: parseAdsbdbAirport(flightroute.origin),
      destination: parseAdsbdbAirport(flightroute.destination),
      operatorIata: flightroute.airline?.iata || flightroute.callsign_iata?.slice(0, 2) || null,
      flightNumber: flightroute.callsign_iata || null,
    };

    cache.set(callsign, { data: response, timestamp: now });

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
    return NextResponse.json(emptyResponse(callsign, String(err)), { status: 500 });
  }
}
