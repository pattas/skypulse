import maplibregl, { type Map } from 'maplibre-gl';
import { registerAircraftIcon, ICON_NAME } from '@/lib/aircraft-icon';

export async function setupMapSourcesAndLayers(map: Map): Promise<void> {
  await registerAircraftIcon(map);

  map.addSource('aircraft-source', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

  map.addSource('route-source', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

  map.addSource('highlight-source', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

  map.addSource('trail-source', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

  map.addSource('airport-source', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

  map.addSource('heading-source', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

  map.addSource('route-airport-source', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

  map.addSource('speed-vector-source', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

  map.addLayer({
    id: 'airport-circles',
    type: 'circle',
    source: 'airport-source',
    minzoom: 6,
    paint: {
      'circle-radius': 4,
      'circle-color': '#6B7094',
      'circle-opacity': 0.6,
      'circle-stroke-width': 1,
      'circle-stroke-color': '#6B7094',
      'circle-stroke-opacity': 0.3,
    },
  });

  map.addLayer({
    id: 'airport-labels',
    type: 'symbol',
    source: 'airport-source',
    minzoom: 7,
    layout: {
      'text-field': ['get', 'iata'],
      'text-size': 10,
      'text-offset': [0, 1.2],
      'text-font': ['Open Sans Regular'],
      'text-allow-overlap': false,
    },
    paint: {
      'text-color': '#6B7094',
      'text-halo-color': document.documentElement.getAttribute('data-theme') === 'light' ? '#FFFFFF' : '#0C0F1A',
      'text-halo-width': 1,
    },
  });

  map.addLayer({
    id: 'route-airport-markers',
    type: 'circle',
    source: 'route-airport-source',
    paint: {
      'circle-radius': 6,
      'circle-color': '#F59E0B',
      'circle-opacity': 0.8,
      'circle-stroke-width': 2,
      'circle-stroke-color': '#F59E0B',
      'circle-stroke-opacity': 0.3,
    },
  });

  map.addLayer({
    id: 'route-airport-labels',
    type: 'symbol',
    source: 'route-airport-source',
    layout: {
      'text-field': ['get', 'label'],
      'text-size': 12,
      'text-offset': [0, 1.5],
      'text-font': ['Open Sans Regular'],
      'text-allow-overlap': true,
    },
    paint: {
      'text-color': '#F59E0B',
      'text-halo-color': document.documentElement.getAttribute('data-theme') === 'light' ? '#FFFFFF' : '#0C0F1A',
      'text-halo-width': 1.5,
    },
  });

  map.addLayer({
    id: 'speed-vectors',
    type: 'line',
    source: 'speed-vector-source',
    minzoom: 7,
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 1,
      'line-opacity': 0.5,
    },
  });

  map.addLayer({
    id: 'trail-line',
    type: 'line',
    source: 'trail-source',
    paint: {
      'line-color': '#F59E0B',
      'line-width': 2.5,
      'line-opacity': 0.7,
    },
  });

  map.addLayer({
    id: 'aircraft-highlight',
    type: 'circle',
    source: 'highlight-source',
    paint: {
      'circle-radius': 18,
      'circle-color': '#F59E0B',
      'circle-opacity': 0.25,
      'circle-blur': 0.8,
    },
  });

  map.addLayer({
    id: 'emergency-glow',
    type: 'circle',
    source: 'aircraft-source',
    filter: ['==', ['get', 'emergency'], 1] as maplibregl.FilterSpecification,
    paint: {
      'circle-radius': 22,
      'circle-color': '#EF4444',
      'circle-opacity': 0.35,
      'circle-blur': 0.7,
    },
  });

  map.addLayer({
    id: 'route-line-solid',
    type: 'line',
    source: 'route-source',
    paint: {
      'line-color': '#F59E0B',
      'line-width': 2,
      'line-dasharray': [6, 4],
      'line-opacity': 0.6,
    },
  });

  map.addLayer({
    id: 'route-line-dashed',
    type: 'line',
    source: 'heading-source',
    paint: {
      'line-color': '#F59E0B',
      'line-width': 1.5,
      'line-dasharray': [4, 4],
      'line-opacity': 0.6,
    },
  });

  map.addLayer({
    id: 'aircraft-layer',
    type: 'symbol',
    source: 'aircraft-source',
    layout: {
      'icon-image': ICON_NAME,
      'icon-size': [
        'interpolate', ['linear'], ['zoom'],
        2, 0.15,
        4, 0.25,
        6, 0.45,
        10, 0.75,
      ],
      'icon-rotate': ['get', 'heading'],
      'icon-rotation-alignment': 'map',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
    paint: {
      'icon-color': ['get', 'altitudeColor'],
      'icon-opacity': [
        'case',
        ['==', ['get', 'stale'], 1], 0.3,
        ['==', ['get', 'onGround'], 1], 0.5,
        1,
      ],
    },
  });
}
