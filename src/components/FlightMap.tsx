'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import maplibregl, { type Map } from 'maplibre-gl';
import { MAP_CENTER, MAP_ZOOM, MAP_STYLE } from '@/lib/constants';
import { registerAircraftIcon, ICON_NAME } from '@/lib/aircraft-icon';
import type { Flight, FlightRoute } from '@/lib/types';
import AircraftTooltip from './AircraftTooltip';
import AirportPopup from './AirportPopup';

interface FlightMapProps {
  onMapReady: (map: Map) => void;
  onSelectFlight: (flight: Flight | null) => void;
  selectedFlight: Flight | null;
  flights: Flight[];
  trail?: [number, number][];
  routeData?: FlightRoute | null;
}

export default function FlightMap({ onMapReady, onSelectFlight, selectedFlight, flights, trail, routeData }: FlightMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const [tooltip, setTooltip] = useState({ visible: false, callsign: '', altitude: '', speed: '', x: 0, y: 0 });
  const [airportPopup, setAirportPopup] = useState({ visible: false, name: '', icao: '', iata: '', x: 0, y: 0 });

  const flightsRef = useRef(flights);
  flightsRef.current = flights;

  const initMap = useCallback(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [MAP_CENTER.lng, MAP_CENTER.lat],
      zoom: MAP_ZOOM,
      attributionControl: {},
      maxZoom: 14,
      minZoom: 2,
    });

    const setupSourcesAndLayers = async () => {
      await registerAircraftIcon(map);

      // Sources
      map.addSource('aircraft-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addSource('route-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addSource('highlight-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addSource('trail-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addSource('airport-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addSource('heading-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addSource('route-airport-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addSource('speed-vector-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // === Layers (bottom to top) ===

      // Airport circles (visible at zoom > 6)
      map.addLayer({
        id: 'airport-circles',
        type: 'circle',
        source: 'airport-source',
        minzoom: 6,
        paint: {
          'circle-radius': 4,
          'circle-color': '#6B7094',
          'circle-opacity': 0.6,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#6B7094',
          'circle-stroke-opacity': 0.3,
        },
      });

      // Airport labels
      map.addLayer({
        id: 'airport-labels',
        type: 'symbol',
        source: 'airport-source',
        minzoom: 7,
        layout: {
          'text-field': ['get', 'iata'],
          'text-size': 10,
          'text-offset': [0, 1.2],
          'text-font': ['Open Sans Regular'],
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': '#6B7094',
          'text-halo-color': document.documentElement.getAttribute('data-theme') === 'light' ? '#FFFFFF' : '#0C0F1A',
          'text-halo-width': 1,
        },
      });

      // Route airport markers (departure/destination)
      map.addLayer({
        id: 'route-airport-markers',
        type: 'circle',
        source: 'route-airport-source',
        paint: {
          'circle-radius': 6,
          'circle-color': '#F59E0B',
          'circle-opacity': 0.8,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#F59E0B',
          'circle-stroke-opacity': 0.3,
        },
      });

      // Route airport labels
      map.addLayer({
        id: 'route-airport-labels',
        type: 'symbol',
        source: 'route-airport-source',
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 12,
          'text-offset': [0, 1.5],
          'text-font': ['Open Sans Regular'],
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': '#F59E0B',
          'text-halo-color': document.documentElement.getAttribute('data-theme') === 'light' ? '#FFFFFF' : '#0C0F1A',
          'text-halo-width': 1.5,
        },
      });

      // Speed vector lines
      map.addLayer({
        id: 'speed-vectors',
        type: 'line',
        source: 'speed-vector-source',
        minzoom: 7,
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 1,
          'line-opacity': 0.5,
        },
      });

      // Flight trail (solid line showing actual flown path)
      map.addLayer({
        id: 'trail-line',
        type: 'line',
        source: 'trail-source',
        paint: {
          'line-color': '#F59E0B',
          'line-width': 2.5,
          'line-opacity': 0.7,
        },
      });

      // Selected aircraft highlight glow
      map.addLayer({
        id: 'aircraft-highlight',
        type: 'circle',
        source: 'highlight-source',
        paint: {
          'circle-radius': 18,
          'circle-color': '#F59E0B',
          'circle-opacity': 0.25,
          'circle-blur': 0.8,
        },
      });

      // Emergency pulsing glow
      map.addLayer({
        id: 'emergency-glow',
        type: 'circle',
        source: 'aircraft-source',
        filter: ['==', ['get', 'emergency'], 1] as maplibregl.FilterSpecification,
        paint: {
          'circle-radius': 22,
          'circle-color': '#EF4444',
          'circle-opacity': 0.35,
          'circle-blur': 0.7,
        },
      });

      // Remaining route (dashed line showing predicted path to destination)
      map.addLayer({
        id: 'route-line-solid',
        type: 'line',
        source: 'route-source',
        paint: {
          'line-color': '#F59E0B',
          'line-width': 2,
          'line-dasharray': [6, 4],
          'line-opacity': 0.6,
        },
      });

      // Heading projection (dashed amber line)
      map.addLayer({
        id: 'route-line-dashed',
        type: 'line',
        source: 'heading-source',
        paint: {
          'line-color': '#F59E0B',
          'line-width': 1.5,
          'line-dasharray': [4, 4],
          'line-opacity': 0.6,
        },
      });

      // Aircraft icons
      map.addLayer({
        id: 'aircraft-layer',
        type: 'symbol',
        source: 'aircraft-source',
        layout: {
          'icon-image': ICON_NAME,
          'icon-size': [
            'interpolate', ['linear'], ['zoom'],
            2, 0.15,
            4, 0.25,
            6, 0.45,
            10, 0.75,
          ],
          'icon-rotate': ['get', 'heading'],
          'icon-rotation-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
        paint: {
          'icon-color': ['get', 'altitudeColor'],
          'icon-opacity': [
            'case',
            ['==', ['get', 'stale'], 1], 0.3,
            ['==', ['get', 'onGround'], 1], 0.5,
            1,
          ],
        },
      });
    };

    map.on('load', async () => {
      await setupSourcesAndLayers();

      // Hover cursor + tooltip for aircraft
      map.on('mouseenter', 'aircraft-layer', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'aircraft-layer', () => {
        map.getCanvas().style.cursor = '';
        setTooltip(t => ({ ...t, visible: false }));
      });
      map.on('mousemove', 'aircraft-layer', (e) => {
        const feature = e.features?.[0];
        if (!feature || !feature.properties) return;
        const props = feature.properties;
        const alt = props.altitude != null ? Math.round(props.altitude * 3.28084).toLocaleString() : '---';
        const spd = props.velocity != null ? Math.round(props.velocity * 1.94384).toString() : '---';
        setTooltip({
          visible: true,
          callsign: props.callsign || props.icao24,
          altitude: alt,
          speed: spd,
          x: e.point.x,
          y: e.point.y,
        });
      });

      // Airport hover popup
      map.on('mouseenter', 'airport-circles', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'airport-circles', () => {
        map.getCanvas().style.cursor = '';
        setAirportPopup(p => ({ ...p, visible: false }));
      });
      map.on('mousemove', 'airport-circles', (e) => {
        const feature = e.features?.[0];
        if (!feature?.properties) return;
        setAirportPopup({
          visible: true,
          name: feature.properties.name || '',
          icao: feature.properties.icao || '',
          iata: feature.properties.iata || '',
          x: e.point.x,
          y: e.point.y,
        });
      });

      // Click to select aircraft
      map.on('click', 'aircraft-layer', (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const icao = feature.properties?.icao24;
        const flight = flightsRef.current.find(f => f.icao24 === icao);
        if (flight) onSelectFlight(flight);
      });

      // Click empty space to deselect
      map.on('click', (e) => {
        if (!map.getLayer('aircraft-layer')) return;
        const features = map.queryRenderedFeatures(e.point, { layers: ['aircraft-layer'] });
        if (features.length === 0) onSelectFlight(null);
      });

      mapRef.current = map;
      onMapReady(map);
    });

    // Re-create sources and layers after style change (theme toggle)
    let initialStyleDone = false;
    map.on('style.load', async () => {
      if (!initialStyleDone) {
        initialStyleDone = true;
        return;
      }
      await setupSourcesAndLayers();
      // Reload airport data
      import('@/data/airports.json').then(mod => {
        const source = map.getSource('airport-source') as maplibregl.GeoJSONSource | undefined;
        if (source) source.setData(mod.default as GeoJSON.FeatureCollection);
      }).catch(() => {});
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const cleanup = initMap();
    return cleanup;
  }, [initMap]);

  // Animate emergency glow pulse
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let frame: number;
    const pulse = () => {
      frame = requestAnimationFrame(pulse);
      if (!map.getLayer('emergency-glow')) return;
      const t = (Math.sin(Date.now() / 400) + 1) / 2;
      map.setPaintProperty('emergency-glow', 'circle-radius', 16 + t * 12);
      map.setPaintProperty('emergency-glow', 'circle-opacity', 0.2 + t * 0.25);
    };
    frame = requestAnimationFrame(pulse);
    return () => cancelAnimationFrame(frame);
  }, []);

  // Keep trail data in a ref so the animation loop can extend it without re-triggering this effect
  const trailDataRef = useRef(trail);
  trailDataRef.current = trail;

  // Set initial trail on selection or clear on deselect — animation loop handles continuous updates
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const trailSource = map.getSource('trail-source') as maplibregl.GeoJSONSource | undefined;
    if (!trailSource) return;

    if (selectedFlight && trail && trail.length >= 2) {
      trailSource.setData({
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: trail },
          properties: {},
        }],
      });
    } else {
      trailSource.setData({ type: 'FeatureCollection', features: [] });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFlight?.icao24]);

  // Update airport markers when route data changes; clear all visual sources on deselect.
  // Highlight, route line, heading projection, and trail are managed by the animation loop
  // (useInterpolation) to avoid competing writes that cause flickering.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const routeSource = map.getSource('route-source') as maplibregl.GeoJSONSource | undefined;
    const headingSource = map.getSource('heading-source') as maplibregl.GeoJSONSource | undefined;
    const highlightSource = map.getSource('highlight-source') as maplibregl.GeoJSONSource | undefined;
    const routeAirportSource = map.getSource('route-airport-source') as maplibregl.GeoJSONSource | undefined;
    if (!routeSource || !headingSource || !highlightSource || !routeAirportSource) return;
    const emptyFC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

    if (selectedFlight) {
      const hasActualRoute = routeData?.departure && routeData?.destination;

      if (hasActualRoute) {
        const dep = routeData!.departure!;
        const dest = routeData!.destination!;

        // Show departure/destination airport markers (static, not position-dependent)
        routeAirportSource.setData({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [dep.longitude, dep.latitude] },
              properties: { label: dep.iata || dep.icao },
            },
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [dest.longitude, dest.latitude] },
              properties: { label: dest.iata || dest.icao },
            },
          ],
        });
      } else {
        routeAirportSource.setData(emptyFC);
      }
    } else {
      // Deselect: clear all selected-flight visual sources
      routeSource.setData(emptyFC);
      headingSource.setData(emptyFC);
      highlightSource.setData(emptyFC);
      routeAirportSource.setData(emptyFC);
    }
  }, [selectedFlight, routeData]);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="w-full h-full" />
      <AircraftTooltip {...tooltip} />
      <AirportPopup {...airportPopup} />
    </div>
  );
}
