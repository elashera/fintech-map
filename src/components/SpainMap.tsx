import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { MapContainer, TileLayer, GeoJSON, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import type { Layer, LeafletMouseEvent } from "leaflet";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { SPAIN_PROVINCES_GEOJSON_URL } from "@/lib/provinces";
import type { ProfileWithProvince } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import "leaflet/dist/leaflet.css";

interface SpainMapProps {
  selectedProvince: string | null;
  onProvinceSelect: (provinceName: string) => void;
  profiles: ProfileWithProvince[];
  dialogOpen?: boolean;
}

// X / Twitter dark palette
const DEFAULT_STYLE = {
  fillColor: "#2f3336",
  weight: 1,
  opacity: 1,
  color: "#536471",
  fillOpacity: 0.7,
};

const HOVER_STYLE = {
  fillColor: "#1d9bf0",
  fillOpacity: 0.45,
  weight: 2,
  color: "#1d9bf0",
};

const SELECTED_STYLE = {
  fillColor: "#1d9bf0",
  fillOpacity: 0.75,
  weight: 2.5,
  color: "#8ecdf7",
};

const OCCUPIED_STYLE = {
  fillColor: "#00ba7c",
  fillOpacity: 0.4,
  weight: 1,
  opacity: 1,
  color: "#00ba7c",
};

type IslandAnchor = {
  name: string;
  lat: number;
  lng: number;
};

type HoveredFeature = {
  label: string;
  province: string;
};

const ISLAND_SPLIT_ANCHORS: Record<string, IslandAnchor[]> = {
  "Illes Balears": [
    { name: "Mallorca", lat: 39.6, lng: 2.9 },
    { name: "Menorca", lat: 39.95, lng: 4.1 },
    { name: "Ibiza", lat: 38.98, lng: 1.43 },
    { name: "Formentera", lat: 38.7, lng: 1.45 },
  ],
  "Las Palmas": [
    { name: "Lanzarote", lat: 29.03, lng: -13.63 },
    { name: "Fuerteventura", lat: 28.36, lng: -14.05 },
    { name: "Gran Canaria", lat: 27.95, lng: -15.6 },
  ],
  "Santa Cruz De Tenerife": [
    { name: "Tenerife", lat: 28.29, lng: -16.62 },
    { name: "La Palma", lat: 28.69, lng: -17.86 },
    { name: "La Gomera", lat: 28.11, lng: -17.23 },
    { name: "El Hierro", lat: 27.73, lng: -18.03 },
  ],
};

/** Compute the centroid of a GeoJSON feature's bounding box */
function featureCentroid(feature: Feature<Geometry>): [number, number] {
  const layer = L.geoJSON(feature);
  const bounds = layer.getBounds();
  const center = bounds.getCenter();
  return [center.lat, center.lng];
}

/** Approximate relative area using bounding box span */
function featureAreaScore(feature: Feature<Geometry>): number {
  const layer = L.geoJSON(feature);
  const bounds = layer.getBounds();
  return (
    Math.abs(bounds.getNorth() - bounds.getSouth()) *
    Math.abs(bounds.getEast() - bounds.getWest())
  );
}

function getRawProvinceName(feature: Feature<Geometry>): string {
  return (
    getStringProperty(feature, "name") ??
    getStringProperty(feature, "NAME") ??
    getStringProperty(feature, "provincia") ??
    "Desconocida"
  );
}

function getProvinceName(feature: Feature<Geometry>): string {
  return getStringProperty(feature, "mapProvinceName") ?? getRawProvinceName(feature);
}

function getFeatureLabel(feature: Feature<Geometry>): string {
  return getStringProperty(feature, "mapDisplayName") ?? getRawProvinceName(feature);
}

function getStringProperty(feature: Feature<Geometry>, key: string): string | null {
  const value = feature.properties?.[key];
  return typeof value === "string" ? value : null;
}

function nearestAnchor(
  lat: number,
  lng: number,
  anchors: IslandAnchor[],
): IslandAnchor {
  let best = anchors[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const anchor of anchors) {
    const latDiff = anchor.lat - lat;
    const lngDiff = anchor.lng - lng;
    const distance = latDiff * latDiff + lngDiff * lngDiff;
    if (distance < bestDistance) {
      best = anchor;
      bestDistance = distance;
    }
  }
  return best;
}

function polygonCentroid(polygon: number[][][]): [number, number] {
  const ring = polygon[0] ?? [];
  if (ring.length === 0) return [0, 0];

  let lngSum = 0;
  let latSum = 0;
  for (const coord of ring) {
    lngSum += coord[0] ?? 0;
    latSum += coord[1] ?? 0;
  }
  return [latSum / ring.length, lngSum / ring.length];
}

function splitIslandFeature(feature: Feature<Geometry>): Feature<Geometry>[] {
  const provinceName = getRawProvinceName(feature);
  const anchors = ISLAND_SPLIT_ANCHORS[provinceName];
  if (!anchors || feature.geometry.type !== "MultiPolygon") {
    return [feature];
  }

  const groups = new Map<string, number[][][][]>();
  anchors.forEach((anchor) => groups.set(anchor.name, []));

  for (const polygon of feature.geometry.coordinates as number[][][][]) {
    const [lat, lng] = polygonCentroid(polygon);
    const anchor = nearestAnchor(lat, lng, anchors);
    groups.get(anchor.name)?.push(polygon);
  }

  const splitFeatures: Feature<Geometry>[] = [];
  for (const anchor of anchors) {
    const coordinates = groups.get(anchor.name);
    if (!coordinates || coordinates.length === 0) continue;

    splitFeatures.push({
      ...feature,
      properties: {
        ...(feature.properties ?? {}),
        mapProvinceName: provinceName,
        mapDisplayName: anchor.name,
      },
      geometry: {
        type: "MultiPolygon",
        coordinates,
      },
    });
  }

  return splitFeatures.length > 0 ? splitFeatures : [feature];
}

function splitArchipelagos(data: FeatureCollection): FeatureCollection {
  return {
    ...data,
    features: data.features.flatMap(splitIslandFeature),
  };
}

/** Escape HTML special chars to prevent XSS */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Create a Leaflet DivIcon with a circular avatar image */
function createAvatarIcon(
  avatarUrl: string | null,
  name: string,
  size = 28,
): L.DivIcon {
  const safeName = escapeHtml(name || "?");
  const initial = safeName.charAt(0).toUpperCase();
  const html = avatarUrl
    ? `<img src="${escapeHtml(avatarUrl)}" alt="${safeName}" class="avatar-marker" style="width:${size}px;height:${size}px;" />`
    : `<div class="avatar-marker avatar-fallback" style="width:${size}px;height:${size}px;font-size:${size * 0.4}px;">${initial}</div>`;

  return L.divIcon({
    html,
    className: "avatar-marker-container",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export function SpainMap({
  selectedProvince,
  onProvinceSelect,
  profiles,
  dialogOpen = false,
}: SpainMapProps) {
  const [geoData, setGeoData] = useState<FeatureCollection | null>(null);
  const [hovered, setHovered] = useState<HoveredFeature | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Track the previously hovered layer to reset it if mouseout didn't fire
  const prevHoveredRef = useRef<{ layer: Layer; province: string } | null>(null);

  /** Map province name → profiles in that province */
  const profilesByProvince = useMemo(() => {
    const map = new Map<string, ProfileWithProvince[]>();
    for (const p of profiles) {
      const provName = p.provincias?.nombre;
      if (!provName) continue;
      const arr = map.get(provName) ?? [];
      arr.push(p);
      map.set(provName, arr);
    }
    return map;
  }, [profiles]);

  /** Set of province names that have at least 1 user */
  const occupiedProvinces = useMemo(
    () => new Set(profilesByProvince.keys()),
    [profilesByProvince],
  );

  /** Compute centroids from GeoJSON features for placing avatar markers */
  const provinceCentroids = useMemo(() => {
    if (!geoData) return new Map<string, [number, number]>();
    const map = new Map<string, { center: [number, number]; score: number }>();
    for (const feature of geoData.features) {
      const provinceName = getProvinceName(feature);
      const center = featureCentroid(feature);
      const score = featureAreaScore(feature);
      const current = map.get(provinceName);
      if (!current || score > current.score) {
        map.set(provinceName, { center, score });
      }
    }
    return new Map(
      Array.from(map.entries()).map(([provinceName, value]) => [
        provinceName,
        value.center,
      ]),
    );
  }, [geoData]);

  /** Avatar markers: for each occupied province, spread avatars around centroid */
  const avatarMarkers = useMemo(() => {
    const markers: {
      key: string;
      position: [number, number];
      profile: ProfileWithProvince;
    }[] = [];
    for (const [provName, provProfiles] of profilesByProvince) {
      const center = provinceCentroids.get(provName);
      if (!center) continue;

      const count = provProfiles.length;
      provProfiles.forEach((profile, i) => {
        let lat = center[0];
        let lng = center[1];

        if (count > 1) {
          // Distribute in a circle around the centroid
          const angle = (2 * Math.PI * i) / count;
          const radius = Math.min(0.15 + count * 0.02, 0.5);
          lat += Math.cos(angle) * radius;
          lng += Math.sin(angle) * radius;
        }

        markers.push({
          key: profile.id,
          position: [lat, lng],
          profile,
        });
      });
    }
    return markers;
  }, [profilesByProvince, provinceCentroids]);

  useEffect(() => {
    fetch(SPAIN_PROVINCES_GEOJSON_URL)
      .then((res) => {
        if (!res.ok) throw new Error("Error cargando GeoJSON");
        return res.json();
      })
      .then((data: FeatureCollection) => setGeoData(splitArchipelagos(data)))
      .catch((err) => setError(err.message));
  }, []);

  const onEachFeature = useCallback(
    (feature: Feature<Geometry>, layer: Layer) => {
      const provinceName = getProvinceName(feature);
      const displayName = getFeatureLabel(feature);

      layer.on({
        mouseover: (e: LeafletMouseEvent) => {
          // Reset previous hover if mouseout was skipped
          const prev = prevHoveredRef.current;
          if (prev && prev.layer !== layer) {
            const prevProvince = prev.province;
            if (prevProvince !== selectedProvince) {
              (prev.layer as L.Path).setStyle(
                occupiedProvinces.has(prevProvince) ? OCCUPIED_STYLE : DEFAULT_STYLE,
              );
            }
          }
          prevHoveredRef.current = { layer, province: provinceName };

          setHovered({ label: displayName, province: provinceName });
          if (provinceName !== selectedProvince) {
            e.target.setStyle(HOVER_STYLE);
          }
          e.target.bringToFront();
        },
        mouseout: (e: LeafletMouseEvent) => {
          if (prevHoveredRef.current?.layer === layer) {
            prevHoveredRef.current = null;
          }
          setHovered(null);
          if (provinceName !== selectedProvince) {
            if (occupiedProvinces.has(provinceName)) {
              e.target.setStyle(OCCUPIED_STYLE);
            } else {
              e.target.setStyle(DEFAULT_STYLE);
            }
          }
        },
        click: () => {
          onProvinceSelect(provinceName);
        },
      });
    },
    [selectedProvince, onProvinceSelect, occupiedProvinces],
  );

  const styleFeature = useCallback(
    (feature: Feature<Geometry> | undefined) => {
      if (!feature) return DEFAULT_STYLE;
      const provinceName = getProvinceName(feature);
      if (provinceName === selectedProvince) return SELECTED_STYLE;
      if (occupiedProvinces.has(provinceName)) return OCCUPIED_STYLE;
      return DEFAULT_STYLE;
    },
    [selectedProvince, occupiedProvinces],
  );

  const hoveredProfiles = hovered
    ? (profilesByProvince.get(hovered.province) ?? [])
    : [];

  if (error) {
    return (
      <Card className='border-destructive'>
        <CardContent className='py-8 text-center'>
          <p className='text-destructive text-sm'>
            Error al cargar el mapa: {error}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!geoData) {
    return (
      <Card>
        <CardContent className='py-16 text-center'>
          <p className='text-muted-foreground text-sm'>Cargando mapa de España...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className='relative w-full'>
      {/* Hover tooltip: province name + users — top right */}
      {hovered && (
        <div className='absolute top-3 right-3 flex flex-col items-end gap-2 map-overlay'>
          <Badge variant='secondary' className='text-sm shadow-lg'>
            {hovered.label}
            {hoveredProfiles.length > 0 && (
              <span className='ml-1.5 text-muted-foreground'>
                ({hoveredProfiles.length})
              </span>
            )}
          </Badge>

          {hoveredProfiles.length > 0 && (
            <Card className='w-56 shadow-xl'>
              <CardContent className='p-3 space-y-2'>
                {hoveredProfiles.slice(0, 8).map((p) => (
                  <div key={p.id} className='flex items-center gap-2'>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Avatar className='h-6 w-6'>
                          <AvatarImage
                            src={p.avatar_url ?? undefined}
                            alt={p.full_name ?? ""}
                          />
                          <AvatarFallback className='text-[10px]'>
                            {(p.full_name ?? "?").charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      </TooltipTrigger>
                      <TooltipContent>{p.full_name ?? "Sin nombre"}</TooltipContent>
                    </Tooltip>
                    <span className='text-xs text-foreground truncate'>
                      {p.full_name ?? "Sin nombre"}
                    </span>
                  </div>
                ))}
                {hoveredProfiles.length > 8 && (
                  <p className='text-xs text-muted-foreground'>
                    +{hoveredProfiles.length - 8} más
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <div className='overflow-hidden'>
        <MapContainer
          center={[40.0, -3.7]}
          zoom={5}
          minZoom={3}
          maxZoom={12}
          attributionControl={false}
          zoomControl={true}
          style={{ height: "calc(100vh - 52px)", width: "100%" }}
          className='bg-background'>
          <TileLayer url='https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png' />
          <GeoJSON
            key={`${selectedProvince ?? "none"}-${occupiedProvinces.size}-${dialogOpen}`}
            data={geoData}
            style={styleFeature}
            onEachFeature={onEachFeature}
          />
          {/* Avatar markers for each user in their province */}
          {avatarMarkers.map((m) => (
            <Marker
              key={m.key}
              position={m.position}
              icon={createAvatarIcon(
                m.profile.avatar_url,
                m.profile.full_name ?? "",
              )}>
              <Popup className='avatar-popup'>
                <div className='flex flex-col items-center gap-2 p-2 min-w-[120px]'>
                  {m.profile.avatar_url && (
                    <img
                      src={m.profile.avatar_url}
                      alt={m.profile.full_name ?? ""}
                      className='w-12 h-12 rounded-full border-2 border-[#1d9bf0]'
                    />
                  )}
                  <span className='text-sm font-semibold text-center'>
                    {m.profile.full_name ?? "Sin nombre"}
                  </span>
                  {m.profile.username && (
                    <a
                      href={`https://x.com/intent/follow?screen_name=${m.profile.username}`}
                      target='_blank'
                      rel='noopener noreferrer'
                      className='follow-btn'>
                      <svg
                        viewBox='0 0 24 24'
                        width='14'
                        height='14'
                        fill='currentColor'>
                        <path d='M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z' />
                      </svg>
                      Seguir
                    </a>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
