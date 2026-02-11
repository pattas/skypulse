'use client';

interface AircraftTooltipProps {
  callsign: string;
  altitude: string;
  speed: string;
  x: number;
  y: number;
  visible: boolean;
}

export default function AircraftTooltip({ callsign, altitude, speed, x, y, visible }: AircraftTooltipProps) {
  if (!visible) return null;

  return (
    <div
      className="absolute z-30 pointer-events-none"
      style={{ left: x, top: y, transform: 'translate(-50%, -120%)' }}
    >
      <div className="bg-bg-secondary/95 border border-border-subtle backdrop-blur-sm px-2.5 py-1.5 whitespace-nowrap">
        <div className="font-mono text-xs text-text-primary tracking-wide">{callsign}</div>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-[10px] text-text-label">{altitude} ft</span>
          <span className="text-[10px] text-text-label">{speed} kts</span>
        </div>
      </div>
    </div>
  );
}
