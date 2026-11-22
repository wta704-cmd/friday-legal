// Bits shared by the tab screens: the app bar, the team switcher, and the
// loading/error wrapper every screen uses.

import { h, crest, mount, spinner, errorState, icon } from '../ui.js';
import { state, currentTeam, selectTeam } from '../store.js';
import { MODE_LABEL } from '../lib/format.js';

export function appHeader({ title, subtitle = null, right = [] }) {
  return h(
    'header',
    { class: 'appbar' },
    h(
      'div',
      { class: 'appbar-main' },
      subtitle ? h('p', { class: 'appbar-sub' }, subtitle) : null,
      h('h1', { class: 'appbar-title' }, title),
    ),
    h('div', { class: 'appbar-actions' }, ...right.filter(Boolean)),
  );
}

export function teamStrip(onSelect) {
  if (state.teams.length <= 1) return null;
  return h(
    'div',
    { class: 'team-strip' },
    ...state.teams.map((team) =>
      h(
        'button',
        {
          class: `team-chip${team.id === state.teamId ? ' is-active' : ''}`,
          type: 'button',
          onclick: () => {
            if (team.id === state.teamId) return;
            selectTeam(team.id);
            onSelect?.();
          },
        },
        crest(team.name, { size: 22, logoUrl: team.logo_url }),
        h('span', null, team.name),
      ),
    ),
  );
}

export function teamMode(team = currentTeam()) {
  if (!team) return null;
  return MODE_LABEL[team.mode] || team.mode;
}

/** Build a screen element and swap it in, with a spinner and an error retry. */
export async function renderScreen(root, ctx, build) {
  mount(root, spinner());
  const retry = () => renderScreen(root, ctx, build);
  try {
    const screen = await build();
    mount(root, screen);
    try {
      window.scrollTo({ top: 0 });
    } catch {
      /* jsdom and some embedded webviews have no scrollTo */
    }
    return screen;
  } catch (error) {
    mount(root, h('div', { class: 'screen' }, h('div', { class: 'content' }, errorState(error, retry))));
    return null;
  }
}

export function iconButton(iconName, label, onclick) {
  return h(
    'button',
    { class: 'icon-btn', type: 'button', 'aria-label': label, onclick },
    icon(iconName, { size: 20 }),
  );
}
