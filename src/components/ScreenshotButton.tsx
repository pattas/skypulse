'use client';

import { useCallback } from 'react';
import { Camera } from 'lucide-react';
import type { Map } from 'maplibre-gl';
import { Z_INDEX } from '@/lib/z-index';

interface ScreenshotButtonProps {
  mapRef: React.RefObject<Map | null>;
}

export default function ScreenshotButton({ mapRef }: ScreenshotButtonProps) {
  const handleScreenshot = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const canvas = map.getCanvas();
    canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `skypulse-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }, [mapRef]);

  return (
    <button
      type="button"
      onClick={handleScreenshot}
      aria-label="Download map screenshot"
      title="Screenshot map"
      className="absolute bottom-56 right-4 w-9 h-9 flex items-center justify-center bg-bg-secondary/90 border border-border-subtle backdrop-blur-sm text-text-label hover:text-text-primary transition-colors"
      style={{ zIndex: Z_INDEX.control }}
    >
      <Camera size={16} />
    </button>
  );
}
