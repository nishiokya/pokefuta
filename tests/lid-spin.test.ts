import assert from 'node:assert/strict';
import test from 'node:test';
import { bindLidSpin, CLICK_WINDOW } from '../src/lib/lid-spin';

// 図鑑の apps/web/assets/lid-spin.test.js と同じ筋書き。片方を変えたら揃える

function setup({ coarse = true, reduce = false }: { coarse?: boolean; reduce?: boolean } = {}) {
  let clock = 0;
  const frames = new Map<number, (t: number) => void>();
  let nextFrame = 1;
  const env = {
    matchMedia: (q: string) => ({ matches: q.includes('coarse') ? coarse : q.includes('reduced-motion') ? reduce : false }),
    performance: { now: () => clock },
    requestAnimationFrame: (cb: (t: number) => void) => { const id = nextFrame++; frames.set(id, cb); return id; },
    cancelAnimationFrame: (id: number) => frames.delete(id),
  };
  const element = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handlers: Record<string, (e: any) => void> = {};
    return {
      handlers, style: { transform: '' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      addEventListener: (t: string, f: (e: any) => void) => { handlers[t] = f; },
      removeEventListener: (t: string) => { delete handlers[t]; },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 200 }),
      setPointerCapture() {},
    };
  };
  const lid = element();
  const link = element();
  let spins = 0;
  bindLidSpin(lid as unknown as HTMLElement, link as unknown as HTMLElement, () => { spins += 1; }, env);

  // 中心 (100,100) から半径 radius・角度 deg の位置
  const at = (deg: number, radius = 80) => ({
    clientX: 100 + radius * Math.cos((deg * Math.PI) / 180),
    clientY: 100 + radius * Math.sin((deg * Math.PI) / 180),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pointer = (type: string, deg: number, extra: Record<string, any> = {}) => {
    const f = lid.handlers[type];
    if (f) f({ pointerId: 1, pointerType: 'touch', isPrimary: true, timeStamp: clock, preventDefault() {}, ...at(deg, extra.radius), ...extra });
  };
  const advance = (ms: number) => { clock += ms; };
  // 慣性を最後まで回す（16ms ごと）
  const settle = () => {
    for (let i = 0; i < 2000 && frames.size; i++) {
      const [[id, cb]] = Array.from(frames);
      frames.delete(id);
      clock += 16;
      cb(clock);
    }
  };
  const click = (detail = 1) => {
    let prevented = false;
    let stopped = false;
    const e = { detail, preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } };
    if (link.handlers.click) link.handlers.click(e);
    return { opened: !prevented, counted: !stopped };
  };
  const angle = () => Number((lid.style.transform || 'rotate(0deg)').match(/-?[\d.]+/)![0]);
  // 0° から to° まで、16ms ごとに step° ずつ回して離す
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const drag = (to: number, step = 15, extra: Record<string, any> = {}) => {
    pointer('pointerdown', 0, extra);
    for (let d = step; Math.abs(d) <= Math.abs(to); d += step) { advance(16); pointer('pointermove', d, extra); }
    pointer('pointerup', to, extra);
  };
  return { lid, link, pointer, advance, settle, click, angle, drag, spins: () => spins, frames };
}


test('タップはリンクを開き、計測にも数える', () => {
    const t = setup();
    t.pointer('pointerdown', 0);
    t.advance(60);
    t.pointer('pointerup', 3);
    assert.deepEqual(t.click(), { opened: true, counted: true });
    assert.equal(t.spins(), 0);
});

test('回したら慣性で回って止まり、直後のクリックは開かない', () => {
    const t = setup();
    t.drag(60);
    // ブラウザは指を離した直後にクリックを出す
    assert.deepEqual(t.click(), { opened: false, counted: false });
    assert.equal(t.spins(), 1);
    const released = t.angle();
    t.settle();
    assert.ok(t.angle() > released + 90, `慣性で回る: ${released} → ${t.angle()}`);
    assert.equal(t.frames.size, 0, '止まったらフレームを残さない');
});

test('ブラウザがクリックを出さなかったとき、次の正当なクリックは止めない', () => {
    const t = setup();
    t.drag(60);
    t.advance(CLICK_WINDOW + 1);
    assert.deepEqual(t.click(), { opened: true, counted: true });
});

test('キーボード・読み上げのクリック（detail 0）は回した直後でも止めない', () => {
    const t = setup();
    t.drag(60);
    assert.deepEqual(t.click(0), { opened: true, counted: true });
});

test('止めるのは1回だけ', () => {
    const t = setup();
    t.drag(60);
    t.click();
    assert.deepEqual(t.click(), { opened: true, counted: true });
});

test('2本目の指は無視し、1本目の回転を上書きしない', () => {
    const t = setup();
    t.pointer('pointerdown', 0);
    for (let d = 15; d <= 60; d += 15) { t.advance(16); t.pointer('pointermove', d); }
    t.pointer('pointerdown', 200, { pointerId: 2, isPrimary: false });
    t.pointer('pointermove', 210, { pointerId: 2, isPrimary: false });
    t.pointer('pointerup', 210, { pointerId: 2, isPrimary: false });
    t.pointer('pointerup', 60);
    assert.deepEqual(t.click(), { opened: false, counted: false });
    assert.equal(t.spins(), 1);
});

test('pointercancel では回さず・数えず・クリックも止めない', () => {
    const t = setup();
    t.pointer('pointerdown', 0);
    for (let d = 15; d <= 60; d += 15) { t.advance(16); t.pointer('pointermove', d); }
    t.pointer('pointercancel', 60);
    assert.equal(t.frames.size, 0);
    assert.equal(t.spins(), 0);
    assert.deepEqual(t.click(), { opened: true, counted: true });
});

test('±180° をまたいでも短い向きに回る', () => {
    const t = setup();
    t.pointer('pointerdown', 170);
    t.advance(16);
    t.pointer('pointermove', 190); // atan2 では -170°
    t.advance(200);
    t.pointer('pointerup', 190);
    assert.ok(Math.abs(t.angle() - 20) < 1e-6, `20° 回る: ${t.angle()}`);
});

test('中心付近の指のぶれは回転に数えない', () => {
    const t = setup();
    t.pointer('pointerdown', 0, { radius: 5 });
    t.advance(16);
    t.pointer('pointermove', 180, { radius: 5 }); // 中心をはさんで数 px 動いただけ
    t.advance(16);
    t.pointer('pointerup', 180, { radius: 5 });
    assert.equal(t.angle(), 0);
    assert.deepEqual(t.click(), { opened: true, counted: true });
});

test('マウスでは何もしない', () => {
    const t = setup();
    t.drag(90, 15, { pointerType: 'mouse' });
    assert.equal(t.angle(), 0);
    assert.deepEqual(t.click(), { opened: true, counted: true });
});

test('PC（pointer: fine）では何も付けない', () => {
    const t = setup({ coarse: false });
    assert.deepEqual(Object.keys(t.lid.handlers), []);
    assert.deepEqual(Object.keys(t.link.handlers), []);
});

test('prefers-reduced-motion では慣性を付けない', () => {
    const t = setup({ reduce: true });
    t.drag(60);
    assert.equal(t.frames.size, 0);
    assert.deepEqual(t.click(), { opened: false, counted: false });
});

test('指を止めてから離したら慣性を付けない', () => {
    const t = setup();
    t.pointer('pointerdown', 0);
    for (let d = 15; d <= 60; d += 15) { t.advance(16); t.pointer('pointermove', d); }
    t.advance(200);
    t.pointer('pointerup', 60);
    assert.equal(t.frames.size, 0);
});
