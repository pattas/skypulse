'use client';

import { useState, useCallback } from 'react';
import { Sun, Moon } from 'lucide-react';
import type { Map } from 'maplibre-gl';

interface ThemeToggleProps {
  mapRef: React.RefObject<Map | null>;
}

const DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const LIGHT_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

export default function ThemeToggle({ mapRef }: ThemeToggleProps) {
  const [isDark, setIsDark] = useState(true);

  const toggle = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const nextDark = !isDark;
    setIsDark(nextDark);
    map.setStyle(nextDark ? DARK_STYLE : LIGHT_STYLE);
    document.documentElement.setAttribute('data-theme', nextDark ? 'dark' : 'light');
  }, [isDark, mapRef]);

  return (
    <button
      onClick={toggle}
      title={isDark ? 'Switch to light map' : 'Switch to dark map'}
      className="absolute bottom-44 right-4 z-10 w-9 h-9 flex items-center justify-center bg-bg-secondary/90 border border-border-subtle backdrop-blur-sm text-text-label hover:text-text-primary transition-colors"
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
