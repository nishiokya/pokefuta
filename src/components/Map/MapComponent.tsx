'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Manhole } from '@/types/database';

// Fix for default markers in Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface MapComponentProps {
  center: { lat: number; lng: number };
  manholes: Manhole[];
  onManholeClick: (manhole: Manhole) => void;
  userLocation?: { lat: number; lng: number } | null;
  zoom?: number;
}

export default function MapComponent({
  center,
  manholes,
  onManholeClick,
  userLocation,
  zoom
}: MapComponentProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    // Initialize map
    const map = L.map(mapRef.current, {
      center: [center.lat, center.lng],
      zoom: parseInt(process.env.NEXT_PUBLIC_MAP_DEFAULT_ZOOM || '10'),
      zoomControl: true,
      attributionControl: true,
    });

    mapInstanceRef.current = map;

    // Add tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Create markers layer
    const markersLayer = L.layerGroup().addTo(map);
    markersLayerRef.current = markersLayer;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update map center and zoom when props change
  useEffect(() => {
    if (mapInstanceRef.current) {
      const currentZoom = zoom || mapInstanceRef.current.getZoom();
      mapInstanceRef.current.setView([center.lat, center.lng], currentZoom, {
        animate: true,
        duration: 0.5
      });
    }
  }, [center, zoom]);

  // Update user location marker
  useEffect(() => {
    if (!mapInstanceRef.current || !userLocation) return;

    const userIcon = L.divIcon({
      className: 'user-location-marker',
      html: `
        <div style="
          width: 20px;
          height: 20px;
          background: linear-gradient(45deg, #ff6b6b, #4ecdc4);
          border: 3px solid white;
          border-radius: 50%;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        "></div>
      `,
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });

    const userMarker = L.marker([userLocation.lat, userLocation.lng], {
      icon: userIcon,
      zIndexOffset: 1000
    }).addTo(mapInstanceRef.current);

    return () => {
      userMarker.remove();
    };
  }, [userLocation]);

  // Update manhole markers
  useEffect(() => {
    if (!markersLayerRef.current) return;

    // Clear existing markers
    markersLayerRef.current.clearLayers();

    console.log(`MapComponent: Rendering ${manholes.length} manholes`);

    // Add manhole markers
    manholes.forEach((manhole) => {
      if (!manhole) {
        console.log('MapComponent: Skipping null/undefined manhole');
        return; // Skip null/undefined manholes
      }
      console.log(`MapComponent: Processing manhole ${manhole.id}, lat=${manhole.latitude}, lng=${manhole.longitude}`);
      if (manhole.latitude && manhole.longitude) {
        try {
          const isVisited = manhole.is_visited;

          // Create custom icon based on visit status
          const markerIcon = L.divIcon({
            className: `manhole-marker ${isVisited ? 'marker-visited' : 'marker-unvisited'}`,
            html: `
              <div style="
                width: 24px;
                height: 24px;
                background: ${isVisited ? '#4ecdc4' : '#ff6b6b'};
                border: 3px solid white;
                border-radius: 50%;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                opacity: ${isVisited ? '1' : '0.7'};
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
                color: white;
                font-weight: bold;
              ">
                ${isVisited ? '✓' : '?'}
              </div>
            `,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
          });

          const marker = L.marker([manhole.latitude, manhole.longitude], {
            icon: markerIcon
          });

        // Add popup
        const pokemonInfo = manhole.pokemons && manhole.pokemons.length > 0
          ? `<div class="mb-2">
               <div class="text-xs font-semibold mb-1">ポケモン:</div>
               <div class="flex flex-wrap gap-1">
                 ${manhole.pokemons.slice(0, 3).map(pokemon =>
                   `<span class="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">${pokemon}</span>`
                 ).join('')}
                 ${manhole.pokemons.length > 3 ? `<span class="text-xs text-gray-500">+${manhole.pokemons.length - 3}</span>` : ''}
               </div>
             </div>`
          : '';

        const popupContent = `
          <div class="p-3 min-w-64">
            <h3 class="font-bold text-base mb-2 text-blue-800">${manhole.name || manhole.title || 'ポケふた'}</h3>
            ${manhole.description ? `<p class="text-sm text-gray-600 mb-3">${manhole.description}</p>` : ''}
            <div class="text-sm space-y-2">
              <div class="flex items-center">
                <svg class="w-4 h-4 mr-2 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"></path>
                </svg>
                <span>${manhole.prefecture || ''} ${manhole.city || manhole.municipality || ''}</span>
              </div>
              ${manhole.address ? `
                <div class="text-xs text-gray-500 ml-6">${manhole.address}</div>
              ` : ''}
              ${pokemonInfo}
              <div class="flex items-center justify-between pt-3 border-t">
                <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${isVisited ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}">
                  ${isVisited ? '✓ 訪問済み' : '? 未訪問'}
                </span>
                <button
                  onclick="window.location.href='/manhole/${manhole.id}'"
                  class="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 transition-colors"
                >
                  詳細を見る
                </button>
              </div>
            </div>
          </div>
        `;

        marker.bindPopup(popupContent, {
          maxWidth: 300,
          className: 'pokemon-popup',
          closeButton: true,
          autoClose: false,
          closeOnEscapeKey: true
        });

          // Add click handler
          marker.on('click', () => {
            onManholeClick(manhole);
          });

          markersLayerRef.current?.addLayer(marker);
          console.log(`MapComponent: Successfully added marker for manhole ${manhole.id}`);
        } catch (error) {
          console.error(`MapComponent: Error creating marker for manhole ${manhole.id}:`, error);
        }
      } else {
        console.log(`MapComponent: Skipping manhole ${manhole.id} - missing coordinates (lat=${manhole.latitude}, lng=${manhole.longitude})`);
      }
    });
  }, [manholes, onManholeClick]);

  return (
    <div
      ref={mapRef}
      className="map-container w-full h-full"
      style={{ minHeight: '400px' }}
    />
  );
}