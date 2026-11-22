// 팀 탭: 내 팀 목록, 팀 만들기/참여, 초대코드, 팀원 목록과 포지션·내보내기·나가기.

import { teams as teamsApi } from '../api.js';
import {
  state,
  loadTeams,
  loadMembers,
  selectTeam,
  currentTeam,
  myRole,
  canManage,
  myMember,
} from '../store.js';
import { ROLE_LABEL, MODE_LABEL, PLAN_LABEL } from '../lib/format.js';
import {
  h,
  crest,
  badge,
  button,
  icon,
  confirmDialog,
  toast,
  emptyState,
  section,
  card,
} from '../ui.js';
import { appHeader, teamStrip, renderScreen, iconButton } from './common.js';
import { openCreateTeam, openJoinTeam } from './teamForms.js';

function inviteCodeBlock(team) {
  const code = String(team.invite_code || '');
  const grouped = `${code.slice(0, 3)} ${code.slice(3)}`.trim();

  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        const area = h('textarea', { class: 'offscreen' }, code);
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        area.remove();
      }
      toast('초대코드를 복사했습니다.', { kind: 'ok' });
    } catch {
      toast(`초대코드: ${code}`, { ms: 4000 });
    }
  }

  return h(
    'div',
    { class: 'invite-block' },
    h('span', { class: 'invite-label' }, '팀 초대코드'),
    h(
      'div',
      { class: 'invite-row' },
      h('div', { class: 'code-badge' }, grouped || '—'),
      button('복사', { kind: 'ghost', size: 'sm', iconName: 'copy', onClick: copy }),
    ),
    h('p', { class: 'invite-hint' }, '팀원은 홈 화면의 ‘초대코드로 참여’에서 이 코드를 입력합니다.'),
  );
}

function memberRow(member, { manager }) {
  const isMe = member.user_id === state.profile?.id;
  const role = ROLE_LABEL[member.role] || member.role;
  const meta = [role, member.jersey_number != null ? `#${member.jersey_number}` : null, member.position]
    .filter(Boolean)
    .join(' · ');

  const controls = [];
  if (manager && member.status === 'active') {
    const positions = [
      { value: '', label: '포지션 —' },
      { value: 'GK', label: 'GK' },
      { value: 'DF', label: 'DF' },
      { value: 'MF', label: 'MF' },
      { value: 'FW', label: 'FW' },
    ];
    controls.push(
      h(
        'select',
        {
          class: 'mini-select',
          'aria-label': `${member.display_name} 포지션`,
          onchange: async (event) => {
            const value = event.target.value || null;
            try {
              await teamsApi.setPosition(state.teamId, member.user_id, value);
              toast('포지션을 저장했습니다.', { kind: 'ok' });
              await loadMembers();
            } catch (error) {
              toast(error.message, { kind: 'error' });
              event.target.value = member.position || '';
            }
          },
        },
        ...positions.map((option) =>
          h('option', { value: option.value, selected: (member.position || '') === option.value }, option.label),
        ),
      ),
    );

    if (!isMe) {
      controls.push(
        h(
          'button',
          {
            class: 'icon-btn danger',
            type: 'button',
            'aria-label': `${member.display_name} 내보내기`,
            onclick: async () => {
              const ok = await confirmDialog({
                title: `${member.display_name}님을 내보낼까요?`,
                message: '팀 기록은 남지만 이 사람은 더 이상 팀 일정·투표·라인업을 볼 수 없습니다.',
                confirmLabel: '내보내기',
                danger: true,
              });
              if (!ok) return;
              try {
                await teamsApi.removeMember(state.teamId, member.user_id);
                toast('내보냈습니다.', { kind: 'ok' });
                await loadMembers();
                ctxRender();
              } catch (error) {
                toast(error.message, { kind: 'error', ms: 4000 });
              }
            },
          },
          icon('trash', { size: 18 }),
        ),
      );
    }
  }

  return h(
    'div',
    { class: `member-row${member.status !== 'active' ? ' is-inactive' : ''}` },
    crest(member.display_name || 'P', { size: 38 }),
    h(
      'div',
      { class: 'member-main' },
      h('span', { class: 'member-name' }, member.display_name, isMe ? h('span', { class: 'me-tag' }, '나') : null),
      h('span', { class: 'member-meta' }, meta || '멤버'),
    ),
    h(
      'div',
      { class: 'member-actions' },
      member.status !== 'active' ? badge('나감', 'muted') : null,
      ...controls,
    ),
  );
}

let ctxRender = () => {};

async function build(root, ctx) {
  ctxRender = ctx.render;
  const team = currentTeam();
  const header = appHeader({
    title: '팀',
    subtitle: team ? `${team.name} · ${MODE_LABEL[team.mode] || team.mode}` : '팀을 만들거나 참여하세요',
    right: [
      iconButton('plus', '팀 만들기', () => openCreateTeam({ onDone: () => ctx.render() })),
      iconButton('refresh', '새로고침', () => ctx.render()),
    ],
  });
  const content = h('div', { class: 'content' });
  const screen = h('div', { class: 'screen' }, header, teamStrip(() => ctx.render()), content);

  if (!state.teams.length) {
    content.appendChild(
      emptyState({
        iconName: 'team',
        title: '아직 팀이 없습니다',
        body: '팀을 만들면 6자리 초대코드가 생기고, 팀원은 그 코드로 합류합니다.',
      }),
    );
    content.appendChild(
      h(
        'div',
        { class: 'btn-row' },
        button('팀 만들기', { block: true, onClick: () => openCreateTeam({ onDone: () => ctx.render() }) }),
        button('초대코드로 참여', {
          block: true,
          kind: 'ghost',
          onClick: () => openJoinTeam({ onDone: () => ctx.render() }),
        }),
      ),
    );
    return screen;
  }

  await loadMembers(team.id);
  const manager = canManage();
  const role = myRole();

  content.appendChild(
    card(
      h(
        'div',
        { class: 'team-head' },
        crest(team.name, { size: 52, logoUrl: team.logo_url }),
        h(
          'div',
          { class: 'team-head-main' },
          h('h2', { class: 'team-name' }, team.name),
          h(
            'div',
            { class: 'team-tags' },
            badge(MODE_LABEL[team.mode] || team.mode, 'primary'),
            badge(PLAN_LABEL[team.plan] || team.plan, 'muted'),
            role ? badge(ROLE_LABEL[role], 'ok') : null,
          ),
        ),
      ),
      inviteCodeBlock(team),
    ),
  );

  const active = state.members.filter((member) => member.status === 'active');
  content.appendChild(
    section(
      `팀원 ${active.length}명`,
      manager ? h('span', { class: 'section-note' }, '포지션은 라인업 초안에 쓰입니다') : null,
      h(
        'div',
        { class: 'member-list card-tight' },
        ...state.members.map((member) => memberRow(member, { manager })),
      ),
    ),
  );

  const my = myMember();
  const otherOwners = active.filter((member) => member.role === 'owner' && member.user_id !== state.profile.id);
  const leaveBlocked = my?.role === 'owner' && otherOwners.length === 0;

  content.appendChild(
    section(
      '팀 관리',
      null,
      h(
        'div',
        { class: 'card' },
        h(
          'div',
          { class: 'list-row' },
          h(
            'div',
            { class: 'list-row-main' },
            h('span', { class: 'list-row-title' }, '다른 팀 참여'),
            h('span', { class: 'list-row-sub' }, '초대코드로 팀을 추가할 수 있습니다.'),
          ),
          button('참여', { kind: 'ghost', size: 'sm', onClick: () => openJoinTeam({ onDone: () => ctx.render() }) }),
        ),
        h(
          'div',
          { class: 'list-row' },
          h(
            'div',
            { class: 'list-row-main' },
            h('span', { class: 'list-row-title' }, '팀 나가기'),
            h(
              'span',
              { class: 'list-row-sub' },
              leaveBlocked
                ? '팀장이 한 명뿐이라 바로 나갈 수 없습니다. 계정 탈퇴를 이용하거나 다른 사람을 팀장으로 지정해 주세요.'
                : '기록은 팀에 남고, 이후 일정·투표에서 빠집니다.',
            ),
          ),
          button('나가기', {
            kind: 'danger',
            size: 'sm',
            disabled: leaveBlocked,
            onClick: async () => {
              const ok = await confirmDialog({
                title: `‘${team.name}’ 팀에서 나갈까요?`,
                message: '되돌리려면 초대코드로 다시 참여해야 합니다.',
                confirmLabel: '나가기',
                danger: true,
              });
              if (!ok) return;
              try {
                await teamsApi.leave(team.id);
                await loadTeams();
                toast('팀에서 나왔습니다.', { kind: 'ok' });
                ctx.render();
              } catch (error) {
                toast(error.message, { kind: 'error', ms: 4000 });
              }
            },
          }),
        ),
      ),
    ),
  );

  return screen;
}

export async function renderTeam(root, ctx) {
  root.classList.remove('auth-screen');
  await renderScreen(root, ctx, () => build(root, ctx));
}
