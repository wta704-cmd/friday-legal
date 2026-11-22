// 로그인 / 회원가입. Email only for now: the four social providers have no
// console keys yet, so their buttons explain that instead of failing silently.

import { auth } from '../api.js';
import { APP_VERSION } from '../config.js';
import {
  h,
  input,
  button,
  checkbox,
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

export function renderAuth(root, { onSignedIn }) {
  let mode = 'signin';
  let busy = false;

  root.classList.add('auth-screen');

  const errorSlot = h('div', { class: 'form-error', hidden: true });

  const signinName = input({
    label: '이메일',
    type: 'email',
    placeholder: 'you@example.com',
    inputmode: 'email',
    autocomplete: 'email',
    required: true,
  });
  const signinPassword = input({
    label: '비밀번호',
    type: 'password',
    placeholder: '6자 이상',
    autocomplete: 'current-password',
    required: true,
  });

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
    hint: '6자 이상. 이메일 인증 메일이 발송됩니다.',
    required: true,
  });

  const termsCheck = checkbox({
    label: '[필수] 이용약관 동의',
    onChange: () => syncAgreeAll(),
    hint: null,
  });
  const privacyCheck = checkbox({
    label: '[필수] 개인정보 수집·이용 동의',
    onChange: () => syncAgreeAll(),
  });
  const locationCheck = checkbox({
    label: '[필수] 위치정보 수집·이용 동의',
    onChange: () => syncAgreeAll(),
  });
  const agreeAll = h('input', {
    type: 'checkbox',
    onchange: () => {
      const next = agreeAll.checked;
      termsCheck.input.checked = next;
      privacyCheck.input.checked = next;
      locationCheck.input.checked = next;
      submitButton.disabled = !next;
    },
  });

  function syncAgreeAll() {
    const all = termsCheck.checked && privacyCheck.checked && locationCheck.checked;
    agreeAll.checked = all;
    submitButton.disabled = !all;
  }

  function linkFor(name, title) {
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

  const submitButton = h(
    'button',
    { class: 'btn btn-primary btn-block btn-lg', type: 'submit' },
    '로그인',
  );

  const form = h('form', { class: 'stack', novalidate: true });
  const segments = h('div', { class: 'segment' });

  function renderSegments() {
    segments.replaceChildren(
      ...['signin', 'signup'].map((value) =>
        h(
          'button',
          {
            class: `segment-item${mode === value ? ' is-active' : ''}`,
            type: 'button',
            onclick: () => {
              if (mode === value) return;
              mode = value;
              errorSlot.hidden = true;
              renderForm();
            },
          },
          value === 'signin' ? '로그인' : '회원가입',
        ),
      ),
    );
  }

  function renderForm() {
    renderSegments();
    const children = [nameField.el, emailField.el, passwordField.el];
    const fields =
      mode === 'signin' ? [signinName.el, signinPassword.el] : children;

    const agreement =
      mode === 'signup'
        ? h(
            'div',
            { class: 'agreements' },
            h('label', { class: 'check check-all' }, agreeAll, h('span', null, h('span', { class: 'check-label' }, '전체 동의'))),
            h(
              'div',
              { class: 'agree-row' },
              termsCheck.el,
              linkFor('terms', '이용약관'),
            ),
            h(
              'div',
              { class: 'agree-row' },
              privacyCheck.el,
              linkFor('privacy', '개인정보처리방침'),
            ),
            h(
              'div',
              { class: 'agree-row' },
              locationCheck.el,
              linkFor('location', '위치정보 수집·이용 동의'),
            ),
          )
        : null;

    submitButton.textContent = mode === 'signin' ? '로그인' : '가입하고 시작하기';
    submitButton.disabled = mode === 'signup' ? !(termsCheck.checked && privacyCheck.checked && locationCheck.checked) : false;

    form.replaceChildren(
      ...fields,
      mode === 'signin'
        ? h(
            'div',
            { class: 'form-aside' },
            h(
              'button',
              {
                class: 'link-btn',
                type: 'button',
                onclick: () => askReset(),
              },
              '비밀번호를 잊으셨나요?',
            ),
          )
        : null,
      agreement,
      errorSlot,
      submitButton,
    );
  }

  function showError(message) {
    errorSlot.textContent = message;
    errorSlot.hidden = false;
  }

  function askReset() {
    const email = input({
      label: '가입한 이메일',
      type: 'email',
      inputmode: 'email',
      placeholder: 'you@example.com',
      value: mode === 'signin' ? signinName.value : emailField.value,
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
            h(
              'p',
              { class: 'hint-box' },
              '메일 발송 한도(시간당 2통)에 걸리면 잠시 뒤 다시 시도해 주세요.',
            ),
            button('메일 보내기', {
              block: true,
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

  function showConfirmSent(email) {
    mount(
      root,
      h(
        'div',
        { class: 'auth-wrap' },
        h('div', { class: 'auth-logo' }, icon('ball', { size: 34 })),
        h('h1', { class: 'auth-title' }, '가입 확인 메일을 보냈습니다'),
        h(
          'p',
          { class: 'auth-sub' },
          `${email} 주소로 인증 메일을 보냈습니다. 메일의 인증 링크를 누른 뒤 로그인해 주세요.`,
        ),
        h(
          'p',
          { class: 'hint-box' },
          '메일이 보이지 않으면 스팸함도 확인해 주세요. 기본 메일 서버라 발송 한도(시간당 2통)가 있어, 한도를 넘으면 잠시 뒤 다시 시도해야 합니다.',
        ),
        button('로그인 화면으로', {
          block: true,
          kind: 'ghost',
          onClick: () => {
            mode = 'signin';
            boot();
          },
        }),
      ),
    );
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    errorSlot.hidden = true;

    if (mode === 'signin') {
      if (!signinName.value.trim() || !signinPassword.value) {
        showError('이메일과 비밀번호를 입력해 주세요.');
        return;
      }
      busy = true;
      submitButton.disabled = true;
      submitButton.textContent = '로그인 중…';
      try {
        await auth.signIn(signinName.value, signinPassword.value);
        await onSignedIn();
      } catch (error) {
        showError(error.message);
        toast(error.message, { kind: 'error', ms: 4000 });
      } finally {
        busy = false;
        submitButton.disabled = false;
        submitButton.textContent = '로그인';
      }
      return;
    }

    // signup
    if (!nameField.value.trim()) return showError('이름(닉네임)을 입력해 주세요.');
    if (nameField.value.trim().length > 24) return showError('이름은 24자 이내로 입력해 주세요.');
    if (!emailField.value.includes('@')) return showError('이메일 주소를 확인해 주세요.');
    if (passwordField.value.length < 6) return showError('비밀번호는 6자 이상이어야 합니다.');
    if (!(termsCheck.checked && privacyCheck.checked && locationCheck.checked)) {
      return showError('약관·개인정보·위치정보 동의 3가지를 모두 체크해 주세요.');
    }

    busy = true;
    submitButton.disabled = true;
    submitButton.textContent = '가입 중…';
    try {
      const result = await auth.signUp(emailField.value, passwordField.value, nameField.value);
      if (result.needsConfirm) {
        showConfirmSent(result.email);
      } else {
        await onSignedIn();
      }
    } catch (error) {
      showError(error.message);
      toast(error.message, { kind: 'error', ms: 4600 });
    } finally {
      busy = false;
      submitButton.disabled = false;
      submitButton.textContent = '가입하고 시작하기';
    }
  });

  function socialRow() {
    return h(
      'div',
      { class: 'social-block' },
      h('div', { class: 'divider' }, h('span', null, '또는')),
      h(
        'div',
        { class: 'social-row' },
        ...PROVIDERS.map((provider) =>
          h(
            'button',
            {
              class: `social-btn ${provider.className}`,
              type: 'button',
              onclick: () =>
                toast('소셜 로그인은 준비 중입니다. 지금은 이메일로 로그인해 주세요.', { ms: 3200 }),
            },
            provider.label,
          ),
        ),
      ),
      h('p', { class: 'social-note' }, '소셜 로그인(카카오·네이버·구글·Apple)은 콘솔 키 등록 전까지 준비 중입니다.'),
    );
  }

  function boot() {
    renderForm();
    mount(
      root,
      h(
        'div',
        { class: 'auth-wrap' },
        h('div', { class: 'auth-brand' },
          h('div', { class: 'auth-logo' }, icon('ball', { size: 32 })),
          h('div', null,
            h('h1', { class: 'auth-title' }, 'PitchOS'),
            h('p', { class: 'auth-sub' }, '축구·풋살 퍼포먼스 & 팀 관리'),
          ),
        ),
        segments,
        form,
        socialRow(),
        h('p', { class: 'auth-foot' }, `웹 버전 ${APP_VERSION} · 아이폰 Safari에서 홈 화면에 추가하면 앱처럼 열립니다.`),
      ),
    );
    syncAgreeAll();
  }

  boot();
}
