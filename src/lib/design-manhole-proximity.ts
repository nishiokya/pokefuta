import type { SnapshotManhole } from './manhole-snapshot';

export const OFFICIAL_MANHOLE_NEARBY_CODE = 'OFFICIAL_MANHOLE_NEARBY';
export const OFFICIAL_MANHOLE_NEARBY_RADIUS_KM = 0.05;

export interface OfficialManholeCandidate {
  id: number;
  title: string;
  prefecture: string;
  municipality: string | null;
  pokemons: string[];
  latitude: number;
  longitude: number;
  distance_m: number;
}

export interface OfficialManholeConflict {
  code: typeof OFFICIAL_MANHOLE_NEARBY_CODE;
  official_manhole: OfficialManholeCandidate;
  visit_upload_url: string;
}

export type OfficialManholeProximityDecision =
  | { result: 'clear'; official_manhole: null }
  | { result: 'conflict'; official_manhole: OfficialManholeCandidate }
  | { result: 'confirmed_different'; official_manhole: OfficialManholeCandidate };

export type DesignManholePublicationStatus = 'published' | 'needs_review';

interface SubmissionGateInput {
  hasFile: boolean;
  hasCoordinates: boolean;
  exifChecking: boolean;
  submitting: boolean;
  proximityCheckStatus: 'idle' | 'checking' | 'ready' | 'error';
  nearbyOfficialManhole: OfficialManholeCandidate | null;
  confirmedNearbyOfficialManholeId: number | null;
}

function calculateDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const earthRadiusKm = 6371;
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(deltaLng / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function toOfficialManholeCandidate(
  manhole: Pick<SnapshotManhole, 'id' | 'title' | 'prefecture' | 'municipality' | 'pokemons' | 'latitude' | 'longitude'>,
  distanceKm: number
): OfficialManholeCandidate {
  return {
    id: manhole.id,
    title: manhole.title,
    prefecture: manhole.prefecture,
    municipality: manhole.municipality,
    pokemons: manhole.pokemons,
    latitude: manhole.latitude,
    longitude: manhole.longitude,
    distance_m: Math.round(distanceKm * 1000),
  };
}

export function findNearbyOfficialManhole(
  manholes: SnapshotManhole[],
  latitude: number,
  longitude: number,
  radiusKm: number = OFFICIAL_MANHOLE_NEARBY_RADIUS_KM
): OfficialManholeCandidate | null {
  let nearest: { manhole: SnapshotManhole; distanceKm: number } | null = null;

  for (const manhole of manholes) {
    const distanceKm = calculateDistanceKm(
      latitude,
      longitude,
      manhole.latitude,
      manhole.longitude
    );
    if (distanceKm > radiusKm) continue;
    if (!nearest || distanceKm < nearest.distanceKm) {
      nearest = { manhole, distanceKm };
    }
  }

  return nearest
    ? toOfficialManholeCandidate(nearest.manhole, nearest.distanceKm)
    : null;
}

export function buildOfficialManholeConflict(
  candidate: OfficialManholeCandidate
): OfficialManholeConflict {
  return {
    code: OFFICIAL_MANHOLE_NEARBY_CODE,
    official_manhole: candidate,
    visit_upload_url: `/upload?manhole_id=${candidate.id}`,
  };
}

export function hasConfirmedDifferentManhole(
  candidate: OfficialManholeCandidate | null,
  confirmedNearbyOfficialManholeId: number | null
): boolean {
  return candidate === null || confirmedNearbyOfficialManholeId === candidate.id;
}

export function getOfficialManholeProximityDecision(
  candidate: OfficialManholeCandidate | null,
  confirmedNearbyOfficialManholeId: number | null
): OfficialManholeProximityDecision {
  if (!candidate) {
    return { result: 'clear', official_manhole: null };
  }
  if (confirmedNearbyOfficialManholeId === candidate.id) {
    return { result: 'confirmed_different', official_manhole: candidate };
  }
  return { result: 'conflict', official_manhole: candidate };
}

export function getDesignManholePublicationStatus(
  decision: OfficialManholeProximityDecision
): DesignManholePublicationStatus {
  return decision.result === 'confirmed_different'
    ? 'needs_review'
    : 'published';
}

export function isDesignManholeSubmissionReady(input: SubmissionGateInput): boolean {
  return (
    input.hasFile &&
    input.hasCoordinates &&
    !input.exifChecking &&
    !input.submitting &&
    input.proximityCheckStatus === 'ready' &&
    hasConfirmedDifferentManhole(
      input.nearbyOfficialManhole,
      input.confirmedNearbyOfficialManholeId
    )
  );
}
