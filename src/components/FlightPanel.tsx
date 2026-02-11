'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { X, Plane, ArrowUp, ArrowDown, Minus, AlertTriangle, Share2, Clock } from 'lucide-react';
import type { Flight, FlightRoute } from '@/lib/types';
import { getSquawkAlert } from '@/lib/squawk';
import { getAircraftCategory } from '@/lib/aircraft-category';
import { getPositionSource } from '@/lib/position-source';
import { haversineDistance } from '@/lib/geo';
import {
  metersPerSecondToFeetPerMinute,
  metersPerSecondToKnots,
  metersToFeet as metersToFeetValue,
} from '@/lib/units';
import { Z_INDEX } from '@/lib/z-index';

interface FlightPanelProps {
  flight: Flight | null;
  onClose: () => void;
  routeData?: FlightRoute | null;
  routeLoading?: boolean;
}

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function formatMetersToFeet(m: number | null): string {
  if (m === null) return '---';
  return Math.round(metersToFeetValue(m)).toLocaleString();
}

function msToKnots(ms: number | null): string {
  if (ms === null) return '---';
  return Math.round(metersPerSecondToKnots(ms)).toString();
}

function fpmFromMs(ms: number | null): string {
  if (ms === null) return '---';
  return Math.round(metersPerSecondToFeetPerMinute(ms)).toLocaleString();
}

function formatStaleness(lastContact: number): { text: string; stale: boolean } {
  const age = Math.round(Date.now() / 1000 - lastContact);
  if (age < 10) return { text: 'Live', stale: false };
  if (age < 60) return { text: `${age}s ago`, stale: false };
  if (age < 3600) return { text: `${Math.round(age / 60)}m ago`, stale: true };
  return { text: 'Stale', stale: true };
}

function DataRow({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="flex items-baseline justify-between py-2 border-b border-border-subtle">
      <span className="text-[10px] uppercase tracking-[0.1em] text-text-label font-medium">{label}</span>
      <div className="flex items-baseline gap-1">
        <span className="font-mono text-sm text-text-primary tabular-nums">{value}</span>
        {unit && <span className="text-[10px] text-text-label">{unit}</span>}
      </div>
    </div>
  );
}

function RouteSection({ flight, routeData, routeLoading }: { flight: Flight; routeData?: FlightRoute | null; routeLoading?: boolean }) {
  if (routeLoading) {
    return (
      <div className="mx-5 mb-4 px-3 py-3 bg-bg-tertiary/30 border border-border-subtle">
        <div className="flex items-center justify-center gap-2">
          <div className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse" />
          <span className="text-[10px] uppercase tracking-wider text-text-label">Loading route...</span>
        </div>
      </div>
    );
  }

  if (!routeData || (!routeData.departure && !routeData.destination)) {
    return null;
  }

  const depCode = routeData.departure?.iata || routeData.departure?.icao || '???';
  const destCode = routeData.destination?.iata || routeData.destination?.icao || '???';
  const depName = routeData.departure?.name || 'Unknown';
  const destName = routeData.destination?.name || 'Unknown';

  // Calculate progress (% of total distance flown)
  let progress: number | null = null;
  if (routeData.departure && routeData.destination && routeData.distanceKm) {
    const distFromDep = haversineDistance(
      routeData.departure.latitude, routeData.departure.longitude,
      flight.latitude, flight.longitude,
    );
    progress = Math.min(100, Math.max(0, Math.round((distFromDep / routeData.distanceKm) * 100)));
  }

  return (
    <div className="mx-5 mb-4 px-3 py-3 bg-bg-tertiary/30 border border-border-subtle">
      {/* Route display */}
      <div className="flex items-center justify-between gap-2">
        <div className="text-center min-w-0">
          <div className="font-mono text-sm font-medium text-text-primary">{depCode}</div>
          <div className="text-[9px] text-text-label truncate mt-0.5">{depName}</div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 px-2">
          <div className="w-1.5 h-1.5 rounded-full bg-accent" />
          <div className="w-12 h-px bg-accent/40 relative">
            {progress !== null && (
              <Plane size={10} className="text-accent absolute -top-[5px]" style={{ left: `${progress}%`, transform: 'translateX(-50%)' }} />
            )}
          </div>
          <div className="w-1.5 h-1.5 rounded-full bg-accent/50" />
        </div>

        <div className="text-center min-w-0">
          <div className="font-mono text-sm font-medium text-text-primary">{destCode}</div>
          <div className="text-[9px] text-text-label truncate mt-0.5">{destName}</div>
        </div>
      </div>

      {/* Distance + progress */}
      {routeData.distanceKm && (
        <div className="mt-2 flex items-center justify-between">
          {progress !== null && (
            <div className="flex-1 mr-3">
              <div className="h-1 bg-bg-tertiary rounded-full overflow-hidden">
                <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
          <span className="text-[10px] text-text-label font-mono tabular-nums shrink-0">
            {routeData.distanceKm.toLocaleString()} km
          </span>
        </div>
      )}
    </div>
  );
}

export default function FlightPanel({ flight, onClose, routeData, routeLoading }: FlightPanelProps) {
  const isOpen = flight !== null;
  const touchStartRef = useRef<number>(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const headingId = useId();
  const statusId = useId();
  const squawkAlert = flight ? getSquawkAlert(flight.squawk) : null;
  const category = flight ? getAircraftCategory(flight.category) : null;
  const posSource = flight ? getPositionSource(flight.positionSource) : null;
  const freshness = flight ? formatStaleness(flight.lastContact) : null;

  useEffect(() => {
    if (!shareStatus) return;

    const timer = setTimeout(() => {
      setShareStatus(null);
    }, 2500);

    return () => clearTimeout(timer);
  }, [shareStatus]);

  useEffect(() => {
    if (!isOpen) return;

    const panel = panelRef.current;
    if (!panel) return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    const firstTarget = focusables[0] ?? panel;
    firstTarget.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (items.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    panel.addEventListener('keydown', onKeyDown);
    return () => {
      panel.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) return;

    const previousFocus = previousFocusRef.current;
    if (previousFocus) {
      previousFocus.focus();
      previousFocusRef.current = null;
    }
  }, [isOpen]);

  const vertIcon = flight?.verticalRate
    ? flight.verticalRate > 0.5
      ? <ArrowUp size={12} className="text-success" />
      : flight.verticalRate < -0.5
        ? <ArrowDown size={12} className="text-error" />
        : <Minus size={12} className="text-text-label" />
    : null;

  const handleShare = async () => {
    if (!flight) return;

    const params = new URLSearchParams({
      lng: flight.longitude.toFixed(4),
      lat: flight.latitude.toFixed(4),
      z: '8',
      icao: flight.icao24,
    });
    const url = `${window.location.origin}${window.location.pathname}?${params}`;

    if (!navigator.clipboard?.writeText) {
      setShareStatus('Clipboard unavailable');
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      setShareStatus('Link copied');
    } catch {
      setShareStatus('Copy failed');
    }
  };

  return (
    <div
      className={`absolute top-0 right-0 h-full w-80 max-md:w-full transition-all duration-300 ease-out ${
        isOpen ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0 pointer-events-none'
      }`}
      style={{ zIndex: Z_INDEX.panel }}
      onTouchStart={e => { touchStartRef.current = e.touches[0].clientX; }}
      onTouchEnd={e => {
        const dx = e.changedTouches[0].clientX - touchStartRef.current;
        if (dx > 80) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-hidden={!isOpen}
        aria-labelledby={headingId}
        className="h-full backdrop-blur-xl bg-bg-secondary/80 border-l border-border-subtle overflow-y-auto"
        tabIndex={-1}
      >
        <p id={statusId} aria-live="polite" className="sr-only">{shareStatus ?? ''}</p>
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2.5">
            <Plane size={16} className="text-accent" />
            <div>
              <h2 id={headingId} className="font-mono text-lg text-text-primary tracking-wide">
                {flight?.callsign || '---'}
              </h2>
              <p className="text-[10px] uppercase tracking-[0.12em] text-text-label mt-0.5">
                {flight?.icao24}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {shareStatus && (
              <span className="text-[10px] uppercase tracking-wider text-text-label">{shareStatus}</span>
            )}
            {flight && (
              <button
                type="button"
                onClick={handleShare}
                aria-label="Copy flight link"
                title="Copy link"
                className="p-1.5 text-text-label hover:text-accent transition-colors"
              >
                <Share2 size={14} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close flight details"
              className="p-1.5 text-text-label hover:text-text-primary transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Emergency alert */}
        {squawkAlert && (
          <div className="mx-5 mb-3 px-3 py-2 bg-error/15 border border-error/30 flex items-center gap-2">
            <AlertTriangle size={14} className="text-error shrink-0" />
            <div>
              <span className="text-xs font-medium text-error uppercase tracking-wider">
                {squawkAlert.label}
              </span>
              <span className="text-[10px] text-error/70 ml-2">Squawk {squawkAlert.code}</span>
            </div>
          </div>
        )}

        {/* Status + Category + Source badges */}
        {flight && (
          <div className="px-5 pb-4 flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] uppercase tracking-wider font-medium ${
              flight.onGround
                ? 'bg-text-label/10 text-text-label'
                : 'bg-success/10 text-success'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${flight.onGround ? 'bg-text-label' : 'bg-success'}`} />
              {flight.onGround ? 'Ground' : 'Airborne'}
            </span>
            {category && category.label !== 'No Info' && category.label !== 'No Category' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase tracking-wider font-medium bg-accent/10 text-accent">
                <span className="font-mono">{category.icon}</span>
                {category.label}
              </span>
            )}
            {posSource && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase tracking-wider font-medium"
                style={{ backgroundColor: `${posSource.color}15`, color: posSource.color }}
              >
                {posSource.label}
              </span>
            )}
            {freshness && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase tracking-wider font-medium ${
                freshness.stale ? 'bg-error/10 text-error' : 'bg-bg-tertiary/30 text-text-label'
              }`}>
                <Clock size={10} />
                {freshness.text}
              </span>
            )}
          </div>
        )}

        {/* Route info */}
        {flight && (
          <RouteSection flight={flight} routeData={routeData} routeLoading={routeLoading} />
        )}

        {/* Data */}
        {flight && (
          <div className="px-5 pb-5">
            <DataRow label="Country" value={flight.country} />
            <DataRow label="Baro Altitude" value={formatMetersToFeet(flight.baroAltitude)} unit="ft" />
            <DataRow label="Geo Altitude" value={formatMetersToFeet(flight.geoAltitude)} unit="ft" />
            <DataRow label="Ground Speed" value={msToKnots(flight.velocity)} unit="kts" />
            <DataRow label="Heading" value={flight.heading !== null ? Math.round(flight.heading).toString() + '\u00B0' : '---'} />
            <div className="flex items-baseline justify-between py-2 border-b border-border-subtle">
              <span className="text-[10px] uppercase tracking-[0.1em] text-text-label font-medium">Vertical Rate</span>
              <div className="flex items-center gap-1.5">
                {vertIcon}
                <span className="font-mono text-sm text-text-primary tabular-nums">{fpmFromMs(flight.verticalRate)}</span>
                <span className="text-[10px] text-text-label">fpm</span>
              </div>
            </div>
            <DataRow label="Squawk" value={flight.squawk || '---'} />
            <DataRow
              label="Position"
              value={`${flight.latitude.toFixed(4)}, ${flight.longitude.toFixed(4)}`}
            />
          </div>
        )}
      </div>
    </div>
  );
}
