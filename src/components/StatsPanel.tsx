'use client';

import { useState } from 'react';
import { BarChart3, X, ChevronUp } from 'lucide-react';
import type { Flight } from '@/lib/types';

interface StatsPanelProps {
  flights: Flight[];
}

function metersToFeet(m: number | null): string {
  if (m === null) return '---';
  return Math.round(m * 3.28084).toLocaleString();
}

function msToKnots(ms: number | null): string {
  if (ms === null) return '---';
  return Math.round(ms * 1.94384).toString();
}

export default function StatsPanel({ flights }: StatsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (flights.length === 0) return null;

  const airborne = flights.filter(f => !f.onGround);

  const highest = airborne.length > 0
    ? airborne.reduce((a, b) => ((a.baroAltitude ?? 0) > (b.baroAltitude ?? 0) ? a : b))
    : null;

  const fastest = airborne.length > 0
    ? airborne.reduce((a, b) => ((a.velocity ?? 0) > (b.velocity ?? 0) ? a : b))
    : null;

  const climbingMost = airborne.length > 0
    ? airborne.reduce((a, b) => ((a.verticalRate ?? 0) > (b.verticalRate ?? 0) ? a : b))
    : null;

  const countries = new Set(flights.map(f => f.country)).size;

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        title="Flight statistics"
        className="absolute bottom-8 left-4 z-10 w-9 h-9 flex items-center justify-center bg-bg-secondary/90 border border-border-subtle backdrop-blur-sm text-text-label hover:text-text-primary transition-colors"
      >
        <BarChart3 size={16} />
      </button>

      {isOpen && (
        <div className="absolute bottom-8 left-4 z-20 w-64 bg-bg-secondary/95 border border-border-subtle backdrop-blur-xl">
          <div className="flex items-center justify-between px-3 pt-3 pb-2">
            <div className="flex items-center gap-2">
              <BarChart3 size={12} className="text-accent" />
              <span className="text-xs font-medium text-text-primary uppercase tracking-wider">Superlatives</span>
            </div>
            <button onClick={() => setIsOpen(false)} className="p-1 text-text-label hover:text-text-primary">
              <X size={12} />
            </button>
          </div>

          <div className="px-3 pb-3 space-y-2">
            {highest && (
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-text-label block">Highest</span>
                  <span className="font-mono text-xs text-text-primary">{highest.callsign || highest.icao24}</span>
                </div>
                <div className="flex items-center gap-1">
                  <ChevronUp size={10} className="text-accent" />
                  <span className="font-mono text-xs text-accent tabular-nums">{metersToFeet(highest.baroAltitude)} ft</span>
                </div>
              </div>
            )}

            {fastest && (
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-text-label block">Fastest</span>
                  <span className="font-mono text-xs text-text-primary">{fastest.callsign || fastest.icao24}</span>
                </div>
                <span className="font-mono text-xs text-accent tabular-nums">{msToKnots(fastest.velocity)} kts</span>
              </div>
            )}

            {climbingMost && (climbingMost.verticalRate ?? 0) > 1 && (
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-text-label block">Climbing</span>
                  <span className="font-mono text-xs text-text-primary">{climbingMost.callsign || climbingMost.icao24}</span>
                </div>
                <span className="font-mono text-xs text-accent tabular-nums">{Math.round((climbingMost.verticalRate ?? 0) * 196.85)} fpm</span>
              </div>
            )}

            <div className="pt-1 border-t border-border-subtle flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-text-label">Countries</span>
              <span className="font-mono text-xs text-text-primary tabular-nums">{countries}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
