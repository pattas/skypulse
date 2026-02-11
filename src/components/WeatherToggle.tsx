'use client';

import { useState, useEffect, useCallback } from 'react';
import { CloudRain } from 'lucide-react';
import type { Map } from 'maplibre-gl';

interface WeatherToggleProps {
  mapRef: React.RefObject<Map | null>;
}

const RAINVIEWER_SOURCE = 'rainviewer-source';
const RAINVIEWER_LAYER = 'rainviewer-layer';

export default function WeatherToggle({ mapRef }: WeatherToggleProps) {
  const [enabled, setEnabled] = useState(false);
  const [tileUrl, setTileUrl] = useState<string | null>(null);

  // Fetch latest RainViewer timestamp
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const fetchTiles = async () => {
      try {
        const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
        const data = await res.json();
        const latest = data.radar?.past?.slice(-1)[0];
        if (latest && !cancelled) {
          const host = data.host || 'https://tilecache.rainviewer.com';
          setTileUrl(`${host}${latest.path}/256/{z}/{x}/{y}/2/1_1.png`);
        }
      } catch {
        // Silently fail — weather is optional
      }
    };

    fetchTiles();
    const interval = setInterval(fetchTiles, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [enabled]);

  // Suppress tile fetch errors for weather layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleError = (e: { sourceId?: string; error?: Error }) => {
      if (e.sourceId === RAINVIEWER_SOURCE) {
        // Prevent MapLibre from logging tile fetch failures for weather tiles
        if (e.error) e.error.message = '';
      }
    };
    map.on('error', handleError);
    return () => { map.off('error', handleError); };
  }, [mapRef]);

  // Add/remove layer from map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const applyLayer = () => {
      // Always clean up existing weather layer/source first
      if (map.getLayer(RAINVIEWER_LAYER)) map.removeLayer(RAINVIEWER_LAYER);
      if (map.getSource(RAINVIEWER_SOURCE)) map.removeSource(RAINVIEWER_SOURCE);

      if (enabled && tileUrl) {
        map.addSource(RAINVIEWER_SOURCE, {
          type: 'raster',
          tiles: [tileUrl],
          tileSize: 256,
          minzoom: 2,
          maxzoom: 7,
        });
        const beforeLayer = map.getLayer('aircraft-highlight') ? 'aircraft-highlight' : undefined;
        map.addLayer({
          id: RAINVIEWER_LAYER,
          type: 'raster',
          source: RAINVIEWER_SOURCE,
          paint: { 'raster-opacity': 0.5 },
        }, beforeLayer);
      }
    };

    if (map.isStyleLoaded()) {
      applyLayer();
    } else {
      map.once('style.load', applyLayer);
      return () => { map.off('style.load', applyLayer); };
    }
  }, [enabled, tileUrl, mapRef]);

  const toggle = useCallback(() => setEnabled(v => !v), []);

  return (
    <button
      onClick={toggle}
      title="Toggle weather radar"
      className={`absolute bottom-32 right-4 z-10 w-9 h-9 flex items-center justify-center bg-bg-secondary/90 border backdrop-blur-sm transition-colors ${
        enabled ? 'border-accent/50 text-accent' : 'border-border-subtle text-text-label hover:text-text-primary'
      }`}
    >
      <CloudRain size={16} />
    </button>
  );
}
