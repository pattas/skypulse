'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { haversineDistance } from '@/lib/geo';
import type { Flight, FlightRoute, AirportInfo } from '@/lib/types';

const routeCache = new Map<string, FlightRoute>();

function toAirportInfo(ap: Record<string, unknown> | null): AirportInfo | null {
  if (!ap || !ap.icao) return null;
  return {
    icao: ap.icao as string,
    iata: (ap.iata as string) || '',
    name: (ap.name as string) || '',
    latitude: ap.latitude as number,
    longitude: ap.longitude as number,
  };
}

export function useFlightRoute(flight: Flight | null) {
  const [routeData, setRouteData] = useState<FlightRoute | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchRoute = useCallback(async (callsign: string) => {
    // Check client cache
    const cached = routeCache.get(callsign);
    if (cached) {
      setRouteData(cached);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`/api/route?callsign=${encodeURIComponent(callsign)}`, {
        signal: controller.signal,
      });

      const data = await res.json();
      const departure = toAirportInfo(data.departure);
      const destination = toAirportInfo(data.destination);

      let distanceKm: number | null = null;
      if (departure && destination) {
        distanceKm = Math.round(
          haversineDistance(departure.latitude, departure.longitude, destination.latitude, destination.longitude),
        );
      }

      const route: FlightRoute = {
        callsign,
        departure,
        destination,
        operatorIata: data.operatorIata || null,
        flightNumber: data.flightNumber || null,
        routeIcaoCodes: [departure?.icao, destination?.icao].filter(Boolean) as string[],
        distanceKm,
      };

      routeCache.set(callsign, route);
      if (!controller.signal.aborted) {
        setRouteData(route);
        setIsLoading(false);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (!controller.signal.aborted) {
        setRouteData(null);
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!flight || !flight.callsign.trim()) {
      setRouteData(null);
      setIsLoading(false);
      return;
    }

    fetchRoute(flight.callsign.trim());

    return () => {
      abortRef.current?.abort();
    };
  }, [flight?.callsign, flight?.icao24, fetchRoute]);

  return { routeData, isLoading };
}
