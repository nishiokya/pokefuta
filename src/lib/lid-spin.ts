/**
 * スマホだけ、蓋の画像を指で回せるようにする（離すと慣性で回って止まる）。PC とマウスでは何もしない。
 * 404 ページのヤドンの蓋で使う。図鑑（nishiokya/pokefuta-tracker の apps/web/assets/lid-spin.js）の写し。
 * 片方を変えたらもう片方も揃え、tests/lid-spin.test.ts（図鑑は lid-spin.test.js）も通すこと。
 *
 * 決まり:
 * - 動くのは pointer: coarse の端末の、1本目の指（isPrimary）だけ。2本目以降は無視する
 * - TAP_LIMIT 度以上回したら、直後のタッチ由来のクリックだけ止める（蓋を包むリンクを開かず、計測にも数えない）。
 *   ブラウザがクリック自体を出さないこともあるので、止めるのは CLICK_WINDOW ms 以内だけ。
 *   キーボードや読み上げのクリック（detail 0）は止めない
 * - pointercancel（スクロールやピンチでブラウザが操作を引き取った）は、回さず・数えず・何も止めない
 * - 中心付近は角度が定まらない（数 px で半回転に見える）ので、DEAD_ZONE の内側の動きは数えない
 */

const FRICTION = 0.998; // 1ms あたりの減衰。小さいほど早く止まる
const MIN_SPEED = 0.02; // 度/ms。これを下回ったら止める
export const TAP_LIMIT = 8; // 度。これ以上回したらタップではない
const DEAD_ZONE = 0.25; // 蓋の半径に対する割合。この内側の動きは数えない
export const CLICK_WINDOW = 600; // ms。回し終えてからこの間のクリックだけ止める
const STILL_MS = 80; // ms。指を止めてからこれ以上たって離したら慣性を付けない

export interface LidSpinEnv {
  matchMedia(query: string): { matches: boolean };
  performance: { now(): number };
  requestAnimationFrame(cb: (t: number) => void): number;
  cancelAnimationFrame(id: number): void;
}

/** @returns 解除する関数 */
export function bindLidSpin(
  lid: HTMLElement,
  link: HTMLElement,
  onFirstSpin: () => void,
  env: LidSpinEnv | undefined = typeof window === 'undefined' ? undefined : window,
): () => void {
  if (!env || !env.matchMedia('(pointer: coarse)').matches) return () => {};
  const e0 = env;
  const reduce = e0.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let angle = 0;
  let velocity = 0;
  let lastAngle: number | null = null;
  let lastTime = 0;
  let moved = 0;
  let pointer: number | null = null;
  let frame = 0;
  let spun = false;
  let swallowUntil = 0;

  const now = () => e0.performance.now();
  const polar = (e: PointerEvent) => {
    const r = lid.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    return {
      angle: (Math.atan2(dy, dx) * 180) / Math.PI,
      inner: Math.sqrt(dx * dx + dy * dy) < (Math.min(r.width, r.height) / 2) * DEAD_ZONE,
    };
  };
  const draw = () => {
    lid.style.transform = `rotate(${angle}deg)`;
  };
  const stopInertia = () => {
    if (frame) e0.cancelAnimationFrame(frame);
    frame = 0;
  };

  const onDown = (e: PointerEvent) => {
    if (e.pointerType !== 'touch' || !e.isPrimary || pointer !== null) return;
    pointer = e.pointerId;
    stopInertia();
    velocity = 0;
    moved = 0;
    swallowUntil = 0;
    const p = polar(e);
    lastAngle = p.inner ? null : p.angle;
    lastTime = e.timeStamp;
    try {
      lid.setPointerCapture(e.pointerId);
    } catch {
      // 合成イベントなど
    }
  };
  const onMove = (e: PointerEvent) => {
    if (e.pointerId !== pointer) return;
    const p = polar(e);
    if (p.inner) {
      lastAngle = null;
      return;
    }
    if (lastAngle === null) {
      lastAngle = p.angle;
      lastTime = e.timeStamp;
      return;
    }
    let d = p.angle - lastAngle;
    if (d > 180) d -= 360;
    else if (d < -180) d += 360;
    const dt = Math.max(1, e.timeStamp - lastTime);
    angle += d;
    moved += Math.abs(d);
    velocity = velocity * 0.6 + (d / dt) * 0.4;
    lastAngle = p.angle;
    lastTime = e.timeStamp;
    draw();
  };
  const onUp = (e: PointerEvent) => {
    if (e.pointerId !== pointer) return;
    pointer = null;
    if (moved < TAP_LIMIT) return; // タップ。クリックはそのまま通す
    swallowUntil = now() + CLICK_WINDOW;
    if (!spun) {
      spun = true;
      onFirstSpin();
    }
    if (reduce || e.timeStamp - lastTime > STILL_MS) return;
    let prev = now();
    const step = (t: number) => {
      const dt = t - prev;
      prev = t;
      velocity *= Math.pow(FRICTION, dt);
      if (Math.abs(velocity) < MIN_SPEED) {
        frame = 0;
        return;
      }
      angle += velocity * dt;
      draw();
      frame = e0.requestAnimationFrame(step);
    };
    frame = e0.requestAnimationFrame(step);
  };
  const onCancel = (e: PointerEvent) => {
    if (e.pointerId !== pointer) return;
    pointer = null;
    velocity = 0;
    swallowUntil = 0;
  };
  const onClick = (e: MouseEvent) => {
    if (swallowUntil && e.detail !== 0 && now() < swallowUntil) {
      // 遷移もクリック計測（Next の Link と React の onClick）も止める
      e.preventDefault();
      e.stopPropagation();
    }
    swallowUntil = 0;
  };
  // Android の長押しメニュー（iOS は CSS の touch-callout）
  const onContextMenu = (e: Event) => e.preventDefault();

  lid.addEventListener('pointerdown', onDown);
  lid.addEventListener('pointermove', onMove);
  lid.addEventListener('pointerup', onUp);
  lid.addEventListener('pointercancel', onCancel);
  lid.addEventListener('contextmenu', onContextMenu);
  link.addEventListener('click', onClick);
  return () => {
    stopInertia();
    lid.removeEventListener('pointerdown', onDown);
    lid.removeEventListener('pointermove', onMove);
    lid.removeEventListener('pointerup', onUp);
    lid.removeEventListener('pointercancel', onCancel);
    lid.removeEventListener('contextmenu', onContextMenu);
    link.removeEventListener('click', onClick);
  };
}
