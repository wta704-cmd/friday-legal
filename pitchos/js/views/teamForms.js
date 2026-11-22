// 팀 만들기 / 초대코드 참여 sheets, used from both the 팀 tab and the empty 홈.

import { teams as teamsApi } from '../api.js';
import { loadTeams, selectTeam } from '../store.js';
import { h, input, select, button, openSheet, toast } from '../ui.js';

export function openCreateTeam({ onDone } = {}) {
  const name = input({
    label: '팀 이름',
    placeholder: '예: 강남 FC',
    maxlength: 30,
    hint: '1~30자. 팀 목록과 초대 화면에 표시됩니다.',
    required: true,
  });
  const mode = select({
    label: '종목',
    value: 'futsal',
    options: [
      { value: 'futsal', label: '풋살 (5:5)' },
      { value: 'soccer', label: '축구 (11:11)' },
    ],
    hint: '종목에 따라 속도 기준과 라인업 인원이 달라집니다.',
  });

  const sheet = openSheet({
    title: '팀 만들기',
    subtitle: '만든 사람이 팀장이 되고 6자리 초대코드가 생깁니다.',
    render: (body) => {
      body.appendChild(
        h(
          'div',
          { class: 'stack' },
          name.el,
          mode.el,
          button('팀 만들기', {
            block: true,
            onClick: async (event) => {
              const target = event.currentTarget;
              const value = name.value.trim();
              if (!value) {
                toast('팀 이름을 입력해 주세요.', { kind: 'error' });
                return;
              }
              target.disabled = true;
              try {
                const teamId = await teamsApi.create(value, mode.value);
                await loadTeams();
                selectTeam(teamId);
                toast('팀을 만들었습니다.', { kind: 'ok' });
                sheet.close();
                onDone?.(teamId);
              } catch (error) {
                toast(error.message, { kind: 'error', ms: 4000 });
              } finally {
                target.disabled = false;
              }
            },
          }),
        ),
      );
    },
  });
  return sheet;
}

export function openJoinTeam({ onDone } = {}) {
  const code = input({
    label: '초대코드 6자리',
    placeholder: 'ABC123',
    maxlength: 6,
    inputmode: 'text',
    autocomplete: 'off',
    hint: '팀장에게 받은 코드를 입력하세요. 대소문자는 구분하지 않습니다.',
    required: true,
  });
  code.input.classList.add('code-input');
  code.input.addEventListener('input', () => {
    code.input.value = code.input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  });

  const sheet = openSheet({
    title: '초대코드로 참여',
    subtitle: '팀원으로 합류합니다.',
    render: (body) => {
      body.appendChild(
        h(
          'div',
          { class: 'stack' },
          code.el,
          button('참여하기', {
            block: true,
            onClick: async (event) => {
              const target = event.currentTarget;
              const value = code.value.trim().toUpperCase();
              if (value.length !== 6) {
                toast('초대코드는 6자리입니다.', { kind: 'error' });
                return;
              }
              target.disabled = true;
              try {
                const teamId = await teamsApi.join(value);
                await loadTeams();
                selectTeam(teamId);
                toast('팀에 참여했습니다.', { kind: 'ok' });
                sheet.close();
                onDone?.(teamId);
              } catch (error) {
                toast(error.message, { kind: 'error', ms: 4000 });
              } finally {
                target.disabled = false;
              }
            },
          }),
        ),
      );
    },
  });
  return sheet;
}
