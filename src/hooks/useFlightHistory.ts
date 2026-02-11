'use client';

import { useRef, useCallback } from 'react';
import type { Flight } from '@/lib/types';

interface PositionRecord {
  lng: number;
  lat: number;
  altitude: number | null;
  timestamp: number;
}

const MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes
const MIN_DISTANCE = 0.001; // ~100m, avoid storing identical positions

export function useFlightHistory() {
  const historyRef = useRef<Map<string, PositionRecord[]>>(new Map());

  const update = useCallback((flights: Flight[]) => {
    const now = Date.now();
    const history = historyRef.current;

    for (const f of flights) {
      let records = history.get(f.icao24);
      if (!records) {
        records = [];
        history.set(f.icao24, records);
      }

      // Only add if moved enough
      const last = records[records.length - 1];
      if (last) {
        const dLat = Math.abs(f.latitude - last.lat);
        const dLng = Math.abs(f.longitude - last.lng);
        if (dLat < MIN_DISTANCE && dLng < MIN_DISTANCE) continue;
      }

      records.push({ lng: f.longitude, lat: f.latitude, altitude: f.altitude, timestamp: now });

      // Prune old entries
      const cutoff = now - MAX_AGE_MS;
      while (records.length > 0 && records[0].timestamp < cutoff) {
        records.shift();
      }
    }

    // Remove entries for aircraft no longer in view
    const activeIcaos = new Set(flights.map(f => f.icao24));
    for (const key of history.keys()) {
      if (!activeIcaos.has(key)) {
        const records = history.get(key)!;
        const cutoff = now - MAX_AGE_MS;
        if (records.length === 0 || records[records.length - 1].timestamp < cutoff) {
          history.delete(key);
        }
      }
    }
  }, []);

  const addPosition = useCallback((flight: Flight) => {
    const now = Date.now();
    const history = historyRef.current;
    let records = history.get(flight.icao24);
    if (!records) {
      records = [];
      history.set(flight.icao24, records);
    }

    const last = records[records.length - 1];
    if (last) {
      const dLat = Math.abs(flight.latitude - last.lat);
      const dLng = Math.abs(flight.longitude - last.lng);
      if (dLat < MIN_DISTANCE && dLng < MIN_DISTANCE) return;
    }

    records.push({ lng: flight.longitude, lat: flight.latitude, altitude: flight.altitude, timestamp: now });

    const cutoff = now - MAX_AGE_MS;
    while (records.length > 0 && records[0].timestamp < cutoff) {
      records.shift();
    }
  }, []);

  const getTrail = useCallback((icao24: string): [number, number][] => {
    const records = historyRef.current.get(icao24);
    if (!records || records.length < 2) return [];
    return records.map(r => [r.lng, r.lat]);
  }, []);

  return { update, addPosition, getTrail };
}
