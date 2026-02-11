import { ROUTE_PROJECTION_KM, ROUTE_POINTS } from './constants';

const EARTH_RADIUS = 6371;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLng = (lng2 - lng1) * DEG_TO_RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function greatCircleArc(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
  points: number = 64,
): [number, number][] {
  const φ1 = lat1 * DEG_TO_RAD;
  const λ1 = lng1 * DEG_TO_RAD;
  const φ2 = lat2 * DEG_TO_RAD;
  const λ2 = lng2 * DEG_TO_RAD;
  const d = 2 * Math.asin(
    Math.sqrt(
      Math.sin((φ2 - φ1) / 2) ** 2 +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2,
    ),
  );

  if (d < 1e-10) return [[lng1, lat1], [lng2, lat2]];

  const coords: [number, number][] = [];
  for (let i = 0; i <= points; i++) {
    const f = i / points;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);
    const lat = Math.atan2(z, Math.sqrt(x * x + y * y)) * RAD_TO_DEG;
    const lng = Math.atan2(y, x) * RAD_TO_DEG;
    coords.push([lng, lat]);
  }
  return coords;
}

export function projectRoute(
  lat: number,
  lng: number,
  headingDeg: number,
  distanceKm: number = ROUTE_PROJECTION_KM,
  points: number = ROUTE_POINTS,
): [number, number][] {
  const coords: [number, number][] = [[lng, lat]];
  const bearing = headingDeg * DEG_TO_RAD;
  const lat1 = lat * DEG_TO_RAD;
  const lng1 = lng * DEG_TO_RAD;

  for (let i = 1; i <= points; i++) {
    const d = (distanceKm * (i / points)) / EARTH_RADIUS;

    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(d) +
      Math.cos(lat1) * Math.sin(d) * Math.cos(bearing),
    );
    const lng2 = lng1 + Math.atan2(
      Math.sin(bearing) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    );

    coords.push([lng2 * RAD_TO_DEG, lat2 * RAD_TO_DEG]);
  }

  return coords;
}
