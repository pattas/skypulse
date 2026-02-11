'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type { Map } from 'maplibre-gl';

interface UrlState {
  lng?: number;
  lat?: number;
  zoom?: number;
  icao?: string;
}

function parseUrlState(): UrlState {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  const state: UrlState = {};
  const lng = params.get('lng');
  const lat = params.get('lat');
  const zoom = params.get('z');
  const icao = params.get('icao');
  if (lng) state.lng = parseFloat(lng);
  if (lat) state.lat = parseFloat(lat);
  if (zoom) state.zoom = parseFloat(zoom);
  if (icao) state.icao = icao;
  return state;
}

export function useUrlState() {
  const updateTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const detachMoveListenerRef = useRef<(() => void) | null>(null);
  const [initialState] = useState<UrlState>(() => parseUrlState());

  // Restore view from URL on mount
  const restoreFromUrl = useCallback((map: Map, onSelectIcao?: (icao: string) => void) => {
    const s = initialState;
    if (s.lng != null && s.lat != null) {
      map.jumpTo({
        center: [s.lng, s.lat],
        zoom: s.zoom ?? map.getZoom(),
      });
    }
    if (s.icao && onSelectIcao) {
      onSelectIcao(s.icao);
    }
  }, [initialState]);

  // Sync map state to URL (debounced)
  const syncToUrl = useCallback((center: { lng: number; lat: number }, zoom: number, selectedIcao: string | null) => {
    if (typeof window === 'undefined') return;
    clearTimeout(updateTimer.current);
    updateTimer.current = setTimeout(() => {
      const params = new URLSearchParams();
      params.set('lng', center.lng.toFixed(4));
      params.set('lat', center.lat.toFixed(4));
      params.set('z', zoom.toFixed(1));
      if (selectedIcao) params.set('icao', selectedIcao);
      const url = `${window.location.pathname}?${params.toString()}`;
      window.history.replaceState(null, '', url);
    }, 500);
  }, []);

  const attachMoveListener = useCallback((map: Map) => {
    detachMoveListenerRef.current?.();

    const onMove = () => {
      const center = map.getCenter();
      syncToUrl(center, map.getZoom(), new URLSearchParams(window.location.search).get('icao'));
    };

    map.on('moveend', onMove);
    detachMoveListenerRef.current = () => {
      map.off('moveend', onMove);
      clearTimeout(updateTimer.current);
    };
  }, [syncToUrl]);

  useEffect(() => {
    return () => {
      detachMoveListenerRef.current?.();
      detachMoveListenerRef.current = null;
      clearTimeout(updateTimer.current);
    };
  }, []);

  return {
    restoreFromUrl,
    syncToUrl,
    attachMoveListener,
    initialIcao: initialState.icao,
  };
}
