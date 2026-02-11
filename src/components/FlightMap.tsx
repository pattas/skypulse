'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import maplibregl, { type Map } from 'maplibre-gl';
import { MAP_CENTER, MAP_DARK_STYLE, MAP_LIGHT_STYLE, MAP_ZOOM } from '@/lib/constants';
import type { Flight, FlightRoute } from '@/lib/types';
import { metersPerSecondToKnots, metersToFeet } from '@/lib/units';
import AircraftTooltip from './AircraftTooltip';
import AirportPopup from './AirportPopup';
import { setupMapSourcesAndLayers } from './map/setupMapSourcesAndLayers';

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
      style: document.documentElement.getAttribute('data-theme') === 'light' ? MAP_LIGHT_STYLE : MAP_DARK_STYLE,
      center: [MAP_CENTER.lng, MAP_CENTER.lat],
      zoom: MAP_ZOOM,
      attributionControl: {},
      maxZoom: 14,
      minZoom: 2,
    });

    const handleAircraftMouseEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };

    const handleAircraftMouseLeave = () => {
      map.getCanvas().style.cursor = '';
      setTooltip(t => ({ ...t, visible: false }));
    };

    const handleAircraftMouseMove = (e: maplibregl.MapLayerMouseEvent) => {
      const feature = e.features?.[0];
      if (!feature || !feature.properties) return;

      const props = feature.properties;
      const alt = props.altitude != null ? Math.round(metersToFeet(props.altitude)).toLocaleString() : '---';
      const spd = props.velocity != null ? Math.round(metersPerSecondToKnots(props.velocity)).toString() : '---';
      setTooltip({
        visible: true,
        callsign: props.callsign || props.icao24,
        altitude: alt,
        speed: spd,
        x: e.point.x,
        y: e.point.y,
      });
    };

    const handleAirportMouseEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };

    const handleAirportMouseLeave = () => {
      map.getCanvas().style.cursor = '';
      setAirportPopup(p => ({ ...p, visible: false }));
    };

    const handleAirportMouseMove = (e: maplibregl.MapLayerMouseEvent) => {
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
    };

    const handleAircraftClick = (e: maplibregl.MapLayerMouseEvent) => {
      const feature = e.features?.[0];
      if (!feature) return;

      const icao = feature.properties?.icao24;
      const flight = flightsRef.current.find(f => f.icao24 === icao);
      if (flight) onSelectFlight(flight);
    };

    const handleMapClick = (e: maplibregl.MapMouseEvent) => {
      if (!map.getLayer('aircraft-layer')) return;
      const features = map.queryRenderedFeatures(e.point, { layers: ['aircraft-layer'] });
      if (features.length === 0) onSelectFlight(null);
    };

    const handleLoad = async () => {
      await setupMapSourcesAndLayers(map);

      map.on('mouseenter', 'aircraft-layer', handleAircraftMouseEnter);
      map.on('mouseleave', 'aircraft-layer', handleAircraftMouseLeave);
      map.on('mousemove', 'aircraft-layer', handleAircraftMouseMove);
      map.on('mouseenter', 'airport-circles', handleAirportMouseEnter);
      map.on('mouseleave', 'airport-circles', handleAirportMouseLeave);
      map.on('mousemove', 'airport-circles', handleAirportMouseMove);
      map.on('click', 'aircraft-layer', handleAircraftClick);
      map.on('click', handleMapClick);

      mapRef.current = map;
      onMapReady(map);
    };

    let initialStyleDone = false;
    const handleStyleLoad = async () => {
      if (!initialStyleDone) {
        initialStyleDone = true;
        return;
      }

      await setupMapSourcesAndLayers(map);
      import('@/data/airports.json').then(mod => {
        const source = map.getSource('airport-source') as maplibregl.GeoJSONSource | undefined;
        if (source) source.setData(mod.default as GeoJSON.FeatureCollection);
      }).catch(() => {});
    };

    map.on('load', handleLoad);
    map.on('style.load', handleStyleLoad);

    return () => {
      map.off('load', handleLoad);
      map.off('style.load', handleStyleLoad);
      map.off('mouseenter', 'aircraft-layer', handleAircraftMouseEnter);
      map.off('mouseleave', 'aircraft-layer', handleAircraftMouseLeave);
      map.off('mousemove', 'aircraft-layer', handleAircraftMouseMove);
      map.off('mouseenter', 'airport-circles', handleAirportMouseEnter);
      map.off('mouseleave', 'airport-circles', handleAirportMouseLeave);
      map.off('mousemove', 'airport-circles', handleAirportMouseMove);
      map.off('click', 'aircraft-layer', handleAircraftClick);
      map.off('click', handleMapClick);
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
