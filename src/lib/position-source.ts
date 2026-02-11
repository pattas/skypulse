export interface PositionSourceInfo {
  label: string;
  quality: 'high' | 'medium' | 'low';
  color: string;
}

const SOURCES: Record<number, PositionSourceInfo> = {
  0: { label: 'ADS-B', quality: 'high', color: '#10B981' },
  1: { label: 'ASTERIX', quality: 'medium', color: '#F59E0B' },
  2: { label: 'MLAT', quality: 'medium', color: '#F59E0B' },
  3: { label: 'FLARM', quality: 'low', color: '#F97316' },
};

export function getPositionSource(code: number): PositionSourceInfo {
  return SOURCES[code] ?? SOURCES[0];
}
