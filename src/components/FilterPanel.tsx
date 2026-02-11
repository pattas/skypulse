'use client';

import { memo } from 'react';
import { SlidersHorizontal, X, RotateCcw } from 'lucide-react';
import type { FilterState } from '@/hooks/useFlightFilters';
import { getAircraftCategory } from '@/lib/aircraft-category';
import { metersPerSecondToKnots, metersToFeet } from '@/lib/units';
import { Z_INDEX } from '@/lib/z-index';

interface FilterPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  onReset: () => void;
  isActive: boolean;
}

const FILTERABLE_CATEGORIES = [2, 3, 4, 6, 8, 9, 14];

const RangeSlider = memo(function RangeSlider({
  label,
  min,
  max,
  step,
  value,
  onChange,
  format,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: [number, number];
  onChange: (v: [number, number]) => void;
  format: (v: number) => string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.1em] text-text-label font-medium">{label}</span>
        <span className="text-[10px] font-mono text-text-secondary">
          {format(value[0])} — {format(value[1])}
        </span>
      </div>
      <div className="flex gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value[0]}
          onChange={e => onChange([Math.min(Number(e.target.value), value[1]), value[1]])}
          className="w-full accent-accent h-1"
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value[1]}
          onChange={e => onChange([value[0], Math.max(Number(e.target.value), value[0])])}
          className="w-full accent-accent h-1"
        />
      </div>
    </div>
  );
});

export default function FilterPanel({ isOpen, onToggle, filters, onChange, onReset, isActive }: FilterPanelProps) {
  return (
    <>
      {/* Toggle button */}
      <button
        type="button"
        onClick={onToggle}
        aria-label={isOpen ? 'Close filters panel' : 'Open filters panel'}
        title="Filter aircraft"
        className={`absolute top-4 left-4 w-9 h-9 flex items-center justify-center bg-bg-secondary/90 border backdrop-blur-sm transition-colors ${
          isActive ? 'border-accent/50 text-accent' : 'border-border-subtle text-text-label hover:text-text-primary'
        }`}
        style={{ zIndex: Z_INDEX.control }}
      >
        <SlidersHorizontal size={16} />
      </button>

      {/* Panel */}
      <div
        className={`absolute top-0 left-0 h-full w-72 transition-all duration-300 ease-out ${
          isOpen ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0 pointer-events-none'
        }`}
        style={{ zIndex: Z_INDEX.panel }}
      >
        <div className="h-full backdrop-blur-xl bg-bg-secondary/80 border-r border-border-subtle overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-4 pt-5 pb-3">
            <div className="flex items-center gap-2">
              <SlidersHorizontal size={14} className="text-accent" />
              <span className="text-sm font-medium text-text-primary tracking-wide">Filters</span>
            </div>
            <div className="flex items-center gap-1">
              {isActive && (
                <button
                  type="button"
                  onClick={onReset}
                  aria-label="Reset filters"
                  className="p-1.5 text-text-label hover:text-accent transition-colors"
                  title="Reset filters"
                >
                  <RotateCcw size={14} />
                </button>
              )}
              <button
                type="button"
                onClick={onToggle}
                aria-label="Close filters panel"
                className="p-1.5 text-text-label hover:text-text-primary transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="px-4 pb-5 space-y-5">
            {/* Altitude range */}
            <RangeSlider
              label="Altitude"
              min={0}
              max={15000}
              step={500}
              value={filters.altitudeRange}
              onChange={v => onChange({ ...filters, altitudeRange: v })}
              format={v => `${(metersToFeet(v) / 1000).toFixed(0)}k ft`}
            />

            {/* Speed range */}
            <RangeSlider
              label="Speed"
              min={0}
              max={400}
              step={10}
              value={filters.speedRange}
              onChange={v => onChange({ ...filters, speedRange: v })}
              format={v => `${Math.round(metersPerSecondToKnots(v))} kts`}
            />

            {/* Airborne/Ground toggle */}
            <div>
              <span className="text-[10px] uppercase tracking-[0.1em] text-text-label font-medium block mb-2">Status</span>
              <div className="flex gap-1">
                {(['all', 'airborne', 'ground'] as const).map(opt => (
                  <button
                    type="button"
                    key={opt}
                    onClick={() => onChange({ ...filters, onGround: opt })}
                    className={`px-2.5 py-1 text-[10px] uppercase tracking-wider font-medium transition-colors ${
                      filters.onGround === opt
                        ? 'bg-accent/15 text-accent border border-accent/30'
                        : 'bg-bg-tertiary/30 text-text-label border border-border-subtle hover:text-text-secondary'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            {/* Category checkboxes */}
            <div>
              <span className="text-[10px] uppercase tracking-[0.1em] text-text-label font-medium block mb-2">Aircraft Type</span>
              <div className="space-y-1">
                {FILTERABLE_CATEGORIES.map(cat => {
                  const info = getAircraftCategory(cat);
                  const checked = filters.categories.includes(cat);
                  return (
                    <label key={cat} className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const next = checked
                            ? filters.categories.filter(c => c !== cat)
                            : [...filters.categories, cat];
                          onChange({ ...filters, categories: next });
                        }}
                        className="accent-accent w-3 h-3"
                      />
                      <span className="text-xs text-text-secondary group-hover:text-text-primary transition-colors">
                        {info.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
