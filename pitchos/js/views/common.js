// 화면 공통 조각: 상단 앱바, 팀 스위처, 로딩/에러 래퍼.

import { h, crest, icon, openSheet, emptyState } from '../ui.js';
import { state, currentTeam, selectTeam } from '../store.js';
import { MODE_LABEL, PLAN_LABEL } from '../lib/format.js';
import { openCreateTeam, openJoinTeam } from './teamForms.js';

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

export function iconButton(iconName, label, onclick) {
  return h(
    'button',
    { class: 'icon-btn', type: 'button', 'aria-label': label, onclick },
    icon(iconName, { size: 19 }),
  );
}

export function teamSubtitle(team = currentTeam()) {
  if (!team) return null;
  return `${team.name} · ${MODE_LABEL[team.mode] || team.mode}`;
}

/** 상단 팀 스위처 칩. 누르면 팀 전환·팀 만들기·참여 시트가 열린다. */
export function teamSwitcher(onChange) {
  const team = currentTeam();
  if (!team) return null;
  return h(
    'button',
    {
      class: 'team-switcher',
      type: 'button',
      'aria-label': `현재 팀 ${team.name}, 팀 변경`,
      onclick: () => openTeamSwitcher(onChange),
    },
    crest(team.name, { size: 30, logoUrl: team.logo_url }),
    h('span', { class: 'team-switcher-name' }, team.name),
    icon('chevronDown', { size: 16, className: 'chev' }),
  );
}

export function openTeamSwitcher(onChange) {
  openSheet({
    title: '팀 선택',
    subtitle: state.teams.length > 1 ? '전환할 팀을 고르세요.' : '팀을 추가하거나 새로 만들 수 있습니다.',
    render: (body, { close }) => {
      body.appendChild(
        h(
          'div',
          { class: 'stack' },
          h(
            'div',
            { class: 'stack' },
            ...state.teams.map((team) =>
              h(
                'button',
                {
                  class: `team-option${team.id === state.teamId ? ' is-active' : ''}`,
                  type: 'button',
                  onclick: () => {
                    close();
                    if (team.id === state.teamId) return;
                    selectTeam(team.id);
                    onChange?.();
                  },
                },
                crest(team.name, { size: 38, logoUrl: team.logo_url }),
                h(
                  'div',
                  { class: 'team-option-main' },
                  h('span', { class: 'team-option-name' }, team.name),
                  h(
                    'span',
                    { class: 'team-option-sub' },
                    `${MODE_LABEL[team.mode] || team.mode} · ${PLAN_LABEL[team.plan] || team.plan || '무료'} 플랜`,
                  ),
                ),
                team.id === state.teamId ? icon('check', { size: 18 }) : null,
              ),
            ),
          ),
          h('hr', { class: 'hairline' }),
          h(
            'div',
            { class: 'stack' },
            h(
              'button',
              {
                class: 'list-row',
                type: 'button',
                style: { borderRadius: '13px', border: '1px solid var(--line)' },
                onclick: () => {
                  close();
                  openCreateTeam({ onDone: () => onChange?.() });
                },
              },
              h('span', { class: 'list-row-icon' }, icon('plus', { size: 17 })),
              h('div', { class: 'list-row-main' }, h('span', { class: 'list-row-title' }, '팀 만들기')),
              icon('chevron', { size: 17, className: 'chev' }),
            ),
            h(
              'button',
              {
                class: 'list-row',
                type: 'button',
                style: { borderRadius: '13px', border: '1px solid var(--line)' },
                onclick: () => {
                  close();
                  openJoinTeam({ onDone: () => onChange?.() });
                },
              },
              h('span', { class: 'list-row-icon' }, icon('key', { size: 17 })),
              h('div', { class: 'list-row-main' }, h('span', { class: 'list-row-title' }, '초대코드로 참여')),
              icon('chevron', { size: 17, className: 'chev' }),
            ),
          ),
        ),
      );
    },
  });
}

/** 팀이 하나도 없을 때 보여 주는 큰 빈 상태 + CTA 두 개. */
export function noTeamState({ iconName = 'whistle', title, body, onDone }) {
  return h(
    'div',
    { class: 'stack' },
    emptyState({ iconName, title, body }),
    h(
      'div',
      { class: 'btn-row' },
      h(
        'button',
        { class: 'btn btn-primary btn-lg btn-block', type: 'button', onclick: () => openCreateTeam({ onDone }) },
        icon('plus', { size: 18 }),
        '팀 만들기',
      ),
      h(
        'button',
        { class: 'btn btn-ghost btn-lg btn-block', type: 'button', onclick: () => openJoinTeam({ onDone }) },
        icon('key', { size: 18 }),
        '초대코드로 참여',
      ),
    ),
  );
}

/** Build a screen element and swap it in, with a spinner and an error retry. */
export async function renderScreen(root, ctx, build) {
  root.replaceChildren(
    h(
      'div',
      { class: 'screen' },
      h('div', { class: 'spinner-wrap' }, h('div', { class: 'spinner' }), h('p', null, '불러오는 중…')),
    ),
  );
  const retry = () => renderScreen(root, ctx, build);
  try {
    const screen = await build();
    root.replaceChildren(screen);
    try {
      window.scrollTo({ top: 0 });
    } catch {
      /* some embedded webviews have no scrollTo */
    }
    return screen;
  } catch (error) {
    root.replaceChildren(
      h(
        'div',
        { class: 'screen' },
        h(
          'div',
          { class: 'content' },
          h(
            'div',
            { class: 'empty' },
            h('div', { class: 'empty-icon danger' }, icon('alert', { size: 25 })),
            h('p', { class: 'empty-title' }, '불러오지 못했습니다'),
            h('p', { class: 'empty-body' }, error?.message || '잠시 뒤 다시 시도해 주세요.'),
            h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: retry }, '다시 시도'),
          ),
        ),
      ),
    );
    return null;
  }
}
