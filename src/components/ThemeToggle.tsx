'use client';

import { useState, useCallback, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';
import type { Map } from 'maplibre-gl';
import { MAP_DARK_STYLE, MAP_LIGHT_STYLE } from '@/lib/constants';
import { Z_INDEX } from '@/lib/z-index';

interface ThemeToggleProps {
  mapRef: React.RefObject<Map | null>;
}

const THEME_STORAGE_KEY = 'skypulse-theme';

export default function ThemeToggle({ mapRef }: ThemeToggleProps) {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.localStorage.getItem(THEME_STORAGE_KEY) !== 'light';
  });

  useEffect(() => {
    const theme = isDark ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [isDark]);

  const toggle = useCallback(() => {
    const map = mapRef.current;
    const nextDark = !isDark;
    setIsDark(nextDark);

    if (map) {
      map.setStyle(nextDark ? MAP_DARK_STYLE : MAP_LIGHT_STYLE);
    }
  }, [isDark, mapRef]);

  return (
    <button
      type="button"
      suppressHydrationWarning
      onClick={toggle}
      aria-label={isDark ? 'Switch to light map theme' : 'Switch to dark map theme'}
      title={isDark ? 'Switch to light map' : 'Switch to dark map'}
      className="absolute bottom-44 right-4 w-9 h-9 flex items-center justify-center bg-bg-secondary/90 border border-border-subtle backdrop-blur-sm text-text-label hover:text-text-primary transition-colors"
      style={{ zIndex: Z_INDEX.control }}
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
