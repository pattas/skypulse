export const METERS_TO_FEET = 3.28084;
export const METERS_PER_SECOND_TO_KNOTS = 1.94384;
export const METERS_PER_SECOND_TO_FEET_PER_MINUTE = 196.850394;

export function metersToFeet(valueMeters: number): number {
  return valueMeters * METERS_TO_FEET;
}

export function metersPerSecondToKnots(valueMetersPerSecond: number): number {
  return valueMetersPerSecond * METERS_PER_SECOND_TO_KNOTS;
}

export function metersPerSecondToFeetPerMinute(valueMetersPerSecond: number): number {
  return valueMetersPerSecond * METERS_PER_SECOND_TO_FEET_PER_MINUTE;
}
