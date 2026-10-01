// Runs first on every logged-in page, before the UI kit. It draws the tab bar
// straight away using the role remembered on this phone, so the page does not
// wait for the internet. app.js double-checks the login in the background.
// Usage: <script src="js/shell.js" data-tab="today"></script> then apple-ui.js
(function () {
  var tab = document.currentScript && document.currentScript.dataset.tab;
  var me = null;
  try { me = JSON.parse(localStorage.getItem('me') || 'null'); } catch (e) {}
  window.__me = me;

  // keep the app's files on the phone, and handle notifications
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
  if (!me || !tab) return;

  var ICONS = {
    today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
    items: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2"/><circle cx="4.5" cy="12" r="1.2"/><circle cx="4.5" cy="18" r="1.2"/></svg>',
    groups: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.4 5.3 5.6.6-4.2 3.9 1.2 5.7L12 15.7 6.9 18.5l1.2-5.7L4 8.9l5.6-.6z"/></svg>',
    account: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="8" r="3.4"/><path d="M5 20c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5"/></svg>'
  };
  var TABS = me.role === 'admin'
    ? [['today', 'Today', 'today.html'], ['items', 'Items', 'items.html'], ['groups', 'Groups', 'groups.html'], ['account', 'Account', 'account.html']]
    : [['today', 'Today', 'today.html'], ['account', 'Account', 'account.html']];

  document.write(
    '<div class="scrim"></div><div class="dock"><nav class="bar" id="bar">' +
    '<div class="bar__glass"></div><div class="bar__sheen"></div>' +
    '<svg class="bar__edge" id="edge" preserveAspectRatio="none"><defs><linearGradient id="rimgrad" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="var(--rim-hot)"/><stop offset="0.26" stop-color="var(--rim-cool)"/>' +
    '<stop offset="0.49" stop-color="transparent"/><stop offset="0.73" stop-color="var(--rim-cool)"/>' +
    '<stop offset="1" stop-color="var(--rim-hot)"/></linearGradient></defs><path id="edgePath" stroke="url(#rimgrad)"/></svg>' +
    '<div class="tabs" id="tabs"><div class="lens" id="lens" style="width:' + (100 / TABS.length) + '%"></div>' +
    TABS.map(function (t) { return '<button class="tab' + (t[0] === tab ? ' on' : '') + '">' + ICONS[t[0]] + '<span class="t">' + t[1] + '</span></button>'; }).join('') +
    '</div></nav></div>');
  // Go to the tab's page. The kit only reports a *different* tab, so on a
  // sub-page (e.g. a group) tapping the lit tab would do nothing; checking
  // after every tap means it takes you back to that section's main page.
  var here = location.pathname.split('/').pop() || 'index.html', leaving = false;
  function go(i) {
    var target = TABS[i] && TABS[i][2];
    if (!target || leaving || target === here) return;
    leaving = true;
    location.href = target;
  }
  document.getElementById('bar').addEventListener('tabchange', function (e) { go(e.detail.index); });
  var tabsEl = document.getElementById('tabs');
  ['pointerup', 'pointercancel'].forEach(function (ev) {
    tabsEl.addEventListener(ev, function () {
      setTimeout(function () {                      // after the kit has picked the tab
        var all = tabsEl.querySelectorAll('.tab');
        for (var i = 0; i < all.length; i++) if (all[i].classList.contains('on')) return go(i);
      }, 0);
    });
  });
  // coming back with the browser's back button: allow leaving again
  addEventListener('pageshow', function () { leaving = false; });
})();
