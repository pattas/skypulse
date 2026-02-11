'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { haversineDistance } from '@/lib/geo';
import type { Flight, FlightRoute, AirportInfo } from '@/lib/types';

interface RouteCacheEntry {
  value: FlightRoute;
  timestamp: number;
}

const ROUTE_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_ROUTE_CACHE_SIZE = 200;
const routeCache = new Map<string, RouteCacheEntry>();

function readFromCache(callsign: string): FlightRoute | null {
  const cached = routeCache.get(callsign);
  if (!cached) return null;

  if (Date.now() - cached.timestamp > ROUTE_CACHE_TTL_MS) {
    routeCache.delete(callsign);
    return null;
  }

  routeCache.delete(callsign);
  routeCache.set(callsign, cached);
  return cached.value;
}

function writeToCache(callsign: string, value: FlightRoute): void {
  routeCache.set(callsign, { value, timestamp: Date.now() });

  if (routeCache.size > MAX_ROUTE_CACHE_SIZE) {
    const oldestKey = routeCache.keys().next().value;
    if (typeof oldestKey === 'string') {
      routeCache.delete(oldestKey);
    }
  }
}

function toAirportInfo(ap: unknown): AirportInfo | null {
  if (!ap || typeof ap !== 'object' || Array.isArray(ap)) return null;

  const payload = ap as Record<string, unknown>;
  if (typeof payload.icao !== 'string' || !payload.icao.trim()) return null;
  if (typeof payload.latitude !== 'number' || !Number.isFinite(payload.latitude)) return null;
  if (typeof payload.longitude !== 'number' || !Number.isFinite(payload.longitude)) return null;

  return {
    icao: payload.icao,
    iata: typeof payload.iata === 'string' ? payload.iata : '',
    name: typeof payload.name === 'string' ? payload.name : '',
    latitude: payload.latitude,
    longitude: payload.longitude,
  };
}

export function useFlightRoute(flight: Flight | null) {
  const [routeData, setRouteData] = useState<FlightRoute | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const callsign = flight?.callsign.trim() ?? '';

  const fetchRoute = useCallback(async (callsign: string) => {
    // Check client cache
    const cached = readFromCache(callsign);
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

      const data: unknown = await res.json();
      if (typeof data !== 'object' || data === null) {
        if (!controller.signal.aborted) {
          setRouteData(null);
          setIsLoading(false);
        }
        return;
      }

      const payload = data as Record<string, unknown>;
      const departure = toAirportInfo(payload.departure);
      const destination = toAirportInfo(payload.destination);

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
        operatorIata: typeof payload.operatorIata === 'string' ? payload.operatorIata : null,
        flightNumber: typeof payload.flightNumber === 'string' ? payload.flightNumber : null,
        routeIcaoCodes: [departure?.icao, destination?.icao].filter(Boolean) as string[],
        distanceKm,
      };

      writeToCache(callsign, route);
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
    abortRef.current?.abort();
    if (!callsign) return;

    const timer = setTimeout(() => {
      void fetchRoute(callsign);
    }, 0);

    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [callsign, fetchRoute]);

  return {
    routeData: callsign ? routeData : null,
    isLoading: callsign ? isLoading : false,
  };
}
