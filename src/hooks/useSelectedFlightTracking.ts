'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Flight } from '@/lib/types';

const FAST_POLL_INTERVAL = 4_000;
const RETRY_POLL_INTERVAL = 15_000;
const MAX_RATE_LIMIT_RETRY_MS = 60_000;

interface FlightApiResponse {
  flight: Flight | null;
  error?: string;
  rateLimited?: boolean;
  retryAfterSeconds?: number;
}

interface FetchResult {
  ok: boolean;
  retryAfterMs?: number;
}

/**
 * Polls a single selected aircraft via /api/flight with adaptive backoff.
 * Returns the latest data for the selected flight, or null if none selected.
 */
export function useSelectedFlightTracking(selectedIcao: string | null) {
  const [trackedFlight, setTrackedFlight] = useState<Flight | null>(null);
  const [lastUpdate, setLastUpdate] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const icaoRef = useRef(selectedIcao);
  icaoRef.current = selectedIcao;

  const fetchFlight = useCallback(async (icao24: string, signal: AbortSignal): Promise<FetchResult> => {
    try {
      const res = await fetch(`/api/flight?icao24=${encodeURIComponent(icao24)}`, { signal });
      const data: FlightApiResponse = await res.json();

      // Check if selection changed while we were fetching
      if (icaoRef.current !== icao24) return { ok: false };

      if (data.flight) {
        setTrackedFlight(data.flight);
        setLastUpdate(Date.now());
        return { ok: true };
      }

      const retryAfterMs = data.retryAfterSeconds && data.retryAfterSeconds > 0
        ? Math.min(data.retryAfterSeconds * 1000, MAX_RATE_LIMIT_RETRY_MS)
        : undefined;
      return { ok: false, retryAfterMs };
    } catch (err) {
      if ((err as Error).name === 'AbortError') return { ok: false };
      return { ok: false };
    }
  }, []);

  useEffect(() => {
    if (!selectedIcao) {
      setTrackedFlight(null);
      return;
    }

    const controller = new AbortController();

    const poll = async () => {
      const icao = icaoRef.current;
      if (!icao || controller.signal.aborted) return;

      const result = await fetchFlight(icao, controller.signal);
      const retryAfterMs = result.retryAfterMs ?? RETRY_POLL_INTERVAL;

      if (!controller.signal.aborted && icaoRef.current === icao) {
        timeoutRef.current = setTimeout(poll, result.ok ? FAST_POLL_INTERVAL : retryAfterMs);
      }
    };

    // Start polling immediately
    poll();

    return () => {
      controller.abort();
      clearTimeout(timeoutRef.current);
    };
  }, [selectedIcao, fetchFlight]);

  return { trackedFlight, lastUpdate };
}
