import type { AirportInfo } from './types';
import airportsGeoJson from '@/data/airports.json';

let index: Map<string, AirportInfo> | null = null;

function buildIndex(): Map<string, AirportInfo> {
  const map = new Map<string, AirportInfo>();
  const fc = airportsGeoJson as GeoJSON.FeatureCollection;

  for (const feature of fc.features) {
    const props = feature.properties;
    if (!props?.icao) continue;
    const [lng, lat] = (feature.geometry as GeoJSON.Point).coordinates;
    map.set(props.icao, {
      icao: props.icao,
      iata: props.iata || '',
      name: props.name || '',
      latitude: lat,
      longitude: lng,
    });
  }
  return map;
}

export function getAirportByIcao(icao: string): AirportInfo | null {
  if (!index) index = buildIndex();
  return index.get(icao) ?? null;
}
