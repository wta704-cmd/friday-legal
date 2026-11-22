// 팀 탭: 팀 배너, 초대코드, 포지션 필터, 팀원 목록과 관리.

import { teams as teamsApi } from '../api.js';
import {
  state,
  loadTeams,
  loadMembers,
  currentTeam,
  myRole,
  canManage,
  myMember,
} from '../store.js';
import { ROLE_LABEL, MODE_LABEL, PLAN_LABEL } from '../lib/format.js';
import { h, crest, badge, button, icon, openSheet, confirmDialog, toast, section, list } from '../ui.js';
import { appHeader, teamSwitcher, renderScreen, iconButton, noTeamState } from './common.js';
import { openCreateTeam, openJoinTeam } from './teamForms.js';

const POSITIONS = ['GK', 'DF', 'MF', 'FW'];

async function copyInvite(team) {
  const code = String(team.invite_code || '');
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

function inviteCard(team) {
  const code = String(team.invite_code || '');
  const grouped = `${code.slice(0, 3)} ${code.slice(3)}`.trim();
  return h(
    'div',
    { class: 'stack', style: { gap: '7px' } },
    h(
      'div',
      { class: 'invite' },
      h('span', { class: 'list-row-icon', style: { background: '#fff' } }, icon('key', { size: 17 })),
      h(
        'div',
        { class: 'invite-main' },
        h('span', { class: 'invite-label' }, '팀 초대코드'),
        h('span', { class: 'invite-code' }, grouped || '—'),
      ),
      button('복사', { kind: 'ghost', size: 'sm', iconName: 'copy', onClick: () => copyInvite(team) }),
    ),
    h('p', { class: 'invite-hint' }, '팀원은 홈의 ‘초대코드로 참여’에서 이 코드를 입력합니다.'),
  );
}

function positionSheet(member, { onChanged }) {
  openSheet({
    title: member.display_name,
    subtitle: `${ROLE_LABEL[member.role] || member.role}${member.jersey_number != null ? ` · #${member.jersey_number}` : ''}`,
    render: (body, { close }) => {
      let current = member.position || null;
      const grid = h('div', { class: 'vote-seg', style: { gridTemplateColumns: 'repeat(4, 1fr)' } });
      function draw() {
        grid.replaceChildren(
          ...POSITIONS.map((position) =>
            h(
              'button',
              {
                class: `vote-btn${current === position ? ' is-active vote-ok' : ''}`,
                type: 'button',
                style: { height: '46px' },
                onclick: () => {
                  current = current === position ? null : position;
                  draw();
                },
              },
              position,
            ),
          ),
        );
      }
      draw();

      body.appendChild(
        h(
          'div',
          { class: 'stack' },
          h('div', { class: 'field' }, h('span', { class: 'field-label' }, '포지션'), grid),
          h('p', { class: 'hint-box' }, '포지션은 라인업 자동 배분에 쓰입니다. 다시 누르면 비웁니다.'),
          button('포지션 저장', {
            block: true,
            size: 'lg',
            onClick: async (event) => {
              const target = event.currentTarget;
              target.disabled = true;
              try {
                await teamsApi.setPosition(state.teamId, member.user_id, current);
                toast('포지션을 저장했습니다.', { kind: 'ok' });
                close();
                await onChanged?.();
              } catch (error) {
                toast(error.message, { kind: 'error' });
              } finally {
                target.disabled = false;
              }
            },
          }),
          member.user_id !== state.profile?.id
            ? button('팀에서 내보내기', {
                block: true,
                kind: 'danger',
                iconName: 'trash',
                onClick: async () => {
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
                    close();
                    await onChanged?.();
                  } catch (error) {
                    toast(error.message, { kind: 'error', ms: 4000 });
                  }
                },
              })
            : null,
        ),
      );
    },
  });
}

function memberRow(member, { manager, onChanged }) {
  const isMe = member.user_id === state.profile?.id;
  const role = ROLE_LABEL[member.role] || member.role;
  const meta = [role, member.jersey_number != null ? `#${member.jersey_number}` : null].filter(Boolean).join(' · ');
  const clickable = manager && member.status === 'active';
  const tag = clickable ? 'button' : 'div';
  return h(
    tag,
    {
      class: `member-row${member.status !== 'active' ? ' is-inactive' : ''}`,
      type: clickable ? 'button' : null,
      onclick: clickable ? () => positionSheet(member, { onChanged }) : null,
    },
    crest(member.display_name || 'P', { size: 40, tone: 'avatar' }),
    h(
      'div',
      { class: 'member-main' },
      h(
        'span',
        { class: 'member-name' },
        member.display_name,
        isMe ? h('span', { class: 'me-tag' }, '나') : null,
        member.role === 'owner' ? badge('팀장', 'primary') : member.role === 'manager' ? badge('매니저', 'muted') : null,
      ),
      h('span', { class: 'member-meta' }, meta || '멤버'),
    ),
    h(
      'div',
      { class: 'member-tags' },
      member.status !== 'active' ? badge('나감', 'muted') : null,
      member.position ? h('span', { class: `pos-badge ${member.position}` }, member.position) : h('span', { class: 'pos-badge' }, '—'),
      clickable ? icon('chevron', { size: 16, className: 'chev' }) : null,
    ),
  );
}

async function build(root, ctx) {
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
  const screen = h('div', { class: 'screen' }, header, content);

  if (!state.teams.length) {
    content.appendChild(
      noTeamState({
        iconName: 'team',
        title: '아직 팀이 없습니다',
        body: '팀을 만들면 6자리 초대코드가 생기고, 팀원은 그 코드로 합류합니다.',
        onDone: () => ctx.render(),
      }),
    );
    return screen;
  }

  content.appendChild(teamSwitcher(() => ctx.render()));
  await loadMembers(team.id);
  const manager = canManage();
  const role = myRole();
  const active = state.members.filter((member) => member.status === 'active');

  content.appendChild(
    h(
      'div',
      { class: 'team-banner' },
      crest(team.name, { size: 56, logoUrl: team.logo_url }),
      h(
        'div',
        { class: 'team-banner-main' },
        h('h2', { class: 'team-banner-name' }, team.name),
        h(
          'div',
          { class: 'team-banner-tags' },
          badge(MODE_LABEL[team.mode] || team.mode),
          badge(`${PLAN_LABEL[team.plan] || team.plan || '무료'} 플랜`),
          role ? badge(ROLE_LABEL[role]) : null,
        ),
      ),
      h('div', { class: 'team-banner-count' }, h('b', null, String(active.length)), h('span', null, '명')),
    ),
  );

  content.appendChild(inviteCard(team));

  let filter = 'ALL';
  const chipRow = h('div', { class: 'chip-row' });
  const listHolder = h('div', { class: 'list' });

  function drawChips() {
    const pools = {
      ALL: active.length,
      GK: active.filter((member) => member.position === 'GK').length,
      DF: active.filter((member) => member.position === 'DF').length,
      MF: active.filter((member) => member.position === 'MF').length,
      FW: active.filter((member) => member.position === 'FW').length,
    };
    chipRow.replaceChildren(
      ...[['ALL', '전체'], ...POSITIONS.map((position) => [position, position])].map(([value, label]) =>
        h(
          'button',
          {
            class: `chip${filter === value ? ' is-active' : ''}`,
            type: 'button',
            onclick: () => {
              filter = value;
              drawChips();
              drawList();
            },
          },
          label,
          h('span', { class: 'chip-count' }, String(pools[value])),
        ),
      ),
    );
  }

  function drawList() {
    const rows = state.members.filter(
      (member) =>
        filter === 'ALL' ||
        (member.position === filter && member.status === 'active'),
    );
    listHolder.replaceChildren(
      ...(rows.length
        ? rows.map((member) => memberRow(member, { manager, onChanged: async () => {
            await loadMembers(team.id);
            drawChips();
            drawList();
          } }))
        : [h('p', { class: 'muted small pad' }, filter === 'ALL' ? '팀원이 없습니다.' : `${filter} 포지션 팀원이 없습니다.`)]),
    );
  }

  drawChips();
  drawList();

  content.appendChild(
    section(
      `팀원 ${active.length}명`,
      manager ? h('span', { class: 'section-note' }, '팀원을 눌러 포지션 변경') : null,
      chipRow,
      listHolder,
    ),
  );

  const my = myMember();
  const otherOwners = active.filter((member) => member.role === 'owner' && member.user_id !== state.profile.id);
  const leaveBlocked = my?.role === 'owner' && otherOwners.length === 0;

  content.appendChild(
    section(
      '팀 관리',
      null,
      list([
        {
          iconName: 'key',
          title: '다른 팀 참여',
          sub: '초대코드로 팀을 추가할 수 있습니다.',
          onClick: () => openJoinTeam({ onDone: () => ctx.render() }),
        },
        {
          iconName: 'logout',
          tone: 'red',
          title: '팀 나가기',
          sub: leaveBlocked
            ? '팀장이 한 명뿐이라 바로 나갈 수 없습니다. 다른 사람을 팀장으로 지정해 주세요.'
            : '기록은 팀에 남고, 이후 일정·투표에서 빠집니다.',
          onClick: leaveBlocked
            ? null
            : async () => {
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
        },
      ]),
    ),
  );

  content.appendChild(
    h(
      'p',
      { class: 'foot-note' },
      '포지션은 라인업 자동 배분에 쓰입니다. 팀장·매니저는 팀원을 눌러 포지션을 바꾸거나 내보낼 수 있습니다.',
    ),
  );

  return screen;
}

export async function renderTeam(root, ctx) {
  root.classList.remove('auth-screen');
  await renderScreen(root, ctx, () => build(root, ctx));
}
