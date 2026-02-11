'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BoundingBox, FlightDataState, FlightsResponse } from '@/lib/types';
import { POLL_INTERVAL } from '@/lib/constants';

const RETRY_DELAY = 3_000;
const BOUNDS_FETCH_COOLDOWN = 2_500;
const IN_FLIGHT_POLL_DELAY = 250;
const MAX_RATE_LIMIT_RETRY_MS = 60_000;

interface FetchResult {
  ok: boolean;
  retryDelayMs?: number;
}

function getBoundsSignature(bounds: BoundingBox): string {
  return `${bounds.lamin.toFixed(2)}_${bounds.lomin.toFixed(2)}_${bounds.lamax.toFixed(2)}_${bounds.lomax.toFixed(2)}`;
}

export function useFlightData(bounds: BoundingBox | null) {
  const [state, setState] = useState<FlightDataState>({
    current: [],
    previous: [],
    lastUpdate: 0,
    error: null,
    isLoading: true,
  });
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastAttemptRef = useRef(0);
  const isFetchingRef = useRef(false);
  const pendingBoundsRefreshRef = useRef(false);
  const lastBoundsSignatureRef = useRef<string | null>(null);
  const rateLimitedUntilRef = useRef(0);
  const pollRef = useRef<() => void>(() => {});

  const fetchFlights = useCallback(async (signal: AbortSignal): Promise<FetchResult> => {
    const b = boundsRef.current;
    if (!b) return { ok: false };

    lastAttemptRef.current = Date.now();

    try {
      const params = new URLSearchParams({
        lamin: b.lamin.toFixed(2),
        lomin: b.lomin.toFixed(2),
        lamax: b.lamax.toFixed(2),
        lomax: b.lomax.toFixed(2),
      });

      const res = await fetch(`/api/flights?${params}`, { signal });
      const data: FlightsResponse = await res.json();
      const isRateLimited = res.status === 429 || data.rateLimited === true;
      const retryDelayMs = data.retryAfterSeconds && data.retryAfterSeconds > 0
        ? Math.min(data.retryAfterSeconds * 1000, MAX_RATE_LIMIT_RETRY_MS)
        : undefined;

      if (isRateLimited && retryDelayMs) {
        rateLimitedUntilRef.current = Date.now() + retryDelayMs;
      }

      if (data.error && data.flights.length === 0) {
        setState(prev => ({
          ...prev,
          error: prev.current.length > 0 ? null : data.rateLimited ? 'Rate limited, waiting...' : 'Connecting...',
          isLoading: prev.current.length === 0,
        }));
        return { ok: false, retryDelayMs };
      }

      if (!isRateLimited) {
        rateLimitedUntilRef.current = 0;
      }

      setState(prev => ({
        current: data.flights,
        previous: prev.current.length > 0 ? prev.current : data.flights,
        lastUpdate: Date.now(),
        error: null,
        isLoading: false,
      }));
      return isRateLimited ? { ok: false, retryDelayMs } : { ok: true };
    } catch (err) {
      if ((err as Error).name === 'AbortError') return { ok: false };
      setState(prev => ({ ...prev, error: String(err), isLoading: false }));
      return { ok: false };
    }
  }, []);

  // Single polling loop — the only code path that calls fetchFlights + setTimeout
  useEffect(() => {
    const controller = new AbortController();

    const poll = async () => {
      if (controller.signal.aborted) return;

      if (isFetchingRef.current) {
        timeoutRef.current = setTimeout(poll, IN_FLIGHT_POLL_DELAY);
        return;
      }

      isFetchingRef.current = true;
      let result: FetchResult = { ok: false };
      try {
        result = await fetchFlights(controller.signal);
      } catch {
        // Safety net
      } finally {
        isFetchingRef.current = false;
      }

      if (controller.signal.aborted) return;

      const shouldRefreshBounds = pendingBoundsRefreshRef.current;
      pendingBoundsRefreshRef.current = false;
      const retryDelay = result.retryDelayMs ?? RETRY_DELAY;
      timeoutRef.current = setTimeout(poll, shouldRefreshBounds ? 0 : result.ok ? POLL_INTERVAL : retryDelay);
    };

    pollRef.current = poll;

    // Initial fetch with short delay for map settle
    timeoutRef.current = setTimeout(poll, 500);

    return () => {
      controller.abort();
      clearTimeout(timeoutRef.current);
    };
  }, [fetchFlights]);

  // When bounds change, clear the pending timeout and kick poll() immediately
  useEffect(() => {
    if (!bounds) return;

    const signature = getBoundsSignature(bounds);
    if (signature === lastBoundsSignatureRef.current) return;
    lastBoundsSignatureRef.current = signature;

    pendingBoundsRefreshRef.current = true;

    const rateLimitWaitMs = rateLimitedUntilRef.current - Date.now();
    if (rateLimitWaitMs > 0) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(pollRef.current, Math.min(rateLimitWaitMs, MAX_RATE_LIMIT_RETRY_MS));
      return;
    }

    const sinceLastAttempt = Date.now() - lastAttemptRef.current;
    if (sinceLastAttempt < BOUNDS_FETCH_COOLDOWN) {
      if (isFetchingRef.current) return;
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(pollRef.current, BOUNDS_FETCH_COOLDOWN - sinceLastAttempt);
      return;
    }

    if (!isFetchingRef.current) {
      clearTimeout(timeoutRef.current);
      pollRef.current();
    }
  }, [bounds]);

  return state;
}
