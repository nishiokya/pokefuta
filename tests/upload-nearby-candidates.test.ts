import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allowedUploadDistanceKm,
  findNearbyPickCandidates,
  NEARBY_PICK_MAX_KM,
} from '../src/lib/upload-nearby-candidates.ts';

// 緯度 0.0001 度 ≒ 11m
const at = (id: number, dLat: number) => ({ id, latitude: 35 + dLat, longitude: 135 });

test('50m 超 300m 以内の蓋を近い順に返す', () => {
  const manholes = [
    at(1, 0.0002), // 約22m（自動で決まる側なので候補に出さない）
    at(2, 0.0025), // 約278m
    at(3, 0.0009), // 約100m
    at(4, 0.0030), // 約333m（範囲外）
    { id: 5, latitude: null, longitude: null },
  ];
  const result = findNearbyPickCandidates(35, 135, manholes);
  assert.deepEqual(result.map((c) => c.manhole.id), [3, 2]);
  assert.ok(result[0].distanceM > 90 && result[0].distanceM < 110);
});

test('候補は上限の枚数まで', () => {
  const manholes = Array.from({ length: 8 }, (_, i) => at(i + 1, 0.0006 + i * 0.0002));
  assert.equal(findNearbyPickCandidates(35, 135, manholes).length, 5);
});

test('候補が無ければ空', () => {
  assert.deepEqual(findNearbyPickCandidates(35, 135, [at(1, 0.01)]), []);
});

test('サーバーの上限は nearby_pick のときだけ 300m', () => {
  assert.equal(allowedUploadDistanceKm(true), NEARBY_PICK_MAX_KM);
  assert.equal(allowedUploadDistanceKm(false), 0.05);
});
