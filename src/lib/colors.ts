import { ALTITUDE_STOPS } from './constants';

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function lerpColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(
    Math.round(ar + (br - ar) * t),
    Math.round(ag + (bg - ag) * t),
    Math.round(ab + (bb - ab) * t),
  );
}

export function getAltitudeColor(altitudeMeters: number | null): string {
  if (altitudeMeters === null || altitudeMeters <= 0) return ALTITUDE_STOPS[0][1];

  for (let i = 1; i < ALTITUDE_STOPS.length; i++) {
    if (altitudeMeters <= ALTITUDE_STOPS[i][0]) {
      const [prevAlt, prevColor] = ALTITUDE_STOPS[i - 1];
      const [currAlt, currColor] = ALTITUDE_STOPS[i];
      const t = (altitudeMeters - prevAlt) / (currAlt - prevAlt);
      return lerpColor(prevColor, currColor, t);
    }
  }

  return ALTITUDE_STOPS[ALTITUDE_STOPS.length - 1][1];
}
