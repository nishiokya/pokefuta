/**
 * スマホだけ、蓋の画像を指で回せるようにする（離すと慣性で回って止まる）。PC とマウスでは何もしない。
 *
 * 図鑑の 404（nishiokya/pokefuta-tracker の apps/web/404.html）にある同じ処理の写し。片方を変えたら揃える。
 * 回したあとのクリックは握りつぶすので、蓋をリンクで包んでいてもタップと区別できる。
 *
 * @returns 解除する関数
 */
export function bindLidSpin(
  lid: HTMLElement,
  link: HTMLElement,
  onFirstSpin: () => void,
): () => void {
  if (typeof window === 'undefined' || !window.matchMedia('(pointer: coarse)').matches) {
    return () => {};
  }
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FRICTION = 0.998; // 1ms あたりの減衰。小さいほど早く止まる
  const MIN_SPEED = 0.02; // 度/ms。これを下回ったら止める
  const TAP_LIMIT = 8; // これ以上回したら、蓋のリンクを開かない

  let angle = 0;
  let velocity = 0;
  let lastAngle = 0;
  let lastTime = 0;
  let moved = 0;
  let pointer: number | null = null;
  let frame = 0;
  let spun = false;
  let swallowClick = false;

  const pointerAngle = (e: PointerEvent) => {
    const r = lid.getBoundingClientRect();
    return (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI;
  };
  const draw = () => {
    lid.style.transform = `rotate(${angle}deg)`;
  };

  const onDown = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    pointer = e.pointerId;
    cancelAnimationFrame(frame);
    velocity = 0;
    moved = 0;
    swallowClick = false;
    lastAngle = pointerAngle(e);
    lastTime = e.timeStamp;
    try {
      lid.setPointerCapture(e.pointerId);
    } catch {
      // 合成イベントなど
    }
  };
  const onMove = (e: PointerEvent) => {
    if (e.pointerId !== pointer) return;
    const a = pointerAngle(e);
    let d = a - lastAngle;
    if (d > 180) d -= 360;
    else if (d < -180) d += 360;
    const dt = Math.max(1, e.timeStamp - lastTime);
    angle += d;
    moved += Math.abs(d);
    velocity = velocity * 0.6 + (d / dt) * 0.4;
    lastAngle = a;
    lastTime = e.timeStamp;
    draw();
  };
  const onRelease = (e: PointerEvent) => {
    if (e.pointerId !== pointer) return;
    pointer = null;
    if (moved >= TAP_LIMIT) {
      swallowClick = true;
      if (!spun) {
        spun = true;
        onFirstSpin();
      }
    }
    // 指を止めてから離したときは、慣性で回さない
    if (reduce || e.timeStamp - lastTime > 80) return;
    let prev = performance.now();
    const step = (now: number) => {
      const dt = now - prev;
      prev = now;
      velocity *= Math.pow(FRICTION, dt);
      if (Math.abs(velocity) < MIN_SPEED) return;
      angle += velocity * dt;
      draw();
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  };
  const onClick = (e: MouseEvent) => {
    if (swallowClick) {
      // 遷移もクリック計測（React の onClick）も止める
      e.preventDefault();
      e.stopPropagation();
      swallowClick = false;
    }
  };

  lid.addEventListener('pointerdown', onDown);
  lid.addEventListener('pointermove', onMove);
  lid.addEventListener('pointerup', onRelease);
  lid.addEventListener('pointercancel', onRelease);
  link.addEventListener('click', onClick);
  return () => {
    cancelAnimationFrame(frame);
    lid.removeEventListener('pointerdown', onDown);
    lid.removeEventListener('pointermove', onMove);
    lid.removeEventListener('pointerup', onRelease);
    lid.removeEventListener('pointercancel', onRelease);
    link.removeEventListener('click', onClick);
  };
}
