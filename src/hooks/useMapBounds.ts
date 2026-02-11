'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Map } from 'maplibre-gl';
import type { BoundingBox } from '@/lib/types';
import { DEBOUNCE_BOUNDS_MS } from '@/lib/constants';

const MIN_BOUNDS_DELTA = 0.01;

export function useMapBounds() {
  const [bounds, setBounds] = useState<BoundingBox | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBoundsRef = useRef<BoundingBox | null>(null);
  const detachListenerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      detachListenerRef.current?.();
      detachListenerRef.current = null;
    };
  }, []);

  const attachBoundsListener = useCallback((map: Map) => {
    detachListenerRef.current?.();

    const setIfChanged = (next: BoundingBox) => {
      const prev = lastBoundsRef.current;
      if (
        prev &&
        Math.abs(next.lamin - prev.lamin) < MIN_BOUNDS_DELTA &&
        Math.abs(next.lomin - prev.lomin) < MIN_BOUNDS_DELTA &&
        Math.abs(next.lamax - prev.lamax) < MIN_BOUNDS_DELTA &&
        Math.abs(next.lomax - prev.lomax) < MIN_BOUNDS_DELTA
      ) {
        return;
      }
      lastBoundsRef.current = next;
      setBounds(next);
    };

    const update = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const b = map.getBounds();
        setIfChanged({
          lamin: b.getSouth(),
          lomin: b.getWest(),
          lamax: b.getNorth(),
          lomax: b.getEast(),
        });
      }, DEBOUNCE_BOUNDS_MS);
    };

    map.on('moveend', update);
    detachListenerRef.current = () => {
      map.off('moveend', update);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    // Set initial bounds
    const b = map.getBounds();
    setIfChanged({
      lamin: b.getSouth(),
      lomin: b.getWest(),
      lamax: b.getNorth(),
      lomax: b.getEast(),
    });
  }, []);

  return { bounds, attachBoundsListener };
}
