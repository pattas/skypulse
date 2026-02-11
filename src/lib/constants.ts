export const OPENSKY_API_URL = 'https://opensky-network.org/api/states/all';
export const POLL_INTERVAL = 5_000;
export const CACHE_TTL = 5_000;
export const INTERPOLATION_FPS = 30;
export const FRAME_INTERVAL = 1000 / INTERPOLATION_FPS;
export const TELEPORT_THRESHOLD = 2; // degrees
export const ROUTE_PROJECTION_KM = 500;
export const ROUTE_POINTS = 20;
export const SEARCH_MAX_RESULTS = 8;
export const DEBOUNCE_BOUNDS_MS = 300;

export const MAP_CENTER = { lng: 15, lat: 50 };
export const MAP_ZOOM = 5;
export const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

export const COLORS = {
  bgPrimary: '#0C0F1A',
  bgSecondary: '#111527',
  bgTertiary: '#1A1F35',
  accent: '#F59E0B',
  textPrimary: '#E8E9ED',
  textSecondary: '#8B8FA3',
  textLabel: '#6B7094',
  border: 'rgba(255,255,255,0.06)',
  success: '#10B981',
  error: '#EF4444',
} as const;

export const ALTITUDE_STOPS: [number, string][] = [
  [0, '#6B7094'],       // ground - gray
  [2000, '#06B6D4'],    // cyan
  [5000, '#10B981'],    // emerald
  [8000, '#F59E0B'],    // amber
  [11000, '#F97316'],   // orange
  [13000, '#EF4444'],   // red
];
