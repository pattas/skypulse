'use client';

import { useState, useCallback, useEffect } from 'react';
import { Crosshair } from 'lucide-react';
import { Z_INDEX } from '@/lib/z-index';

interface GeolocationButtonProps {
  onLocate: (lng: number, lat: number) => void;
}

export default function GeolocationButton({ onLocate }: GeolocationButtonProps) {
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!statusMessage) return;

    const timer = setTimeout(() => {
      setStatusMessage(null);
    }, 3500);

    return () => clearTimeout(timer);
  }, [statusMessage]);

  const handleClick = useCallback(() => {
    if (!navigator.geolocation) {
      setStatusMessage('Geolocation not supported');
      return;
    }

    setLoading(true);
    setStatusMessage(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onLocate(pos.coords.longitude, pos.coords.latitude);
        setLoading(false);
        setStatusMessage('Centered on your location');
      },
      (error) => {
        setLoading(false);
        if (error.code === error.PERMISSION_DENIED) {
          setStatusMessage('Location permission denied');
          return;
        }

        if (error.code === error.TIMEOUT) {
          setStatusMessage('Location request timed out');
          return;
        }

        setStatusMessage('Unable to determine location');
      },
      { enableHighAccuracy: false, timeout: 5000 },
    );
  }, [onLocate]);

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-label="Center map on my location"
        title="Center on my location"
        className={`absolute bottom-20 right-4 w-9 h-9 flex items-center justify-center bg-bg-secondary/90 border border-border-subtle backdrop-blur-sm text-text-label hover:text-text-primary transition-colors ${loading ? 'animate-pulse' : ''}`}
        style={{ zIndex: Z_INDEX.control }}
      >
        <Crosshair size={16} />
      </button>
      <p className="sr-only" aria-live="polite">{statusMessage ?? ''}</p>
      {statusMessage && (
        <div
          className="absolute bottom-20 right-16 bg-bg-secondary/95 border border-border-subtle px-2 py-1 text-[10px] uppercase tracking-wider text-text-secondary pointer-events-none"
          style={{ zIndex: Z_INDEX.panel }}
        >
          {statusMessage}
        </div>
      )}
    </>
  );
}
