export interface SquawkAlert {
  code: string;
  label: string;
  severity: 'hijack' | 'radio' | 'emergency';
}

const EMERGENCY_SQUAWKS: Record<string, SquawkAlert> = {
  '7500': { code: '7500', label: 'Hijack', severity: 'hijack' },
  '7600': { code: '7600', label: 'Radio Failure', severity: 'radio' },
  '7700': { code: '7700', label: 'Emergency', severity: 'emergency' },
};

export function getSquawkAlert(squawk: string | null): SquawkAlert | null {
  if (!squawk) return null;
  return EMERGENCY_SQUAWKS[squawk] ?? null;
}

export function isEmergencySquawk(squawk: string | null): boolean {
  return getSquawkAlert(squawk) !== null;
}
