'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import maplibregl, { type Map } from 'maplibre-gl';
import FlightMap from '@/components/FlightMap';
import StatsBar from '@/components/StatsBar';
import FlightPanel from '@/components/FlightPanel';
import SearchBar from '@/components/SearchBar';
import AltitudeLegend from '@/components/AltitudeLegend';
import GeolocationButton from '@/components/GeolocationButton';
import FilterPanel from '@/components/FilterPanel';
import WeatherToggle from '@/components/WeatherToggle';
import StatsPanel from '@/components/StatsPanel';
import ThemeToggle from '@/components/ThemeToggle';
import ScreenshotButton from '@/components/ScreenshotButton';
import { useMapBounds } from '@/hooks/useMapBounds';
import { useFlightData } from '@/hooks/useFlightData';
import { useInterpolation } from '@/hooks/useInterpolation';
import { useFlightFilters } from '@/hooks/useFlightFilters';
import { useUrlState } from '@/hooks/useUrlState';
import { useFlightHistory } from '@/hooks/useFlightHistory';
import { useFlightRoute } from '@/hooks/useFlightRoute';
import { useSelectedFlightTracking } from '@/hooks/useSelectedFlightTracking';
import type { Flight } from '@/lib/types';

export default function Home() {
  const mapRef = useRef<Map | null>(null);
  const [selectedFlight, setSelectedFlight] = useState<Flight | null>(null);
  const { bounds, attachBoundsListener } = useMapBounds();
  const flightData = useFlightData(bounds);
  const { filters, setFilters, isOpen: filterOpen, setIsOpen: setFilterOpen, isActive: filterActive, applyFilters, reset: resetFilters } = useFlightFilters();
  const { restoreFromUrl, syncToUrl, initialIcao } = useUrlState(mapRef);
  const flightHistory = useFlightHistory();

  const filteredFlights = useMemo(() => applyFilters(flightData.current), [applyFilters, flightData.current]);

  // Update flight history on each data refresh
  useEffect(() => {
    if (flightData.current.length > 0) {
      flightHistory.update(flightData.current);
    }
  }, [flightData.current, flightHistory]);

  const handleMapReady = useCallback((map: Map) => {
    mapRef.current = map;
    attachBoundsListener(map);

    // Load airports
    import('@/data/airports.json').then(mod => {
      const source = map.getSource('airport-source') as maplibregl.GeoJSONSource | undefined;
      if (source) source.setData(mod.default as GeoJSON.FeatureCollection);
    }).catch(() => {});

    restoreFromUrl(map);
  }, [attachBoundsListener, restoreFromUrl]);

  const handleSelectFlight = useCallback((flight: Flight | null) => {
    setSelectedFlight(flight);
    if (flight && mapRef.current) {
      mapRef.current.flyTo({
        center: [flight.longitude, flight.latitude],
        duration: 800,
      });
      syncToUrl({ lng: flight.longitude, lat: flight.latitude }, mapRef.current.getZoom(), flight.icao24);
    } else if (mapRef.current) {
      const center = mapRef.current.getCenter();
      syncToUrl(center, mapRef.current.getZoom(), null);
    }
  }, [syncToUrl]);

  const handleSearchSelect = useCallback((flight: Flight) => {
    setSelectedFlight(flight);
    if (mapRef.current) {
      mapRef.current.flyTo({
        center: [flight.longitude, flight.latitude],
        zoom: 8,
        duration: 1200,
      });
    }
  }, []);

  // Poll selected aircraft only when it is not present in the current bulk snapshot
  const selectedNeedsDedicatedTracking = useMemo(() => {
    if (!selectedFlight) return false;
    return !flightData.current.some(f => f.icao24 === selectedFlight.icao24);
  }, [selectedFlight, flightData.current]);

  const { trackedFlight } = useSelectedFlightTracking(
    selectedNeedsDedicatedTracking ? selectedFlight?.icao24 ?? null : null,
  );

  // Keep selected flight data fresh — prefer fast-tracked data, fall back to bulk data
  const freshSelected = selectedFlight
    ? trackedFlight ?? flightData.current.find(f => f.icao24 === selectedFlight.icao24) ?? selectedFlight
    : null;

  // Merge fast-polled data into the flight array for interpolation
  const interpolationFlights = useMemo(() => {
    if (!trackedFlight || !selectedFlight) return filteredFlights;
    const idx = filteredFlights.findIndex(f => f.icao24 === trackedFlight.icao24);
    if (idx >= 0) {
      const result = [...filteredFlights];
      result[idx] = trackedFlight;
      return result;
    }
    return [...filteredFlights, trackedFlight];
  }, [filteredFlights, trackedFlight, selectedFlight]);

  // Get trail for selected aircraft
  const selectedTrail = freshSelected ? flightHistory.getTrail(freshSelected.icao24) : undefined;

  // Fetch route data for selected flight
  const { routeData, isLoading: routeLoading } = useFlightRoute(freshSelected);

  // Stable selectedFlight ref for FlightMap — only changes when icao24 changes, not on position updates
  const mapSelectedRef = useRef<Flight | null>(null);
  const prevIcaoRef = useRef<string | null>(null);
  if (freshSelected?.icao24 !== prevIcaoRef.current) {
    mapSelectedRef.current = freshSelected;
    prevIcaoRef.current = freshSelected?.icao24 ?? null;
  }
  const mapSelectedFlight = mapSelectedRef.current;

  // Refs for interpolation sync with trail/route visuals
  const trailRef = useRef<[number, number][] | undefined>(undefined);
  trailRef.current = selectedTrail;

  const routeDestRef = useRef<{ lat: number; lng: number } | null>(null);
  routeDestRef.current = routeData?.destination
    ? { lat: routeData.destination.latitude, lng: routeData.destination.longitude }
    : null;

  useInterpolation({
    current: interpolationFlights,
    previous: flightData.previous,
    lastUpdate: flightData.lastUpdate,
    mapRef,
    selectedIcao: freshSelected?.icao24 ?? null,
    trailRef,
    routeDestRef,
  });

  // Feed fast-polled positions into flight history for trail extension
  useEffect(() => {
    if (trackedFlight) {
      flightHistory.addPosition(trackedFlight);
    }
  }, [trackedFlight, flightHistory]);

  // Restore selected flight from URL on first data load (one-time only)
  const initialRestoreDone = useRef(false);
  useEffect(() => {
    if (initialRestoreDone.current) return;
    if (initialIcao && !selectedFlight && flightData.current.length > 0) {
      const found = flightData.current.find(f => f.icao24 === initialIcao);
      if (found) {
        setSelectedFlight(found);
        initialRestoreDone.current = true;
      }
    }
  }, [initialIcao, selectedFlight, flightData.current]);

  const handleGeolocate = useCallback((lng: number, lat: number) => {
    mapRef.current?.flyTo({ center: [lng, lat], zoom: 9, duration: 1200 });
  }, []);

  // Escape to close panels
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (filterOpen) setFilterOpen(false);
        else setSelectedFlight(null);
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [filterOpen, setFilterOpen]);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-bg-primary">
      <FlightMap
        onMapReady={handleMapReady}
        onSelectFlight={handleSelectFlight}
        selectedFlight={mapSelectedFlight}
        flights={interpolationFlights}
        trail={selectedTrail}
        routeData={routeData}
      />

      <StatsBar
        flights={filteredFlights}
        lastUpdate={flightData.lastUpdate}
        error={flightData.error}
        isLoading={flightData.isLoading}
      />

      <SearchBar
        flights={flightData.current}
        onSelect={handleSearchSelect}
      />

      <FilterPanel
        isOpen={filterOpen}
        onToggle={() => setFilterOpen(!filterOpen)}
        filters={filters}
        onChange={setFilters}
        onReset={resetFilters}
        isActive={filterActive}
      />

      <AltitudeLegend />

      <ScreenshotButton mapRef={mapRef} />
      <ThemeToggle mapRef={mapRef} />
      <WeatherToggle mapRef={mapRef} />
      <GeolocationButton onLocate={handleGeolocate} />
      <StatsPanel flights={filteredFlights} />

      <FlightPanel
        flight={freshSelected}
        onClose={() => setSelectedFlight(null)}
        routeData={routeData}
        routeLoading={routeLoading}
      />

      {/* Loading overlay */}
      {flightData.isLoading && flightData.current.length === 0 && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
          <div className="flex items-center gap-3 bg-bg-secondary/80 px-5 py-3 backdrop-blur-sm border border-border-subtle">
            <div className="w-2 h-2 bg-accent rounded-full animate-pulse" />
            <span className="text-sm text-text-secondary font-mono tracking-wide">
              Scanning airspace...
            </span>
          </div>
        </div>
      )}
    </main>
  );
}
