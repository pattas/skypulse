export interface AircraftCategory {
  label: string;
  icon: string;
}

// OpenSky category codes: https://openskynetwork.github.io/opensky-api/rest.html
const CATEGORIES: Record<number, AircraftCategory> = {
  0:  { label: 'No Info', icon: '?' },
  1:  { label: 'No Category', icon: '?' },
  2:  { label: 'Light', icon: 'L' },
  3:  { label: 'Small', icon: 'S' },
  4:  { label: 'Large', icon: 'L' },
  5:  { label: 'High Vortex', icon: 'V' },
  6:  { label: 'Heavy', icon: 'H' },
  7:  { label: 'High Perf', icon: 'P' },
  8:  { label: 'Rotorcraft', icon: 'R' },
  9:  { label: 'Glider', icon: 'G' },
  10: { label: 'Lighter-than-air', icon: 'B' },
  11: { label: 'Parachutist', icon: 'J' },
  12: { label: 'Ultralight', icon: 'U' },
  13: { label: 'Reserved', icon: '?' },
  14: { label: 'UAV', icon: 'D' },
  15: { label: 'Space Vehicle', icon: 'X' },
  16: { label: 'Emergency', icon: 'E' },
  17: { label: 'Service', icon: 'S' },
  18: { label: 'Point Obstacle', icon: 'O' },
  19: { label: 'Cluster Obstacle', icon: 'C' },
  20: { label: 'Line Obstacle', icon: 'O' },
};

export function getAircraftCategory(code: number): AircraftCategory {
  return CATEGORIES[code] ?? CATEGORIES[0];
}
