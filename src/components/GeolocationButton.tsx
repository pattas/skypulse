'use client';

import { useState, useCallback } from 'react';
import { Crosshair } from 'lucide-react';

interface GeolocationButtonProps {
  onLocate: (lng: number, lat: number) => void;
}

export default function GeolocationButton({ onLocate }: GeolocationButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = useCallback(() => {
    if (!navigator.geolocation) return;
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onLocate(pos.coords.longitude, pos.coords.latitude);
        setLoading(false);
      },
      () => {
        setLoading(false);
      },
      { enableHighAccuracy: false, timeout: 5000 },
    );
  }, [onLocate]);

  return (
    <button
      onClick={handleClick}
      title="Center on my location"
      className={`absolute bottom-20 right-4 z-10 w-9 h-9 flex items-center justify-center bg-bg-secondary/90 border border-border-subtle backdrop-blur-sm text-text-label hover:text-text-primary transition-colors ${loading ? 'animate-pulse' : ''}`}
    >
      <Crosshair size={16} />
    </button>
  );
}
