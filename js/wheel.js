// Counting sheet: slides up once and stays open while the checker goes
// through the items, like the iOS clock picker.
//   countSheet({ lines, index, values, onSave })
//     lines   [{ id, name, unit, need }]
//     index   item to start on
//     values  { itemId: number } already counted
//     onSave  (line, value) => void, called every time a number is kept
// Next keeps the number and slides in the next item. Back goes to the previous
// one. Finish (last item) or Done (top right) keeps the number and closes.
// Tapping outside closes without keeping the item on screen.
import { stepOf, fmtNum } from './stock.js';

const H = 40;               // height of one wheel row, matches .wheel .opt
let els = null, hideTimer = null;

function build() {
  document.body.insertAdjacentHTML('beforeend', `
    <div class="sheet-back" id="wBack" hidden></div>
    <div class="sheet" id="wSheet" role="dialog" aria-modal="true" hidden>
      <div class="grab"></div>
      <div class="sheet-head">
        <div class="sheet-title" id="wName"></div>
        <button class="link" id="wDone" style="font-weight:600">Done</button>
      </div>
      <p class="sub" id="wPos" style="margin-bottom:2px"></p>
      <div id="wBody">
        <div class="wheels" id="wWheels">
          <div class="wheel-band"></div>
          <div class="wheel whole" id="wWhole"></div>
          <div class="wheel frac" id="wFrac"></div>
          <div class="wheel-unit" id="wUnit"></div>
        </div>
        <div id="wTypeBox" hidden>
          <div class="group plain" style="margin:10px 0">
            <div class="row"><input class="field right big-num" id="wType" type="number" inputmode="decimal" min="0" step="any" placeholder="0"><span class="unit" id="wUnit2"></span></div>
          </div>
        </div>
      </div>
      <p class="center" style="margin:4px 0 0"><button class="link" id="wToggle">Type a number instead</button></p>
      <div class="sheet-nav">
        <button class="btn frost" data-press id="wPrev">Back</button>
        <button class="btn" data-press id="wNext">Next</button>
      </div>
    </div>`);
  const $ = id => document.getElementById(id);
  els = { back: $('wBack'), sheet: $('wSheet'), name: $('wName'), pos: $('wPos'), body: $('wBody'),
          whole: $('wWhole'), frac: $('wFrac'), unit: $('wUnit'), unit2: $('wUnit2'), done: $('wDone'),
          next: $('wNext'), prev: $('wPrev'), wheels: $('wWheels'), typeBox: $('wTypeBox'), type: $('wType'), toggle: $('wToggle') };
  window.AppleUI?.refresh();
}

function fill(wheel, values, label) {
  wheel.innerHTML = '<div class="pad"></div>' +
    values.map((v, i) => `<div class="opt" data-i="${i}">${label(v)}</div>`).join('') + '<div class="pad"></div>';
  wheel.values = values;
  wheel.cur = -1;
  const mark = () => {
    const i = Math.max(0, Math.min(values.length - 1, Math.round(wheel.scrollTop / H)));
    if (wheel.cur === i) return;
    wheel.cur = i;
    wheel.querySelectorAll('.opt.on').forEach(o => o.classList.remove('on'));
    wheel.children[i + 1]?.classList.add('on');
    if (navigator.vibrate) navigator.vibrate(3);
  };
  wheel.onscroll = () => requestAnimationFrame(mark);
  wheel.onclick = e => {
    const o = e.target.closest('.opt');
    if (o) wheel.scrollTo({ top: +o.dataset.i * H, behavior: 'smooth' });
  };
  wheel.mark = mark;
}
const pick = w => w.values[Math.max(0, Math.min(w.values.length - 1, Math.round(w.scrollTop / H)))];
function setTo(w, idx) { w.cur = -1; w.scrollTop = idx * H; w.mark(); }

export function countSheet({ lines, index = 0, values = {}, onSave }) {
  if (!els) build();
  clearTimeout(hideTimer);                 // a sheet that was closing must not hide this one
  let i = index, typing = false, step = 1, fracStep = 0, wholeStep = 1;

  function setTyping(on) {
    typing = on;
    els.typeBox.hidden = !on; els.wheels.hidden = on;
    els.toggle.textContent = on ? 'Use the wheel instead' : 'Type a number instead';
  }
  function read() {
    if (typing) {
      const t = els.type.value.trim();
      return t === '' || !(Number(t) >= 0) ? null : Number(t);
    }
    return Math.round((pick(els.whole) + (fracStep ? pick(els.frac) : 0)) * 100) / 100;
  }
  function show(n, dir) {
    i = n;
    const l = lines[i], v0 = Number(values[l.id]) || 0;
    step = stepOf(l.unit);
    fracStep = step < 1 ? step : 0;            // .05 for kg/litres, .25 for dozen
    wholeStep = step >= 1 ? step : 1;          // 10 for g/ml, 1 otherwise
    const top = Math.max(wholeStep * 20, Math.ceil(Math.max((l.need || 0) * 2, v0 + wholeStep * 5) / wholeStep) * wholeStep);
    const wholes = []; for (let v = 0; v <= top; v += wholeStep) wholes.push(v);
    const fracs = []; if (fracStep) for (let f = 0; f < 1 - 1e-9; f += fracStep) fracs.push(Math.round(f * 100) / 100);

    els.name.textContent = l.name;
    els.pos.textContent = `${i + 1} of ${lines.length} · ${values[l.id] != null ? 'counted ' + fmtNum(values[l.id]) + ' ' + l.unit : 'not counted yet'}`;
    els.unit.textContent = els.unit2.textContent = l.unit;
    fill(els.whole, wholes, v => v);
    fill(els.frac, fracs, f => '.' + String(Math.round(f * 100)).padStart(2, '0'));
    els.frac.hidden = !fracStep;
    els.type.value = values[l.id] ?? '';
    els.prev.disabled = i === 0;
    els.next.textContent = i === lines.length - 1 ? 'Finish' : 'Next';
    if (dir) {                                 // slide the new item in
      els.body.classList.remove('slide-l', 'slide-r'); void els.body.offsetWidth;
      els.body.classList.add(dir > 0 ? 'slide-l' : 'slide-r');
    }
    requestAnimationFrame(() => {
      const w = Math.floor(v0 / wholeStep + 1e-9) * wholeStep;
      setTo(els.whole, Math.round(w / wholeStep));
      if (fracStep) setTo(els.frac, Math.round((v0 - w) / fracStep) % fracs.length);
    });
    if (typing) els.type.focus();
  }
  // keeps the number on screen; an empty box just skips this item for now
  function keep() {
    const v = read();
    if (v == null) {
      if (typing && els.type.value.trim() !== '') { els.type.focus(); return false; }   // not a number
      return true;
    }
    values[lines[i].id] = v;
    onSave?.(lines[i], v);
    return true;
  }

  return new Promise(resolve => {
    function close() {
      els.back.classList.remove('on'); els.sheet.classList.remove('on');
      hideTimer = setTimeout(() => { els.back.hidden = els.sheet.hidden = true; }, 300);
      els.back.onclick = els.done.onclick = els.next.onclick = els.prev.onclick = els.toggle.onclick = null;
      document.removeEventListener('keydown', onKey);
      resolve();
    }
    const next = () => { if (!keep()) return; i < lines.length - 1 ? show(i + 1, 1) : close(); };
    const onKey = e => { if (e.key === 'Escape') close(); if (e.key === 'Enter') next(); };
    document.addEventListener('keydown', onKey);
    els.back.onclick = close;
    els.done.onclick = () => { if (keep()) close(); };
    els.next.onclick = next;
    els.prev.onclick = () => { if (i > 0 && keep()) show(i - 1, -1); };
    // Back works even when this item has no number yet
    els.toggle.onclick = () => {
      if (!typing) els.type.value = String(read() ?? '');
      setTyping(!typing);
      if (typing) els.type.focus();
    };

    setTyping(false);
    els.back.hidden = els.sheet.hidden = false;
    show(i);
    requestAnimationFrame(() => { els.back.classList.add('on'); els.sheet.classList.add('on'); });
  });
}
