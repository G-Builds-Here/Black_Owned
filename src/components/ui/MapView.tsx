'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface MapPin {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

interface MapViewProps {
  pins: MapPin[];
}

const OCHRE = '#CC7722';

/**
 * MapView - Leaflet map of business pins over OpenStreetMap tiles.
 *
 * Pins are circle markers (no icon-asset wiring). The view fits the visible
 * pins; businesses without coordinates are excluded from the map but still
 * appear in the list.
 */
export function MapView({ pins }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, { zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);

    const handleResize = () => map.invalidateSize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    const points: L.LatLngExpression[] = [];
    for (const pin of pins) {
      points.push([pin.lat, pin.lng]);
      L.circleMarker([pin.lat, pin.lng], {
        radius: 8,
        color: OCHRE,
        weight: 2,
        fillColor: OCHRE,
        fillOpacity: 0.85,
      })
        .bindPopup(
          `<div style="min-width:180px"><strong>${pin.name.replace(/</g, '&lt;')}</strong><br /><a href="/business/${pin.id}">View details</a></div>`
        )
        .addTo(layer);
    }

    if (points.length >= 2) {
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
    } else if (points.length === 1) {
      map.setView(points[0], 13);
    } else {
      map.setView([39.8283, -98.5795], 4);
    }
  }, [pins]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      role="application"
      aria-label="Map of business locations"
    />
  );
}

export default MapView;
