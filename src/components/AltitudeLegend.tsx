'use client';

import { ALTITUDE_STOPS } from '@/lib/constants';

const labels = [
  { alt: 0, label: 'GND' },
  { alt: 2000, label: '6.5k' },
  { alt: 5000, label: '16k' },
  { alt: 8000, label: '26k' },
  { alt: 11000, label: '36k' },
  { alt: 13000, label: '43k' },
];

export default function AltitudeLegend() {
  const gradientStops = ALTITUDE_STOPS.map(([alt, color]) => {
    const pct = (alt / 13000) * 100;
    return `${color} ${pct}%`;
  }).join(', ');

  return (
    <div className="absolute bottom-8 left-4 z-10 flex items-end gap-2">
      <div
        className="w-1.5 h-28 rounded-sm"
        style={{
          background: `linear-gradient(to top, ${gradientStops})`,
        }}
      />
      <div className="flex flex-col-reverse justify-between h-28">
        {labels.map(({ label }, i) => (
          <span
            key={i}
            className="text-[9px] font-mono text-text-label leading-none tabular-nums"
          >
            {label}
          </span>
        ))}
      </div>
      <span className="text-[8px] uppercase tracking-wider text-text-label/50 rotate-[-90deg] origin-bottom-left translate-x-1 -translate-y-1">
        ft
      </span>
    </div>
  );
}
