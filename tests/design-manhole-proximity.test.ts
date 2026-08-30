import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OFFICIAL_MANHOLE_NEARBY_CODE,
  buildOfficialManholeConflict,
  findNearbyOfficialManhole,
  getDesignManholePublicationStatus,
  getOfficialManholeProximityDecision,
  hasConfirmedDifferentManhole,
  isDesignManholeSubmissionReady,
  type OfficialManholeCandidate,
} from '../src/lib/design-manhole-proximity.ts';
import type { SnapshotManhole } from '../src/lib/manhole-snapshot.ts';

const official157: SnapshotManhole = {
  id: 157,
  title: '青森県/八戸市',
  name: '青森県/八戸市',
  prefecture: '青森県',
  municipality: '八戸市',
  city: '八戸市',
  latitude: 40.537937,
  longitude: 141.558034,
  pokemons: ['イシツブテ', 'キャモメ'],
  titles: [],
  address: '青森県八戸市大字十八日町',
  building: null,
  detail_url: null,
  official_url: null,
  is_visited: false,
  last_visit: null,
  photo_count: 0,
};

const nearbyCandidate: OfficialManholeCandidate = {
  id: 157,
  title: '青森県/八戸市',
  prefecture: '青森県',
  municipality: '八戸市',
  pokemons: ['イシツブテ', 'キャモメ'],
  latitude: 40.537937,
  longitude: 141.558034,
  distance_m: 1,
};

test('API policy: 約1mの公式ポケふたを50m以内の候補として返す', () => {
  const candidate = findNearbyOfficialManhole(
    [official157],
    40.5379444444444,
    141.558027777778
  );

  assert.equal(candidate?.id, 157);
  assert.equal(candidate?.distance_m, 1);
});

test('API policy: 50mを超える投稿は通常投稿として扱う', () => {
  const candidate = findNearbyOfficialManhole([official157], 40.539, 141.56);
  assert.equal(candidate, null);
  assert.equal(hasConfirmedDifferentManhole(candidate, null), true);
});

test('API policy: 未確認または別IDの確認では近接投稿を許可しない', () => {
  assert.equal(hasConfirmedDifferentManhole(nearbyCandidate, null), false);
  assert.equal(hasConfirmedDifferentManhole(nearbyCandidate, 999), false);
});

test('API policy: サーバーが検出した候補IDの明示確認だけを許可する', () => {
  assert.equal(hasConfirmedDifferentManhole(nearbyCandidate, 157), true);
});

test('API policy: 通常投稿と確認済みの近接する別デザイン蓋を区別する', () => {
  const clear = getOfficialManholeProximityDecision(null, null);
  const confirmedDifferent = getOfficialManholeProximityDecision(
    nearbyCandidate,
    157
  );

  assert.equal(clear.result, 'clear');
  assert.equal(getDesignManholePublicationStatus(clear), 'published');
  assert.equal(confirmedDifferent.result, 'confirmed_different');
  assert.equal(
    getDesignManholePublicationStatus(confirmedDifferent),
    'needs_review'
  );
  assert.equal(
    getOfficialManholeProximityDecision(nearbyCandidate, null).result,
    'conflict'
  );
});

test('API response: 409用payloadに候補情報と訪問投稿URLを含める', () => {
  const conflict = buildOfficialManholeConflict(nearbyCandidate);
  assert.equal(conflict.code, OFFICIAL_MANHOLE_NEARBY_CODE);
  assert.equal(conflict.official_manhole.id, 157);
  assert.equal(conflict.visit_upload_url, '/upload?manhole_id=157');
});

test('UI gate: 照合中・照合失敗・未確認の近接投稿では送信できない', () => {
  const base = {
    hasFile: true,
    hasCoordinates: true,
    exifChecking: false,
    submitting: false,
    nearbyOfficialManhole: nearbyCandidate,
    confirmedNearbyOfficialManholeId: null,
  };

  assert.equal(isDesignManholeSubmissionReady({ ...base, proximityCheckStatus: 'checking' }), false);
  assert.equal(isDesignManholeSubmissionReady({ ...base, proximityCheckStatus: 'error' }), false);
  assert.equal(isDesignManholeSubmissionReady({ ...base, proximityCheckStatus: 'ready' }), false);
});

test('UI gate: 候補なし、または同じ候補IDを確認済みなら送信できる', () => {
  const base = {
    hasFile: true,
    hasCoordinates: true,
    exifChecking: false,
    submitting: false,
    proximityCheckStatus: 'ready' as const,
  };

  assert.equal(isDesignManholeSubmissionReady({
    ...base,
    nearbyOfficialManhole: null,
    confirmedNearbyOfficialManholeId: null,
  }), true);
  assert.equal(isDesignManholeSubmissionReady({
    ...base,
    nearbyOfficialManhole: nearbyCandidate,
    confirmedNearbyOfficialManholeId: 157,
  }), true);
});
