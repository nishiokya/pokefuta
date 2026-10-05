import assert from 'node:assert/strict';
import test from 'node:test';
import { interleaveByGroup } from '../src/lib/interleave-by-group';

const ids = (items: { id: string }[]) => items.map((i) => i.id);

test('グループを1枚ずつ順番に回す（元の並びの順は保つ）', () => {
  const items = [
    { id: 'a1', u: 'a' }, { id: 'a2', u: 'a' }, { id: 'a3', u: 'a' },
    { id: 'b1', u: 'b' }, { id: 'a4', u: 'a' }, { id: 'c1', u: 'c' }, { id: 'b2', u: 'b' },
  ];
  assert.deepEqual(ids(interleaveByGroup(items, (i) => i.u)), ['a1', 'b1', 'c1', 'a2', 'b2', 'a3', 'a4']);
});

test('グループの分からないものはそれぞれ別に扱い、件数は変えない', () => {
  const items = [{ id: 'x', u: null }, { id: 'a1', u: 'a' }, { id: 'y', u: null }, { id: 'a2', u: 'a' }];
  const out = interleaveByGroup(items, (i) => i.u);
  assert.deepEqual(ids(out), ['x', 'a1', 'y', 'a2']);
  assert.deepEqual(interleaveByGroup([], () => 'a'), []);
});
