// Count picker: a bottom sheet with scroll wheels, like the iOS clock.
// openCounter({ name, unit, value, max, hasNext }) resolves to
//   { value, next: true|false }  when saved, or null when cancelled.
import { stepOf, fmtNum } from './stock.js';

const H = 40;               // height of one wheel row, matches .wheel .opt
let els = null;

function build() {
  document.body.insertAdjacentHTML('beforeend', `
    <div class="sheet-back" id="wBack" hidden></div>
    <div class="sheet" id="wSheet" role="dialog" aria-modal="true" hidden>
      <div class="grab"></div>
      <div class="sheet-head">
        <div class="sheet-title" id="wName"></div>
        <button class="link" id="wDone" style="font-weight:600">Done</button>
      </div>
      <p class="sub" id="wHint">Scroll to how much is in the store.</p>
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
      <p class="center" style="margin:4px 0 0"><button class="link" id="wToggle">Type a number instead</button></p>
      <button class="btn" data-press id="wNext">Next item</button>
    </div>`);
  const $ = id => document.getElementById(id);
  els = { back: $('wBack'), sheet: $('wSheet'), name: $('wName'), whole: $('wWhole'), frac: $('wFrac'),
          unit: $('wUnit'), unit2: $('wUnit2'), done: $('wDone'), next: $('wNext'), wheels: $('wWheels'),
          typeBox: $('wTypeBox'), type: $('wType'), toggle: $('wToggle') };
  window.AppleUI?.refresh();
}

function fill(wheel, values, label) {
  wheel.innerHTML = '<div class="pad"></div>' +
    values.map((v, i) => `<div class="opt" data-i="${i}">${label(v)}</div>`).join('') + '<div class="pad"></div>';
  wheel.values = values;
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

export function openCounter({ name, unit, value, max = 0, hasNext = false }) {
  if (!els) build();
  const step = stepOf(unit);
  const fracStep = step < 1 ? step : 0;          // .05 for kg/litres, .25 for dozen
  const wholeStep = step >= 1 ? step : 1;        // 10 for g/ml, 1 otherwise
  const v0 = Number(value) || 0;
  const top = Math.max(wholeStep * 20, Math.ceil(Math.max(max * 2, v0 + wholeStep * 5) / wholeStep) * wholeStep);
  const wholes = []; for (let v = 0; v <= top; v += wholeStep) wholes.push(v);
  const fracs = []; if (fracStep) for (let f = 0; f < 1 - 1e-9; f += fracStep) fracs.push(Math.round(f * 100) / 100);

  els.name.textContent = name;
  els.unit.textContent = els.unit2.textContent = unit;
  fill(els.whole, wholes, v => v);
  fill(els.frac, fracs, f => '.' + String(Math.round(f * 100)).padStart(2, '0'));
  els.frac.hidden = !fracStep;
  els.next.textContent = hasNext ? 'Next item' : 'Save';
  typing(false);
  els.type.value = value == null ? '' : value;

  els.back.hidden = els.sheet.hidden = false;
  requestAnimationFrame(() => {
    els.back.classList.add('on'); els.sheet.classList.add('on');
    const w = Math.floor(v0 / wholeStep + 1e-9) * wholeStep;
    setTo(els.whole, Math.round(w / wholeStep));
    if (fracStep) setTo(els.frac, Math.round((v0 - w) / fracStep) % fracs.length);
  });

  return new Promise(resolve => {
    const read = () => {
      if (!els.typeBox.hidden) {
        const t = els.type.value.trim();
        return t === '' || !(Number(t) >= 0) ? null : Number(t);
      }
      return Math.round((pick(els.whole) + (fracStep ? pick(els.frac) : 0)) * 100) / 100;
    };
    const close = result => {
      els.back.classList.remove('on'); els.sheet.classList.remove('on');
      setTimeout(() => { els.back.hidden = els.sheet.hidden = true; }, 300);
      els.back.onclick = els.done.onclick = els.next.onclick = null;
      document.removeEventListener('keydown', onKey);
      resolve(result);
    };
    const save = next => {
      const v = read();
      if (v == null) { els.type.focus(); return; }
      close({ value: v, next });
    };
    const onKey = e => { if (e.key === 'Escape') close(null); if (e.key === 'Enter') save(hasNext); };
    document.addEventListener('keydown', onKey);
    els.back.onclick = () => close(null);
    els.done.onclick = () => save(false);
    els.next.onclick = () => save(hasNext);
  });
}

function typing(on) {
  els.typeBox.hidden = !on;
  els.wheels.hidden = on;
  els.toggle.textContent = on ? 'Use the wheel instead' : 'Type a number instead';
  els.toggle.onclick = () => {
    if (!on) els.type.value = fmtNum(Math.round((pick(els.whole) + (els.frac.hidden ? 0 : pick(els.frac))) * 100) / 100).replace(/,/g, '');
    typing(!on);
    if (!on) els.type.focus();
  };
}
