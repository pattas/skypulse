import type { Flight } from './types';
import { getArray, getNumber, isRecord } from './runtime';

export interface OpenSkyStatesPayload {
  timeSeconds: number | null;
  states: unknown[][];
}

function getNullableNumberFromState(state: unknown[], index: number): number | null {
  const value = state[index];
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

function getStringFromState(state: unknown[], index: number): string | null {
  const value = state[index];
  return typeof value === 'string' ? value : null;
}

function getBooleanFromState(state: unknown[], index: number): boolean | null {
  const value = state[index];
  return typeof value === 'boolean' ? value : null;
}

function getIntegerFromState(state: unknown[], index: number, fallback: number): number {
  const value = getNullableNumberFromState(state, index);
  if (value === null) return fallback;
  return Math.trunc(value);
}

export function parseOpenSkyStatesPayload(value: unknown): OpenSkyStatesPayload | null {
  if (!isRecord(value)) return null;

  const rawStates = getArray(value, 'states');
  if (!rawStates) return null;

  const states: unknown[][] = [];
  for (const item of rawStates) {
    if (Array.isArray(item)) {
      states.push(item);
    }
  }

  const timeSeconds = getNumber(value, 'time');

  return {
    timeSeconds: timeSeconds ?? null,
    states,
  };
}

export function transformOpenSkyStateToFlight(state: unknown[]): Flight | null {
  const icao24 = getStringFromState(state, 0)?.trim().toLowerCase();
  if (!icao24) return null;

  const longitude = getNullableNumberFromState(state, 5);
  const latitude = getNullableNumberFromState(state, 6);
  if (longitude === null || latitude === null) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;

  const baroAltitude = getNullableNumberFromState(state, 7);
  const geoAltitude = getNullableNumberFromState(state, 13);
  const altitude = baroAltitude ?? geoAltitude;

  const headingRaw = getNullableNumberFromState(state, 10);
  const heading = headingRaw === null ? null : ((headingRaw % 360) + 360) % 360;

  const velocity = getNullableNumberFromState(state, 9);
  const verticalRate = getNullableNumberFromState(state, 11);
  const onGround = getBooleanFromState(state, 8) ?? false;
  const squawk = getStringFromState(state, 14);
  const lastContact = getIntegerFromState(state, 4, 0);
  if (lastContact <= 0) return null;

  return {
    icao24,
    callsign: getStringFromState(state, 1)?.trim() ?? '',
    country: getStringFromState(state, 2) ?? '',
    longitude,
    latitude,
    altitude,
    heading,
    velocity,
    verticalRate,
    onGround,
    squawk: squawk && squawk.trim() ? squawk.trim() : null,
    baroAltitude,
    geoAltitude,
    lastContact,
    lastPositionUpdate: getNullableNumberFromState(state, 3),
    category: getIntegerFromState(state, 17, 0),
    positionSource: getIntegerFromState(state, 16, 0),
  };
}
