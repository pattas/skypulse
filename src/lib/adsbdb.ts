import type { AirportInfo } from './types';
import { getNumber, getRecord, getString, isRecord } from './runtime';

export interface ParsedAdsbdbRoute {
  departure: AirportInfo | null;
  destination: AirportInfo | null;
  operatorIata: string | null;
  flightNumber: string | null;
}

function parseAirport(rawAirport: unknown): AirportInfo | null {
  if (!isRecord(rawAirport)) return null;

  const icao = getString(rawAirport, 'icao_code')?.trim().toUpperCase();
  const latitude = getNumber(rawAirport, 'latitude');
  const longitude = getNumber(rawAirport, 'longitude');
  if (!icao || latitude === null || longitude === null) return null;

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;

  return {
    icao,
    iata: getString(rawAirport, 'iata_code')?.trim().toUpperCase() ?? '',
    name: getString(rawAirport, 'name')?.trim() ?? '',
    latitude,
    longitude,
  };
}

export function parseAdsbdbRouteResponse(value: unknown): ParsedAdsbdbRoute | null {
  if (!isRecord(value)) return null;

  const response = getRecord(value, 'response');
  if (!response) return null;

  const flightRoute = getRecord(response, 'flightroute');
  if (!flightRoute) return null;

  const airline = getRecord(flightRoute, 'airline');
  const callsignIata = getString(flightRoute, 'callsign_iata')?.trim().toUpperCase() ?? null;

  const operatorIata = getString(airline ?? {}, 'iata')?.trim().toUpperCase() ?? (callsignIata ? callsignIata.slice(0, 2) : null);

  return {
    departure: parseAirport(flightRoute.origin),
    destination: parseAirport(flightRoute.destination),
    operatorIata,
    flightNumber: callsignIata,
  };
}
