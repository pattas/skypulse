export interface Flight {
  icao24: string;
  callsign: string;
  country: string;
  longitude: number;
  latitude: number;
  altitude: number | null;
  heading: number | null;
  velocity: number | null;
  verticalRate: number | null;
  onGround: boolean;
  squawk: string | null;
  baroAltitude: number | null;
  geoAltitude: number | null;
  lastContact: number;
  lastPositionUpdate: number | null;
  category: number;
  positionSource: number;
}

export interface BoundingBox {
  lamin: number;
  lomin: number;
  lamax: number;
  lomax: number;
}

export interface FlightDataState {
  current: Flight[];
  previous: Flight[];
  lastUpdate: number;
  error: string | null;
  isLoading: boolean;
}

export interface FlightsResponse {
  flights: Flight[];
  timestamp: number;
  count: number;
  error?: string;
  rateLimited?: boolean;
  retryAfterSeconds?: number;
}

export interface AirportInfo {
  icao: string;
  iata: string;
  name: string;
  latitude: number;
  longitude: number;
}

export interface FlightRoute {
  callsign: string;
  departure: AirportInfo | null;
  destination: AirportInfo | null;
  operatorIata: string | null;
  flightNumber: string | null;
  routeIcaoCodes: string[];
  distanceKm: number | null;
}
