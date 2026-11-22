// App shell: session boot, hash router, tab bar, maintenance banner.

import './diag.js';
import { auth, getSession, ops, ApiError, clearSession } from './api.js';
import { state, reset, loadProfile, loadTeams } from './store.js';
import { renderAuth } from './views/auth.js';
import { renderHome } from './views/home.js';
import { renderTeam } from './views/team.js';
import { renderRecords } from './views/records.js';
import { renderMy } from './views/my.js';
import { h, mount, icon, toast, readPrefs, writePrefs, errorState } from './ui.js';

const TABS = [
  { id: 'home', label: '경기', icon: 'ball', render: renderHome },
  { id: 'team', label: '팀', icon: 'team', render: renderTeam },
  { id: 'records', label: '기록', icon: 'chart', render: renderRecords },
  { id: 'my', label: '마이', icon: 'user', render: renderMy },
];

const root = document.getElementById('app');
const tabbar = document.getElementById('tabbar');

let booted = false;
let rendering = false;

function currentTabId() {
  const hash = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  return TABS.some((tab) => tab.id === hash) ? hash : 'home';
}

function buildTabbar() {
  mount(
    tabbar,
    ...TABS.map((tab) =>
      h(
        'button',
        {
          class: 'tab-item',
          type: 'button',
          dataset: { tab: tab.id },
          onclick: () => {
            if (currentTabId() === tab.id) render();
            else window.location.hash = `#/${tab.id}`;
          },
        },
        icon(tab.icon, { size: 23, strokeWidth: 1.7 }),
        h('span', { class: 'tab-label' }, tab.label),
      ),
    ),
  );
}

function markTab(id) {
  for (const button of tabbar.querySelectorAll('.tab-item')) {
    button.classList.toggle('is-active', button.dataset.tab === id);
  }
}

const ctx = {
  render,
  onSignedOut: () => {
    reset();
    tabbar.hidden = true;
    window.location.hash = '';
    void boot();
  },
};

async function render() {
  if (!getSession()) {
    await boot();
    return;
  }
  if (rendering) return;
  rendering = true;
  try {
    const tab = TABS.find((item) => item.id === currentTabId()) || TABS[0];
    markTab(tab.id);
    tabbar.hidden = false;
    await tab.render(root, ctx);
  } catch (error) {
    if (error instanceof ApiError && error.isAuthError) {
      toast('로그인 정보가 만료되었습니다. 다시 로그인해 주세요.', { kind: 'error', ms: 4200 });
      ctx.onSignedOut();
    } else {
      mount(
        root,
        h('div', { class: 'screen' }, h('div', { class: 'content' }, errorState(error, () => render()))),
      );
      toast(error?.message || '화면을 그리지 못했습니다.', { kind: 'error' });
    }
  } finally {
    rendering = false;
  }
}

function maintenanceBanner(config) {
  if (!config?.maintenance_mode) return null;
  const until = config.maintenance_until ? new Date(config.maintenance_until).getTime() : null;
  if (until && until < Date.now()) return null;
  return h(
    'div',
    { class: 'maintenance' },
    icon('info', { size: 18 }),
    h('span', null, config.maintenance_message || '지금은 점검 중입니다. 일부 기능이 잠시 제한될 수 있습니다.'),
  );
}

function installHint() {
  const prefs = readPrefs();
  const standalone =
    window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  if (standalone || prefs.installHintDismissed) return null;
  const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent);
  if (!isIos) return null;
  return h(
    'div',
    { class: 'install-hint' },
    h('span', null, 'Safari 공유 → [홈 화면에 추가]를 누르면 앱처럼 전체 화면으로 열립니다.'),
    h(
      'button',
      {
        class: 'icon-btn',
        type: 'button',
        'aria-label': '설치 안내 닫기',
        onclick: (event) => {
          writePrefs({ installHintDismissed: true });
          event.currentTarget.parentElement.remove();
        },
      },
      icon('x', { size: 16 }),
    ),
  );
}

async function boot() {
  booted = true;
  tabbar.hidden = true;
  mount(
    root,
    h(
      'div',
      { class: 'boot' },
      h('div', { class: 'boot-logo' }, icon('ball', { size: 30 })),
      h('p', null, 'JOKBAL.L'),
    ),
  );

  const session = getSession();
  if (!session) {
    renderAuth(root, { onSignedIn: onSignedIn });
    return;
  }

  try {
    await auth.me();
    state.profile = await loadProfile();
    await loadTeams();
    buildTabbar();
    const config = await ops.config().catch(() => null);
    state.config = config;
    const banner = maintenanceBanner(config);
    if (banner) document.body.prepend(banner);
    const hint = installHint();
    if (hint) document.body.append(hint);
    if (!window.location.hash) window.location.hash = '#/home';
    await render();
    setupServiceWorker();
  } catch (error) {
    if (error instanceof ApiError && (error.isAuthError || error.status === 403)) {
      clearSession();
      renderAuth(root, { onSignedIn: onSignedIn });
      return;
    }
    mount(
      root,
      h(
        'div',
        { class: 'boot' },
        h('div', { class: 'boot-logo' }, icon('ball', { size: 30 })),
        h('p', null, '서버에 연결하지 못했습니다.'),
        h('p', { class: 'muted small' }, error?.message || ''),
        h(
          'button',
          { class: 'btn btn-primary', type: 'button', onclick: () => boot() },
          '다시 시도',
        ),
      ),
    );
  }
}

async function onSignedIn() {
  try {
    state.profile = await loadProfile();
    await loadTeams();
    buildTabbar();
    window.location.hash = '#/home';
    await render();
    setupServiceWorker();
  } catch (error) {
    toast(error?.message || '로그인 후 정보를 불러오지 못했습니다.', { kind: 'error', ms: 4200 });
    renderAuth(root, { onSignedIn });
  }
}

function setupServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:') return;
  navigator.serviceWorker.register(new URL('../sw.js', import.meta.url), { scope: './' }).catch(() => {
    /* offline shell is a bonus, never a blocker */
  });
}

window.addEventListener('hashchange', () => {
  if (!booted) return;
  if (!getSession()) {
    void boot();
    return;
  }
  void render();
});

document.addEventListener('visibilitychange', () => {
  // A phone tab can sit for hours: refresh the token and redraw on return so a
  // stale access token never shows up as an empty list.
  if (document.visibilityState === 'visible' && getSession() && booted) void render();
});

void boot();
