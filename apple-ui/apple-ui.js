/* apple-ui.js
   Squircle corners, press states, slider fill, and the liquid glass tab bar.
   Load it at the end of <body>. Listen for 'tabchange' on #bar to react. */
(function () {

  /* ---------- squircle corners ----------
     Put data-sq="22" on any card. Drawn in JS on every browser because
     Chrome's native corner-shape uses a different curve to Safari. */
  function squirclePath(w, h, r, n) {
    n = n || 5;
    r = Math.min(r, w / 2, h / 2);
    const steps = 16, pts = [];
    const corners = [[w-r,h-r,1,1], [r,h-r,-1,1], [r,r,-1,-1], [w-r,r,1,-1]];
    for (const [cx, cy, sx, sy] of corners) {
      const forward = sx * sy > 0;             // neighbouring corners sweep opposite ways
      for (let i = 0; i <= steps; i++) {
        const a = (forward ? i : steps - i) / steps * Math.PI / 2;
        pts.push((cx + sx*r*Math.abs(Math.cos(a))**(2/n)).toFixed(2) + ' ' +
                 (cy + sy*r*Math.abs(Math.sin(a))**(2/n)).toFixed(2));
      }
    }
    return `path("M${pts.join('L')}Z")`;
  }
  const shaped = new Set();
  const drawSq = el => {
    const b = el.getBoundingClientRect();
    if (b.width > 2 && b.height > 2) el.style.clipPath = squirclePath(b.width, b.height, +el.dataset.sq);
  };
  const ro = new ResizeObserver(es => es.forEach(e => drawSq(e.target)));
  document.fonts?.ready.then(() => shaped.forEach(drawSq));

  /* ---------- press states ----------
     data-press = button that blooms. data-tap = list row that only darkens.
     Done in JS because iOS Safari does not fire :active reliably. */
  const bindPress = el => {
    const on = () => el.classList.add('pressed'), off = () => el.classList.remove('pressed');
    el.addEventListener('pointerdown', on);
    ['pointerup','pointercancel','pointerleave'].forEach(e => el.addEventListener(e, off));
  };

  /* ---------- slider fill ---------- */
  const bindSlider = el => {
    const fill = () => el.style.setProperty('--fill', (el.value-el.min)/(el.max-el.min)*100 + '%');
    el.addEventListener('input', fill);
    fill();
  };

  /* ---------- refresh ----------
     Wires up anything added to the page after load (e.g. rows drawn from
     data). Safe to call again: each element is only wired once.
     Usage: AppleUI.refresh() */
  const wired = new WeakSet();
  const once = (sel, fn) => document.querySelectorAll(sel).forEach(el => {
    if (wired.has(el)) return;
    wired.add(el); fn(el);
  });
  function refresh() {
    shaped.forEach(el => { if (!el.isConnected) { ro.unobserve(el); shaped.delete(el); } });
    document.querySelectorAll('[data-sq]').forEach(el => {
      if (shaped.has(el)) return;
      shaped.add(el); drawSq(el); ro.observe(el);
    });
    once('[data-press], [data-tap], .icon-btn', bindPress);
    once('input[type=range]', bindSlider);
  }
  window.AppleUI = { refresh };
  refresh();

  /* ---------- tab bar ---------- */
  const bar = document.getElementById('bar');
  if (!bar) return;

  const tabsEl = document.getElementById('tabs');
  const lens = document.getElementById('lens');
  const tabs = [...tabsEl.querySelectorAll('.tab')];
  const glass = bar.querySelector('.bar__glass');
  const sheen = bar.querySelector('.bar__sheen');
  const edgeSvg = document.getElementById('edge');
  const edgePath = document.getElementById('edgePath');

  const count = tabs.length;
  const maxPos = (count - 1) * 100;

  // locked values
  const stiffness = 160, damping = 21.5;
  const swellW = 1.31, swellH = 1.46, give = 5, zoom = 1.30;

  let index = Math.max(0, tabs.findIndex(t => t.classList.contains('on')));
  let pos = index * 100, vel = 0, tgt = pos, raf = null;
  let grow = 0, growTo = 0;
  const tabZoom = tabs.map(() => 0);
  let down = false, startX = 0, startPos = 0, moved = 0;

  // signed distance to a horizontal capsule, negative inside
  function capsuleSD(px, py, cx, cy, w, h) {
    const r = h / 2, half = Math.max(0, w / 2 - r);
    const qx = Math.abs(px - cx) - half, qy = py - cy;
    return (qx < 0 ? Math.abs(qy) : Math.hypot(qx, qy)) - r;
  }

  // bar outline as points with outward normals, round ends included
  function outline(w, h) {
    const r = h / 2, pts = [], N = 26, C = 22;
    for (let i = 0; i <= N; i++) pts.push([r + (w - 2*r) * i/N, 0, 0, -1]);
    for (let i = 1; i < C; i++) {
      const a = -Math.PI/2 + Math.PI * i/C;
      pts.push([w - r + r*Math.cos(a), h/2 + r*Math.sin(a), Math.cos(a), Math.sin(a)]);
    }
    for (let i = 0; i <= N; i++) pts.push([w - r - (w - 2*r) * i/N, h, 0, 1]);
    for (let i = 1; i < C; i++) {
      const a = Math.PI/2 + Math.PI * i/C;
      pts.push([r + r*Math.cos(a), h/2 + r*Math.sin(a), Math.cos(a), Math.sin(a)]);
    }
    return pts;
  }

  function reshape(cx, cy, lw, lh) {
    // offsetWidth, not getBoundingClientRect, because the bar scales while held
    const w = glass.offsetWidth, h = glass.offsetHeight;
    if (w < 4) return;
    const depth = give * grow, feather = 9;
    let d = '';
    for (const [x, y, nx, ny] of outline(w, h)) {
      let push = 0;
      if (depth > 0.2) {
        const k = Math.min(1, Math.max(0, -capsuleSD(x, y, cx, cy, lw, lh) / feather));
        push = depth * (k * k * (3 - 2 * k));
      }
      d += (d ? 'L' : 'M') + (x - nx*push).toFixed(2) + ',' + (y - ny*push).toFixed(2);
    }
    d += 'Z';
    glass.style.clipPath = sheen.style.clipPath = `path("${d}")`;
    edgeSvg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    edgePath.setAttribute('d', d);
  }

  function paint() {
    const stripW = tabsEl.offsetWidth, stripH = tabsEl.offsetHeight;
    if (stripW < 4) return;
    const pad = (bar.offsetWidth - stripW) / 2;
    const baseW = stripW / count, baseH = stripH;

    const g = grow < 0.005 ? 0 : grow;
    const lw = baseW * (1 + g * (swellW - 1));
    const lh = baseH * (1 + g * (swellH - 1));
    const x = (pos / 100) * baseW - (lw - baseW) / 2;

    lens.style.width = lw + 'px';
    lens.style.height = lh + 'px';
    lens.style.top = (baseH - lh) / 2 + 'px';
    lens.style.transform = `translateX(${x}px)`;

    // icons zoom by how close the lens is, so they ease in rather than snap
    const centre = pos / 100;
    tabs.forEach((tab, i) => {
      const want = grow * Math.max(0, 1 - Math.abs(centre - i));
      tabZoom[i] += (want - tabZoom[i]) * 0.12;
      const z = 1 + tabZoom[i] * (zoom - 1);
      tab.style.transform = tabZoom[i] > 0.002 ? `scale(${z.toFixed(4)})` : '';
    });

    reshape(pad + x + lw / 2, pad + baseH / 2, lw, lh);
  }

  function tick() {
    const dt = 1 / 60;
    vel += (-stiffness * (pos - tgt) - damping * vel) * dt;
    pos += vel * dt;

    // after release, swell follows speed, so a tapped jump bulges mid-flight
    if (!down) growTo = Math.min(1, Math.abs(vel) / 110);
    grow += (growTo - grow) * 0.2;

    const still = Math.abs(vel) < 0.35 && Math.abs(pos - tgt) < 0.35;
    const done = Math.abs(grow - growTo) < 0.004 && tabZoom.every((z, i) =>
                   Math.abs(z - grow * Math.max(0, 1 - Math.abs(pos/100 - i))) < 0.004);
    if (still) { pos = tgt; vel = 0; }
    if (still && done) { grow = growTo; paint(); raf = null; return; }
    paint();
    raf = requestAnimationFrame(tick);
  }
  const spring = () => { if (!raf) raf = requestAnimationFrame(tick); };

  function select(i) {
    const changed = i !== index;
    index = i; tgt = i * 100;
    tabs.forEach(t => t.classList.toggle('on', tabs.indexOf(t) === i));
    spring();
    if (navigator.vibrate) navigator.vibrate(7);   // android only
    if (changed) bar.dispatchEvent(new CustomEvent('tabchange', { detail: { index: i, tab: tabs[i] } }));
  }

  tabsEl.addEventListener('pointerdown', e => {
    down = true; moved = 0; startX = e.clientX; startPos = pos; vel = 0;
    lens.classList.add('lit');
    bar.classList.add('held');
    growTo = 1; spring();
    tabsEl.setPointerCapture(e.pointerId);
  });

  tabsEl.addEventListener('pointermove', e => {
    if (!down) return;
    moved = Math.max(moved, Math.abs(e.clientX - startX));
    if (moved < 5) return;
    const step = tabsEl.getBoundingClientRect().width / count;
    const next = Math.max(0, Math.min(maxPos, startPos + (e.clientX - startX) / step * 100));
    vel = (next - pos) * 40; pos = next; tgt = next; paint();
    const near = Math.round(pos / 100);
    tabs.forEach((t, i) => t.classList.toggle('on', i === near));
  });

  function release(e) {
    if (!down) return;
    down = false;
    let i;
    if (moved < 5) {
      const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest('.tab');
      i = hit ? tabs.indexOf(hit) : index;
    } else {
      i = Math.round(Math.max(0, Math.min(maxPos, pos + vel * 0.05)) / 100);
    }
    bar.classList.remove('held');
    select(i);
    setTimeout(() => lens.classList.remove('lit'), 300);
  }
  tabsEl.addEventListener('pointerup', release);
  tabsEl.addEventListener('pointercancel', release);

  paint();
  addEventListener('resize', paint);
})();
