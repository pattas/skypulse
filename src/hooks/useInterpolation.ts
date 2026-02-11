'use client';

import { useEffect, useRef } from 'react';
import type { Map as MaplibreMap, GeoJSONSource } from 'maplibre-gl';
import type { Flight } from '@/lib/types';
import { getAltitudeColor } from '@/lib/colors';
import { isEmergencySquawk } from '@/lib/squawk';
import { FRAME_INTERVAL } from '@/lib/constants';
import { greatCircleArc, projectRoute } from '@/lib/geo';

const MAX_EXTRAPOLATE_SEC = 6;

interface InterpolationInput {
  current: Flight[];
  previous: Flight[];
  lastUpdate: number;
  mapRef: React.RefObject<MaplibreMap | null>;
  selectedIcao: string | null;
  trailRef: React.RefObject<[number, number][] | undefined>;
  routeDestRef: React.RefObject<{ lat: number; lng: number } | null>;
}

// Convert velocity (m/s) + heading (deg) to lat/lng displacement per second
function velocityToDegreesPerSec(velocity: number, heading: number, latDeg: number) {
  const hdgRad = (heading * Math.PI) / 180;
  const cosLat = Math.cos((latDeg * Math.PI) / 180) || 0.01;
  return {
    dLat: (velocity * Math.cos(hdgRad)) / 111_320,
    dLng: (velocity * Math.sin(hdgRad)) / (111_320 * cosLat),
  };
}

export function useInterpolation({ current, previous, lastUpdate, mapRef, selectedIcao, trailRef, routeDestRef }: InterpolationInput) {
  const rafRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);
  const currentRef = useRef(current);
  const previousRef = useRef(previous);
  const lastUpdateRef = useRef(lastUpdate);
  const selectedRef = useRef(selectedIcao);

  useEffect(() => {
    currentRef.current = current;
    previousRef.current = previous;
    lastUpdateRef.current = lastUpdate;
    selectedRef.current = selectedIcao;
  }, [current, previous, lastUpdate, selectedIcao]);

  useEffect(() => {
    const animate = (timestamp: number) => {
      rafRef.current = requestAnimationFrame(animate);

      if (timestamp - lastFrameRef.current < FRAME_INTERVAL) return;
      lastFrameRef.current = timestamp;

      const map = mapRef.current;
      if (!map) return;

      const source = map.getSource('aircraft-source') as GeoJSONSource | undefined;
      if (!source) return;

      const curr = currentRef.current;
      const lu = lastUpdateRef.current;

      if (curr.length === 0) return;

      const nowMs = Date.now();
      const nowSec = nowMs / 1000;

      const features = curr.map(flight => {
        let lat = flight.latitude;
        let lng = flight.longitude;
        const heading = flight.heading ?? 0;
        let altitude = flight.altitude;

        // Per-flight elapsed time using transponder timestamp when available
        const posAge = flight.lastPositionUpdate
          ? Math.min(nowSec - flight.lastPositionUpdate, MAX_EXTRAPOLATE_SEC)
          : Math.min((nowMs - lu) / 1000, MAX_EXTRAPOLATE_SEC);

        // Dead-reckon: project position forward using velocity + heading
        if (flight.velocity && flight.velocity > 0 && flight.heading !== null && !flight.onGround) {
          const { dLat, dLng } = velocityToDegreesPerSec(flight.velocity, heading, lat);
          lat += dLat * posAge;
          lng += dLng * posAge;

          // Altitude projection using vertical rate
          if (flight.verticalRate && altitude !== null) {
            altitude += flight.verticalRate * posAge;
            if (altitude < 0) altitude = 0;
          }
        }

        return {
          type: 'Feature' as const,
          geometry: {
            type: 'Point' as const,
            coordinates: [lng, lat],
          },
          properties: {
            icao24: flight.icao24,
            callsign: flight.callsign,
            heading,
            altitude: altitude ?? 0,
            velocity: flight.velocity ?? 0,
            altitudeColor: getAltitudeColor(altitude),
            selected: flight.icao24 === selectedRef.current ? 1 : 0,
            onGround: flight.onGround ? 1 : 0,
            emergency: isEmergencySquawk(flight.squawk) ? 1 : 0,
            stale: (Date.now() / 1000 - flight.lastContact) > 60 ? 1 : 0,
          },
        };
      });

      source.setData({
        type: 'FeatureCollection',
        features,
      });

      // Sync selected flight visual elements with interpolated position
      if (selectedRef.current) {
        const selFeature = features.find(f => f.properties.icao24 === selectedRef.current);
        if (selFeature) {
          const [iLng, iLat] = selFeature.geometry.coordinates;

          // Highlight glow → interpolated position
          const hl = map.getSource('highlight-source') as GeoJSONSource | undefined;
          if (hl) {
            hl.setData({ type: 'FeatureCollection', features: [{
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [iLng, iLat] },
              properties: {},
            }] });
          }

          // Trail → extend to interpolated position
          const trail = trailRef.current;
          const trailSrc = map.getSource('trail-source') as GeoJSONSource | undefined;
          if (trailSrc && trail && trail.length >= 2) {
            trailSrc.setData({ type: 'FeatureCollection', features: [{
              type: 'Feature',
              geometry: { type: 'LineString', coordinates: [...trail, [iLng, iLat]] },
              properties: {},
            }] });
          }

          // Route → recompute from interpolated position to destination
          const dest = routeDestRef.current;
          const routeSrc = map.getSource('route-source') as GeoJSONSource | undefined;
          const headingSrc = map.getSource('heading-source') as GeoJSONSource | undefined;
          const emptyFC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

          if (dest && routeSrc) {
            const arc = greatCircleArc(iLat as number, iLng as number, dest.lat, dest.lng);
            routeSrc.setData({ type: 'FeatureCollection', features: [{
              type: 'Feature',
              geometry: { type: 'LineString', coordinates: arc },
              properties: {},
            }] });
            // Clear heading projection when route is active
            if (headingSrc) headingSrc.setData(emptyFC);
          } else if (!dest && headingSrc && selFeature.properties.heading) {
            // No route data — show heading projection
            const headingCoords = projectRoute(iLat as number, iLng as number, selFeature.properties.heading);
            headingSrc.setData({ type: 'FeatureCollection', features: [{
              type: 'Feature',
              geometry: { type: 'LineString', coordinates: headingCoords },
              properties: {},
            }] });
            // Clear route source
            if (routeSrc) routeSrc.setData(emptyFC);
          } else {
            if (routeSrc) routeSrc.setData(emptyFC);
            if (headingSrc) headingSrc.setData(emptyFC);
          }
        }
      }

      // Speed vectors
      const vecSource = map.getSource('speed-vector-source') as GeoJSONSource | undefined;
      if (vecSource && map.getZoom() >= 7) {
        const vectors = features
          .filter(f => !f.properties.onGround && f.properties.velocity > 10)
          .map(f => {
            const hdg = (f.properties.heading * Math.PI) / 180;
            const spd = f.properties.velocity;
            const [fLng, fLat] = f.geometry.coordinates;
            const scale = spd * 0.0002;
            const endLng = fLng + Math.sin(hdg) * scale;
            const endLat = fLat + Math.cos(hdg) * scale;
            return {
              type: 'Feature' as const,
              geometry: {
                type: 'LineString' as const,
                coordinates: [[fLng, fLat], [endLng, endLat]],
              },
              properties: { color: f.properties.altitudeColor },
            };
          });
        vecSource.setData({ type: 'FeatureCollection', features: vectors });
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [mapRef, routeDestRef, trailRef]);
}
