'use client';

import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import type { LatLngBoundsExpression, LatLngTuple } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { filterValidPoints, findNearestPoint, type RoutePoint } from './activity-route-hover';

// Phase 4 (docs/roadmap/health-detailed-activities.md): renders the
// activity's GPS route. Uses CircleMarker (vector-drawn) instead of
// Leaflet's default icon Marker for start/finish/hover points, which
// avoids the well-known bundler asset-path breakage with Leaflet's default
// marker icon images — no icon configuration needed.

export type { RoutePoint };
export { findNearestPoint };

export interface RouteBounds {
  minLat: number | null;
  maxLat: number | null;
  minLon: number | null;
  maxLon: number | null;
}

interface Props {
  coordinates: RoutePoint[];
  bounds?: RouteBounds | null;
  hoveredSampleIndex?: number | null;
}

function FitToBounds({ positions, bounds }: { positions: LatLngTuple[]; bounds?: RouteBounds | null }) {
  const map = useMap();

  useEffect(() => {
    const box: LatLngBoundsExpression | null =
      bounds && bounds.minLat != null && bounds.maxLat != null && bounds.minLon != null && bounds.maxLon != null
        ? [[bounds.minLat, bounds.minLon], [bounds.maxLat, bounds.maxLon]]
        : positions.length > 1
          ? positions
          : null;
    if (box) map.fitBounds(box, { padding: [24, 24] });
  }, [map, bounds, positions]);

  return null;
}

export default function ActivityRouteMap({ coordinates, bounds, hoveredSampleIndex }: Props) {
  const validCoordinates = useMemo(() => filterValidPoints(coordinates), [coordinates]);
  const positions = useMemo<LatLngTuple[]>(
    () => validCoordinates.map((c) => [c.latitude, c.longitude]),
    [validCoordinates],
  );

  if (positions.length === 0) return null;

  const hovered = findNearestPoint(validCoordinates, hoveredSampleIndex);

  return (
    <MapContainer
      center={positions[0]}
      zoom={14}
      style={{ height: '100%', width: '100%' }}
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitToBounds positions={positions} bounds={bounds} />
      <Polyline positions={positions} pathOptions={{ color: '#3b82f6', weight: 4 }} />
      <CircleMarker center={positions[0]} radius={7} pathOptions={{ color: '#16a34a', fillColor: '#22c55e', fillOpacity: 1, weight: 2 }}>
        <Tooltip>Start</Tooltip>
      </CircleMarker>
      <CircleMarker center={positions[positions.length - 1]} radius={7} pathOptions={{ color: '#b91c1c', fillColor: '#ef4444', fillOpacity: 1, weight: 2 }}>
        <Tooltip>Finish</Tooltip>
      </CircleMarker>
      {hovered && (
        <CircleMarker
          center={[hovered.latitude, hovered.longitude]}
          radius={9}
          pathOptions={{ color: '#b45309', fillColor: '#f59e0b', fillOpacity: 0.9, weight: 2 }}
        />
      )}
    </MapContainer>
  );
}
