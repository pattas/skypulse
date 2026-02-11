'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Search } from 'lucide-react';
import type { Flight } from '@/lib/types';
import { SEARCH_MAX_RESULTS } from '@/lib/constants';
import { getAircraftCategory } from '@/lib/aircraft-category';

interface SearchBarProps {
  flights: Flight[];
  onSelect: (flight: Flight) => void;
}

type MatchType = 'callsign' | 'icao24' | 'country' | 'category';

interface SearchResult {
  flight: Flight;
  matchType: MatchType;
}

function matchFlight(f: Flight, q: string): MatchType | null {
  const lower = q.toLowerCase();
  if (f.callsign.toLowerCase().includes(lower)) return 'callsign';
  if (f.icao24.toLowerCase().includes(lower)) return 'icao24';
  if (f.country.toLowerCase().includes(lower)) return 'country';
  const cat = getAircraftCategory(f.category);
  if (cat.label.toLowerCase().includes(lower)) return 'category';
  return null;
}

const MATCH_BADGES: Record<MatchType, { label: string; color: string }> = {
  callsign: { label: 'CS', color: 'text-text-label' },
  icao24: { label: 'HEX', color: 'text-accent' },
  country: { label: 'CTY', color: 'text-success' },
  category: { label: 'CAT', color: 'text-[#06B6D4]' },
};

export default function SearchBar({ flights, onSelect }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const results: SearchResult[] = useMemo(() => {
    if (query.length < 2) return [];
    const matches: SearchResult[] = [];
    for (const f of flights) {
      if (matches.length >= SEARCH_MAX_RESULTS) break;
      const matchType = matchFlight(f, query);
      if (matchType) matches.push({ flight: f, matchType });
    }
    return matches;
  }, [query, flights]);

  const handleSelect = useCallback((flight: Flight) => {
    onSelect(flight);
    setQuery('');
    setIsOpen(false);
    setHighlightedIndex(-1);
    inputRef.current?.blur();
  }, [onSelect]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(i => (i + 1) % results.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(i => (i <= 0 ? results.length - 1 : i - 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < results.length) {
          handleSelect(results[highlightedIndex].flight);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setHighlightedIndex(-1);
        inputRef.current?.blur();
        break;
    }
  }, [isOpen, results, highlightedIndex, handleSelect]);

  // Reset highlight when results change
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [query]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={containerRef} className="absolute top-4 right-4 z-10 w-72">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-label" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search callsign, hex, country..."
          className="w-full bg-bg-secondary/90 border border-border-subtle pl-9 pr-3 py-2 text-sm text-text-primary placeholder:text-text-label/50 font-mono outline-none focus:border-accent/30 backdrop-blur-sm"
        />
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-bg-secondary/95 border border-border-subtle backdrop-blur-sm overflow-hidden">
          {results.map(({ flight, matchType }, index) => {
            const badge = MATCH_BADGES[matchType];
            return (
              <button
                key={flight.icao24}
                onClick={() => handleSelect(flight)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={`w-full flex items-center justify-between px-3 py-2 transition-colors text-left ${
                  index === highlightedIndex ? 'bg-bg-tertiary/50' : 'hover:bg-bg-tertiary/30'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`text-[9px] uppercase tracking-wider font-medium w-6 shrink-0 ${badge.color}`}>
                    {badge.label}
                  </span>
                  <span className="font-mono text-sm text-text-primary truncate">{flight.callsign || flight.icao24}</span>
                </div>
                <span className="text-[10px] uppercase tracking-wider text-text-label shrink-0 ml-2">{flight.country}</span>
              </button>
            );
          })}
        </div>
      )}

      {isOpen && query.length >= 2 && results.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-bg-secondary/95 border border-border-subtle backdrop-blur-sm px-3 py-2">
          <span className="text-xs text-text-label">No flights found</span>
        </div>
      )}
    </div>
  );
}
