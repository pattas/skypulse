'use client';

import { useState, useMemo, useCallback } from 'react';
import type { Flight } from '@/lib/types';

export interface FilterState {
  altitudeRange: [number, number];
  speedRange: [number, number];
  categories: number[];
  onGround: 'all' | 'airborne' | 'ground';
  countries: string[];
}

const DEFAULT_FILTERS: FilterState = {
  altitudeRange: [0, 15000],
  speedRange: [0, 400],
  categories: [],
  onGround: 'all',
  countries: [],
};

export function useFlightFilters() {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [isOpen, setIsOpen] = useState(false);

  const isActive = useMemo(() => {
    return (
      filters.altitudeRange[0] !== DEFAULT_FILTERS.altitudeRange[0] ||
      filters.altitudeRange[1] !== DEFAULT_FILTERS.altitudeRange[1] ||
      filters.speedRange[0] !== DEFAULT_FILTERS.speedRange[0] ||
      filters.speedRange[1] !== DEFAULT_FILTERS.speedRange[1] ||
      filters.categories.length > 0 ||
      filters.onGround !== 'all' ||
      filters.countries.length > 0
    );
  }, [filters]);

  const applyFilters = useCallback((flights: Flight[]): Flight[] => {
    if (!isActive) return flights;

    return flights.filter(f => {
      // Altitude filter (meters)
      const altM = f.baroAltitude ?? f.geoAltitude ?? 0;
      if (altM < filters.altitudeRange[0] || altM > filters.altitudeRange[1]) return false;

      // Speed filter (m/s)
      const spdMs = f.velocity ?? 0;
      if (spdMs < filters.speedRange[0] || spdMs > filters.speedRange[1]) return false;

      // Category filter
      if (filters.categories.length > 0 && !filters.categories.includes(f.category)) return false;

      // Airborne/ground filter
      if (filters.onGround === 'airborne' && f.onGround) return false;
      if (filters.onGround === 'ground' && !f.onGround) return false;

      // Country filter
      if (filters.countries.length > 0 && !filters.countries.includes(f.country)) return false;

      return true;
    });
  }, [filters, isActive]);

  const reset = useCallback(() => setFilters(DEFAULT_FILTERS), []);

  return {
    filters,
    setFilters,
    isOpen,
    setIsOpen,
    isActive,
    applyFilters,
    reset,
  };
}
