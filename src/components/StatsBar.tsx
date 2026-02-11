'use client';

import { useEffect, useState } from 'react';
import type { Flight } from '@/lib/types';

interface StatsBarProps {
  flights: Flight[];
  lastUpdate: number;
  error: string | null;
  isLoading: boolean;
}

export default function StatsBar({ flights, lastUpdate, error, isLoading }: StatsBarProps) {
  const [ago, setAgo] = useState(0);

  useEffect(() => {
    if (!lastUpdate) return;
    const tick = () => setAgo(Math.floor((Date.now() - lastUpdate) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lastUpdate]);

  const airborne = flights.filter(f => !f.onGround).length;
  const ground = flights.filter(f => f.onGround).length;
  const total = flights.length;

  return (
    <div className="absolute top-4 left-14 z-10 flex items-center gap-3 bg-bg-secondary/90 border border-border-subtle px-4 py-2.5 backdrop-blur-sm max-md:left-14 max-md:gap-2 max-md:px-2.5 max-md:py-2">
      <div className="flex items-center gap-2">
        <span
          className={`w-2 h-2 rounded-full ${
            error && total === 0 ? 'bg-accent animate-pulse' : error ? 'bg-accent animate-pulse' : isLoading ? 'bg-accent animate-pulse' : 'bg-success animate-pulse'
          }`}
        />
        <span className="text-xs uppercase tracking-wider text-text-label font-medium">
          {error && total === 0 ? 'Connecting' : error ? 'Retrying' : isLoading ? 'Scanning' : 'Live'}
        </span>
      </div>

      {total > 0 && (
        <>
          <div className="w-px h-4 bg-border-subtle" />
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-sm text-text-primary tabular-nums">{total}</span>
              <span className="text-[10px] uppercase tracking-wider text-text-label">aircraft</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-xs text-text-secondary tabular-nums">{airborne}</span>
              <span className="text-[10px] uppercase tracking-wider text-text-label">air</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-xs text-text-secondary tabular-nums">{ground}</span>
              <span className="text-[10px] uppercase tracking-wider text-text-label">gnd</span>
            </div>
          </div>
        </>
      )}

      {lastUpdate > 0 && (
        <>
          <div className="w-px h-4 bg-border-subtle" />
          <span className="text-[10px] text-text-label tabular-nums font-mono">
            {ago}s ago
          </span>
        </>
      )}
    </div>
  );
}
