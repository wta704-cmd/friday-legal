// 로그인 / 회원가입. 이메일 로그인만 실제로 동작하고, 소셜 4종은 콘솔 키가
// 아직 없어서 안내만 한다. 회원가입은 바텀시트에서 약관 3종과 함께 처리한다.

import { auth } from '../api.js';
import { APP_VERSION } from '../config.js';
import {
  h,
  input,
  checkbox,
  button,
  openSheet,
  toast,
  icon,
  mount,
} from '../ui.js';

const PROVIDERS = [
  { id: 'kakao', label: '카카오', className: 'kakao' },
  { id: 'naver', label: '네이버', className: 'naver' },
  { id: 'google', label: '구글', className: 'google' },
  { id: 'apple', label: 'Apple', className: 'apple' },
];

export function openLegal(name, title) {
  openSheet({
    title,
    render: async (body) => {
      body.appendChild(h('div', { class: 'legal-loading' }, '문서를 불러오는 중…'));
      try {
        const url = new URL(`../legal/${name}.html`, import.meta.url);
        const response = await fetch(url, { cache: 'no-cache' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const htmlText = await response.text();
        body.replaceChildren();
        const wrapper = document.createElement('div');
        wrapper.innerHTML = htmlText;
        wrapper.addEventListener('click', (event) => {
          const link = event.target.closest('a[href$="privacy.html"]');
          if (!link) return;
          event.preventDefault();
          openLegal('privacy', '개인정보처리방침');
        });
        body.appendChild(wrapper);
      } catch {
        body.replaceChildren(
          h('div', { class: 'empty' }, h('p', { class: 'empty-title' }, '문서를 불러오지 못했습니다')),
          h('p', { class: 'empty-body' }, '인터넷 연결을 확인하고 다시 열어 주세요.'),
        );
      }
    },
  });
}

function legalLink(name, title) {
  return h(
    'button',
    {
      class: 'link-btn',
      type: 'button',
      onclick: (event) => {
        event.preventDefault();
        openLegal(name, title);
      },
    },
    '보기',
  );
}

export function renderAuth(root, { onSignedIn }) {
  root.classList.add('auth-screen');
  let busy = false;

  const errorSlot = h('div', { class: 'form-error', hidden: true });
  const emailField = input({
    label: '이메일',
    type: 'email',
    placeholder: 'you@example.com',
    inputmode: 'email',
    autocomplete: 'username',
    required: true,
  });
  const passwordField = input({
    label: '비밀번호',
    type: 'password',
    placeholder: '6자 이상',
    autocomplete: 'current-password',
    required: true,
  });

  const submitButton = h(
    'button',
    { class: 'btn btn-primary btn-lg btn-block', type: 'submit' },
    '로그인',
  );

  function showError(message) {
    errorSlot.textContent = message;
    errorSlot.hidden = false;
  }

  const form = h(
    'form',
    { class: 'auth-card', novalidate: true },
    emailField.el,
    passwordField.el,
    errorSlot,
    submitButton,
    h(
      'div',
      { class: 'row', style: { justifyContent: 'space-between', marginTop: '2px' } },
      h(
        'button',
        { class: 'link-btn', type: 'button', onclick: () => openResetPassword(emailField.value) },
        '비밀번호를 잊으셨나요?',
      ),
      h(
        'button',
        { class: 'link-btn', type: 'button', onclick: () => openSignUp({ onSignedIn, onNeedConfirm: showConfirmSent }) },
        '이메일로 회원가입',
      ),
    ),
  );

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    errorSlot.hidden = true;
    if (!emailField.value.trim() || !passwordField.value) {
      showError('이메일과 비밀번호를 입력해 주세요.');
      return;
    }
    busy = true;
    submitButton.disabled = true;
    submitButton.textContent = '로그인 중…';
    try {
      await auth.signIn(emailField.value, passwordField.value);
      await onSignedIn();
    } catch (error) {
      showError(error.message);
    } finally {
      busy = false;
      submitButton.disabled = false;
      submitButton.textContent = '로그인';
    }
  });

  function showConfirmSent(email) {
    mount(
      root,
      h(
        'div',
        { class: 'auth-wrap', style: { justifyContent: 'center' } },
        h('div', { class: 'auth-mark' }, icon('mail', { size: 28 })),
        h('h1', { class: 'auth-title' }, '가입 확인 메일을 보냈습니다'),
        h(
          'p',
          { class: 'auth-sub' },
          `${email} 주소로 인증 메일을 보냈습니다. 메일의 인증 링크를 누른 뒤 로그인해 주세요.`,
        ),
        h(
          'p',
          { class: 'hint-box' },
          '메일이 보이지 않으면 스팸함도 확인해 주세요. 기본 메일 서버라 발송 한도(시간당 2통)가 있습니다.',
        ),
        button('로그인 화면으로', {
          block: true,
          size: 'lg',
          kind: 'ghost',
          onClick: () => renderAuth(root, { onSignedIn }),
        }),
      ),
    );
  }

  mount(
    root,
    h(
      'div',
      { class: 'auth-wrap' },
      h(
        'div',
        { class: 'auth-brand' },
        h('div', { class: 'auth-mark' }, icon('ball', { size: 30 })),
        h(
          'div',
          null,
          h('h1', { class: 'auth-title' }, 'PitchOS'),
          h('p', { class: 'auth-sub' }, '일정·투표·라인업·기록을 한 손에.'),
        ),
      ),
      form,
      h(
        'div',
        { class: 'social-block' },
        h(
          'div',
          { class: 'social-head' },
          h('div', { class: 'divider' }, h('span', null, '또는 소셜 계정으로 계속')),
          h('span', { class: 'soon-pill' }, '준비 중'),
        ),
        h(
          'div',
          { class: 'social-row' },
          ...PROVIDERS.map((provider) =>
            h(
              'button',
              {
                class: `social-btn ${provider.className}`,
                type: 'button',
                'aria-label': `${provider.label} 로그인 (준비 중)`,
                onclick: () => toast('소셜 로그인은 준비 중입니다. 지금은 이메일로 로그인해 주세요.', { ms: 3200 }),
              },
              provider.label,
            ),
          ),
        ),
        h('p', { class: 'social-note' }, '카카오·네이버·구글·Apple 로그인은 콘솔 키 등록 후 열립니다.'),
      ),
      h('p', { class: 'auth-foot' }, `웹 버전 ${APP_VERSION} · Safari 공유 → [홈 화면에 추가]로 앱처럼 사용하세요.`),
    ),
  );
}

// ---------------------------------------------------------------------------
// 회원가입 시트
// ---------------------------------------------------------------------------

function openSignUp({ onSignedIn, onNeedConfirm }) {
  const nameField = input({
    label: '이름(닉네임)',
    placeholder: '팀에서 보일 이름',
    autocomplete: 'nickname',
    maxlength: 24,
    hint: '1~24자. 팀원 목록과 라인업에 이 이름이 보입니다.',
    required: true,
  });
  const emailField = input({
    label: '이메일',
    type: 'email',
    placeholder: 'you@example.com',
    inputmode: 'email',
    autocomplete: 'email',
    required: true,
  });
  const passwordField = input({
    label: '비밀번호',
    type: 'password',
    placeholder: '6자 이상',
    autocomplete: 'new-password',
    hint: '6자 이상. 가입 후 인증 메일이 발송됩니다.',
    required: true,
  });

  const terms = checkbox({ label: '[필수] 이용약관 동의', onChange: () => syncAll() });
  const privacy = checkbox({ label: '[필수] 개인정보 수집·이용 동의', onChange: () => syncAll() });
  const location = checkbox({ label: '[필수] 위치정보 수집·이용 동의', onChange: () => syncAll() });
  const agreeAll = h('input', {
    type: 'checkbox',
    onchange: () => {
      const next = agreeAll.checked;
      terms.input.checked = next;
      privacy.input.checked = next;
      location.input.checked = next;
      syncAll();
    },
  });

  const errorSlot = h('div', { class: 'form-error', hidden: true });
  const submit = h('button', { class: 'btn btn-primary btn-lg btn-block', type: 'submit', disabled: true }, '가입하고 시작하기');

  function allChecked() {
    return terms.checked && privacy.checked && location.checked;
  }
  function syncAll() {
    agreeAll.checked = allChecked();
    submit.disabled = !allChecked();
  }

  const form = h(
    'form',
    { class: 'stack', novalidate: true },
    nameField.el,
    emailField.el,
    passwordField.el,
    h(
      'div',
      { class: 'agreements' },
      h('label', { class: 'check check-all' }, agreeAll, h('span', null, h('span', { class: 'check-label' }, '전체 동의'))),
      h('div', { class: 'agree-row' }, terms.el, legalLink('terms', '이용약관')),
      h('div', { class: 'agree-row' }, privacy.el, legalLink('privacy', '개인정보처리방침')),
      h('div', { class: 'agree-row' }, location.el, legalLink('location', '위치정보 수집·이용 동의')),
    ),
    errorSlot,
    submit,
  );

  const sheet = openSheet({
    title: '회원가입',
    subtitle: '이메일로 시작하면 팀원을 초대하고 바로 투표를 열 수 있습니다.',
    render: (body) => {
      body.appendChild(form);
    },
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorSlot.hidden = true;
    const name = nameField.value.trim();
    if (!name) {
      errorSlot.textContent = '이름(닉네임)을 입력해 주세요.';
      errorSlot.hidden = false;
      return;
    }
    if (!emailField.value.includes('@')) {
      errorSlot.textContent = '이메일 주소를 확인해 주세요.';
      errorSlot.hidden = false;
      return;
    }
    if (passwordField.value.length < 6) {
      errorSlot.textContent = '비밀번호는 6자 이상이어야 합니다.';
      errorSlot.hidden = false;
      return;
    }
    if (!allChecked()) {
      errorSlot.textContent = '약관·개인정보·위치정보 동의 3가지를 모두 체크해 주세요.';
      errorSlot.hidden = false;
      return;
    }

    submit.disabled = true;
    submit.textContent = '가입 중…';
    try {
      const result = await auth.signUp(emailField.value, passwordField.value, name);
      sheet.close();
      if (result.needsConfirm) onNeedConfirm?.(result.email);
      else await onSignedIn();
    } catch (error) {
      errorSlot.textContent = error.message;
      errorSlot.hidden = false;
      toast(error.message, { kind: 'error', ms: 4600 });
    } finally {
      submit.disabled = !allChecked();
      submit.textContent = '가입하고 시작하기';
    }
  });
}

// ---------------------------------------------------------------------------
// 비밀번호 재설정 시트
// ---------------------------------------------------------------------------

function openResetPassword(initialEmail = '') {
  const email = input({
    label: '가입한 이메일',
    type: 'email',
    inputmode: 'email',
    placeholder: 'you@example.com',
    value: initialEmail,
  });
  const sheet = openSheet({
    title: '비밀번호 재설정',
    subtitle: '입력한 주소로 재설정 메일을 보냅니다.',
    render: (body) => {
      body.appendChild(
        h(
          'div',
          { class: 'stack' },
          email.el,
          h('p', { class: 'hint-box' }, '메일 발송 한도(시간당 2통)에 걸리면 잠시 뒤 다시 시도해 주세요.'),
          button('메일 보내기', {
            block: true,
            size: 'lg',
            onClick: async (event) => {
              const target = event.currentTarget;
              if (!email.value.includes('@')) {
                toast('이메일 주소를 확인해 주세요.', { kind: 'error' });
                return;
              }
              target.disabled = true;
              try {
                await auth.recover(email.value);
                toast('재설정 메일을 보냈습니다. 받은편지함을 확인해 주세요.', { kind: 'ok', ms: 4200 });
                sheet.close();
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
}
