// Notifications on this phone: asks permission, then saves this phone's
// push address (token) so the server can send reminders.
import { app, auth, db } from './app.js';
import { vapidKey } from './firebase-config.js';
import { getMessaging, getToken, isSupported } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging.js';
import { doc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;

async function register() {
  const reg = await navigator.serviceWorker.register('sw.js');
  const token = await getToken(getMessaging(app), { vapidKey, serviceWorkerRegistration: reg });
  if (!token) throw new Error('no token');
  await setDoc(doc(db, 'tokens', token), { uid: auth.currentUser.uid, updated: serverTimestamp(), device: navigator.userAgent.slice(0, 120) });
  return token;
}

const card = (title, text, button) => `
  <div class="group" data-sq="22" style="margin-bottom:11px">
    <div class="row">
      <div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16V11a6 6 0 1112 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 004 0"/></svg></div>
      <div class="label">${title}<small>${text}</small></div>
    </div>
  </div>${button ? `<button class="btn" data-press id="pushOn" style="margin:0 0 22px">${button}</button>` : ''}`;

// Shows a card in `box` when this phone could get notifications but does not yet.
// With { always: true } (Account page) it also shows when they are already on.
export async function offer(box, { always = false } = {}) {
  if (!vapidKey || !box) return;
  const ok = await isSupported().catch(() => false);
  if (!ok) {
    if (isIOS && !standalone)
      box.innerHTML = card('Get reminders on this iPhone', 'Tap the Share button, then "Add to Home Screen". Open the app from that icon and turn notifications on.');
    else if (always) box.innerHTML = card('Notifications', 'This browser cannot show notifications.');
    window.AppleUI?.refresh();
    return;
  }
  const perm = Notification.permission;
  if (perm === 'granted') {
    register().catch(e => console.warn('push register', e));   // keeps the address fresh
    if (always) box.innerHTML = card('Notifications are on', 'This phone gets reminders and report alerts.');
  } else if (perm === 'denied') {
    if (always) box.innerHTML = card('Notifications are blocked', 'Turn them on for this app in your phone’s Settings.');
  } else {
    box.innerHTML = card('Get reminders', 'Turn on notifications to hear about stock checks and reports.', 'Turn on notifications');
    box.querySelector('#pushOn').addEventListener('click', async e => {
      e.target.disabled = true;
      try {
        if (await Notification.requestPermission() !== 'granted') throw new Error('denied');
        await register();
        box.innerHTML = card('Notifications are on', 'This phone gets reminders and report alerts.');
      } catch (err) {
        console.warn(err);
        box.innerHTML = card('Notifications are off', 'You can turn them on later in your phone’s Settings.');
      }
      window.AppleUI?.refresh();
    });
  }
  window.AppleUI?.refresh();
}
