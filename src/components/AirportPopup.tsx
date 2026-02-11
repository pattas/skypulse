'use client';

interface AirportPopupProps {
  name: string;
  icao: string;
  iata: string;
  x: number;
  y: number;
  visible: boolean;
}

export default function AirportPopup({ name, icao, iata, x, y, visible }: AirportPopupProps) {
  if (!visible) return null;

  return (
    <div
      className="absolute z-30 pointer-events-none"
      style={{ left: x, top: y, transform: 'translate(-50%, -130%)' }}
    >
      <div className="bg-bg-secondary/95 border border-border-subtle backdrop-blur-sm px-2.5 py-1.5 whitespace-nowrap">
        <div className="text-xs text-text-primary font-medium">{name}</div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] font-mono text-accent">{icao}</span>
          {iata && <span className="text-[10px] font-mono text-text-label">{iata}</span>}
        </div>
      </div>
    </div>
  );
}
