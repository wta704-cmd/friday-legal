// 마이 탭: 프로필 카드 + iOS 그룹 목록(프로필·Q&A·문의·앱 정보·계정 관리).

import { auth, account, support, profiles, currentUser } from '../api.js';
import { state, loadProfile, reset } from '../store.js';
import { APP_VERSION, SUPABASE_URL, SESSION_KEY } from '../config.js';
import * as fmt from '../lib/format.js';
import {
  h,
  badge,
  button,
  icon,
  input,
  select,
  textarea,
  openSheet,
  confirmDialog,
  toast,
  section,
  list,
  crest,
  emptyState,
} from '../ui.js';
import { appHeader, renderScreen, iconButton } from './common.js';

// ---------------------------------------------------------------------------
// Q&A (offline, same 15 answers as the native help screen)
// ---------------------------------------------------------------------------

const QA = [
  {
    cat: '투표',
    q: '투표는 언제 마감되나요?',
    a: '경기 48시간 전 22시(한국시간)에 자동으로 마감됩니다. 경기를 임박해서 만들면 경기 당일 22시, 또는 경기 1시간 전 중 이른 시각으로 잡히고, 그마저 지났으면 만든 시점부터 2시간 열립니다.',
  },
  {
    cat: '투표',
    q: '지각은 어떻게 표시하나요?',
    a: '투표에서 [지각]을 누르면 몇 분 늦는지 고를 수 있습니다. 팀원 목록에 "지각 10분"처럼 표시되고, 나중에 언제든 바꿀 수 있습니다.',
  },
  {
    cat: '투표',
    q: '마감 후에 못 온 사람은 어떻게 되나요?',
    a: '팀장·매니저가 [투표 마감]을 누르면 응답하지 않은 팀원이 자동으로 불참 처리됩니다. 마감 뒤에는 투표를 바꿀 수 없습니다.',
  },
  {
    cat: '팀',
    q: '초대코드는 어디서 보나요?',
    a: '팀 탭 맨 위 배너 아래에 6자리 코드가 3+3으로 표시됩니다. 옆의 [복사]를 누르면 클립보드에 복사됩니다. 팀원은 홈의 ‘초대코드로 참여’에서 입력합니다.',
  },
  {
    cat: '팀',
    q: '팀을 여러 개 만들 수 있나요?',
    a: '무료 플랜은 팀 1개, 팀원 25명까지입니다. Team 플랜은 팀 3개·팀원 50명까지입니다. 여러 팀에 속하면 홈 위 팀 칩으로 전환합니다.',
  },
  {
    cat: '기록',
    q: '기록은 어떻게 남기나요?',
    a: '이 웹 버전은 기록을 볼 수만 있습니다. 실제 기록은 갤럭시 워치·폰 앱에서 경기 중에 남기고, 워치가 없어도 폰 단독으로 같은 계산을 합니다.',
  },
  {
    cat: '기록',
    q: '팀원에게 내 기록이 보이나요?',
    a: '기본은 비공개입니다. 기록 탭에서 [공유]를 켠 세션만 같은 경기의 팀원에게 집계 지표가 보입니다. 원본 GPS 좌표는 누구에게도 보이지 않고 본인만 봅니다.',
  },
  {
    cat: '기록',
    q: '실내 구장은 어떻게 기록되나요?',
    a: '실내로 만든 경기는 GPS를 쓰지 않고 시간·심박만 기록합니다. 거리와 히트맵은 0으로 남고, 쿼터별 출전 시간과 심박은 그대로 계산됩니다.',
  },
  {
    cat: '기록',
    q: '스프린트 기준이 팀마다 다른가요?',
    a: '속도 구간은 팀 프리셋을 따릅니다. 기본은 "우리 팀 기본"(풋살 6/10/14/18 km/h), 그 외 HSR 18 기준, 프로 25.2 기준이 있습니다. 같은 팀이면 모든 기기가 같은 기준으로 계산합니다.',
  },
  {
    cat: '구장',
    q: '구장은 왜 4점을 찍나요?',
    a: '구장 네 꼭짓점으로 사영 변환을 풀어 GPS를 구장 좌표(m)로 바꿉니다. 그래야 히트맵이 구장 위에 정확히 올라갑니다. 내 골대 뒤 왼쪽부터 시계 방향으로 찍습니다.',
  },
  {
    cat: '구장',
    q: '구장 등록이 정확한지 어떻게 아나요?',
    a: '네 꼭짓점이 서로 8m 이상 떨어져야 하고, 폭 10~130m·길이 10~100m 범위를 벗어나면 서버가 거부합니다. 정확도가 ±10m보다 나쁘면 다시 찍는 것이 좋습니다.',
  },
  {
    cat: '계정',
    q: '비밀번호를 잊어버렸어요.',
    a: '로그인 화면의 [비밀번호를 잊으셨나요?]에서 가입한 이메일을 넣으면 재설정 메일이 갑니다. 기본 메일 서버라 시간당 2통 한도가 있습니다.',
  },
  {
    cat: '계정',
    q: '계정을 탈퇴하면 어떻게 되나요?',
    a: '탈퇴하면 프로필·기록·위치 원본·팀 로고 파일까지 즉시 삭제되고 되돌릴 수 없습니다. 팀에 남은 집계 기록은 작성자 연결만 끊고 팀 기록으로 유지됩니다.',
  },
  {
    cat: '계정',
    q: '아이폰에서 앱처럼 쓸 수 있나요?',
    a: 'Safari에서 이 주소를 연 뒤 공유 버튼 → [홈 화면에 추가]를 누르면 앱처럼 전체 화면으로 열립니다. 주소 표시줄이 사라지고 아이콘이 생깁니다.',
  },
  {
    cat: '기타',
    q: '문의는 어디로 하나요?',
    a: '마이 → 1:1 문의에서 남겨 주세요. 앱 버전과 기기 정보가 함께 전달되어 더 빠르게 확인할 수 있습니다. 답변 상태는 내 문의에서 볼 수 있습니다.',
  },
];

function qaBrowser() {
  const search = h('input', {
    class: 'input search-input',
    type: 'search',
    placeholder: '궁금한 점을 검색하세요',
    'aria-label': 'Q&A 검색',
  });
  const holder = h('div', { class: 'qa-list' });
  const cats = ['전체', ...new Set(QA.map((item) => item.cat))];
  let activeCat = '전체';

  const catRow = h(
    'div',
    { class: 'chip-row' },
    ...cats.map((cat) =>
      h(
        'button',
        {
          class: `chip${cat === '전체' ? ' is-active' : ''}`,
          type: 'button',
          onclick: (event) => {
            activeCat = cat;
            [...catRow.children].forEach((child) => child.classList.toggle('is-active', child === event.currentTarget));
            draw();
          },
        },
        cat,
      ),
    ),
  );

  function draw() {
    const term = search.value.trim().toLowerCase();
    const items = QA.filter(
      (item) =>
        (activeCat === '전체' || item.cat === activeCat) &&
        (!term || item.q.toLowerCase().includes(term) || item.a.toLowerCase().includes(term)),
    );
    holder.replaceChildren(
      ...(items.length
        ? items.map((item) =>
            h(
              'details',
              { class: 'qa-item' },
              h('summary', null, h('span', { class: 'qa-q' }, item.q), badge(item.cat, 'muted')),
              h('p', { class: 'qa-a' }, item.a),
            ),
          )
        : [h('p', { class: 'muted small pad center' }, '검색 결과가 없습니다.')]),
    );
  }

  search.addEventListener('input', draw);
  draw();
  return h('div', { class: 'stack' }, search, catRow, holder);
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

function openProfileEdit(ctx) {
  const profile = state.profile;
  const name = input({
    label: '이름(닉네임)',
    value: profile.display_name || '',
    maxlength: 24,
    hint: '팀원 목록·라인업·기록에 표시됩니다.',
    required: true,
  });
  const mode = select({
    label: '기본 종목',
    value: profile.play_mode || 'futsal',
    options: [
      { value: 'futsal', label: '풋살' },
      { value: 'soccer', label: '축구' },
    ],
  });
  const birth = input({
    label: '출생연도',
    type: 'number',
    value: profile.birth_year ?? '',
    min: 1900,
    max: 2100,
    placeholder: '1995',
    hint: '선택 입력. 본인만 볼 수 있습니다.',
  });
  const height = input({
    label: '키 (cm)',
    type: 'number',
    value: profile.height_cm ?? '',
    min: 100,
    max: 250,
    placeholder: '178',
  });
  const weight = input({
    label: '몸무게 (kg)',
    type: 'number',
    value: profile.weight_kg ?? '',
    min: 20,
    max: 300,
    step: '0.1',
    placeholder: '72.5',
  });

  const sheet = openSheet({
    title: '프로필 수정',
    subtitle: '키·몸무게·출생연도는 본인만 볼 수 있습니다.',
    render: (body) => {
      body.appendChild(
        h(
          'div',
          { class: 'stack' },
          h('div', { class: 'card card-flush' }, h('div', { class: 'field-row' }, height.el, weight.el)),
          name.el,
          h('div', { class: 'field-row' }, mode.el, birth.el),
          button('저장', {
            block: true,
            size: 'lg',
            iconName: 'check',
            onClick: async (event) => {
              const target = event.currentTarget;
              const value = name.value.trim();
              if (!value || value.length > 24) {
                toast('이름은 1~24자로 입력해 주세요.', { kind: 'error' });
                return;
              }
              const patch = { display_name: value, play_mode: mode.value };
              const birthValue = birth.value === '' ? null : Number(birth.value);
              const heightValue = height.value === '' ? null : Number(height.value);
              const weightValue = weight.value === '' ? null : Number(weight.value);
              if (birthValue !== null && !(birthValue >= 1900 && birthValue <= 2100)) {
                toast('출생연도를 확인해 주세요.', { kind: 'error' });
                return;
              }
              if (heightValue !== null && !(heightValue >= 100 && heightValue <= 250)) {
                toast('키는 100~250cm 사이여야 합니다.', { kind: 'error' });
                return;
              }
              if (weightValue !== null && !(weightValue >= 20 && weightValue <= 300)) {
                toast('몸무게는 20~300kg 사이여야 합니다.', { kind: 'error' });
                return;
              }
              patch.birth_year = birthValue;
              patch.height_cm = heightValue;
              patch.weight_kg = weightValue;

              target.disabled = true;
              try {
                state.profile = await profiles.update(patch);
                toast('프로필을 저장했습니다.', { kind: 'ok' });
                sheet.close();
                ctx.render();
              } catch (error) {
                toast(error.message, { kind: 'error', ms: 4200 });
              } finally {
                target.disabled = false;
              }
            },
          }),
          h('p', { class: 'hint-box' }, '비밀번호 변경은 로그인 화면의 [비밀번호를 잊으셨나요?] 재설정 메일로 처리합니다.'),
        ),
      );
    },
  });
}

// ---------------------------------------------------------------------------
// 1:1 문의
// ---------------------------------------------------------------------------

function deviceInfo() {
  const ua = navigator.userAgent || '';
  const platform = /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : 'desktop';
  return `web ${APP_VERSION} · ${platform} · ${ua}`.slice(0, 1900);
}

function openSupportForm(onDone) {
  const category = select({
    label: '분류',
    value: 'other',
    options: Object.entries(fmt.TICKET_CATEGORY_LABEL).map(([value, label]) => ({ value, label })),
  });
  const body = textarea({
    label: '문의 내용',
    placeholder: '상황과 기기(아이폰/갤럭시), 경기 일시를 함께 적어 주시면 빠릅니다. (10자 이상)',
    maxlength: 4000,
    rows: 6,
    required: true,
  });

  const sheet = openSheet({
    title: '1:1 문의',
    subtitle: '앱 버전과 기기 정보가 함께 전달됩니다.',
    render: (wrapper) => {
      wrapper.appendChild(
        h(
          'div',
          { class: 'stack' },
          category.el,
          body.el,
          h('p', { class: 'hint-box' }, '비밀번호·토큰·정확한 좌표는 적지 마세요. 필요한 경우 본사가 별도로 요청합니다.'),
          button('문의 보내기', {
            block: true,
            size: 'lg',
            iconName: 'mail',
            onClick: async (event) => {
              const target = event.currentTarget;
              const text = body.value.trim();
              if (text.length < 10) {
                toast('문의 내용을 10자 이상 적어 주세요.', { kind: 'error' });
                return;
              }
              target.disabled = true;
              try {
                await support.create({
                  category: category.value,
                  body: text,
                  deviceInfo: deviceInfo(),
                  appVersion: APP_VERSION,
                  clientUuid: crypto.randomUUID(),
                });
                toast('문의를 접수했습니다.', { kind: 'ok' });
                sheet.close();
                onDone?.();
              } catch (error) {
                toast(error.message, { kind: 'error', ms: 4200 });
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

function openTickets(tickets, onRefresh) {
  openSheet({
    title: '내 문의',
    subtitle: `${tickets.length}건 · 답변 상태를 확인할 수 있습니다.`,
    render: (body) => {
      body.appendChild(
        h(
          'div',
          { class: 'stack' },
          tickets.length
            ? h(
                'div',
                { class: 'list' },
                ...tickets.map((ticket) =>
                  h(
                    'div',
                    { class: 'ticket-row' },
                    h(
                      'div',
                      { class: 'ticket-head' },
                      badge(fmt.TICKET_CATEGORY_LABEL[ticket.category] || ticket.category, 'primary'),
                      badge(
                        fmt.TICKET_STATUS_LABEL[ticket.status] || ticket.status,
                        ticket.status === 'answered' ? 'ok' : 'muted',
                      ),
                      h('span', { class: 'ticket-date' }, fmt.formatDateTime(ticket.created_at)),
                    ),
                    h('p', { class: 'ticket-body' }, ticket.body),
                  ),
                ),
              )
            : emptyState({ iconName: 'mail', title: '접수한 문의가 없습니다', body: '1:1 문의로 남기면 답변 상태를 여기서 확인할 수 있습니다.' }),
          button('새 문의 쓰기', {
            block: true,
            kind: 'ghost',
            iconName: 'plus',
            onClick: () => openSupportForm(onRefresh),
          }),
        ),
      );
    },
  });
}

function openInstallGuide() {
  openSheet({
    title: '홈 화면에 추가',
    subtitle: 'Safari에서 한 번만 설정하면 앱처럼 열립니다.',
    render: (body) => {
      body.appendChild(
        h(
          'div',
          { class: 'stack' },
          h(
            'div',
            { class: 'card card-flush' },
            h('div', { class: 'list-row', style: { border: '0', padding: '4px 0' } },
              h('span', { class: 'list-row-icon' }, icon('share', { size: 17 })),
              h('div', { class: 'list-row-main' },
                h('span', { class: 'list-row-title' }, '1. Safari 공유 버튼'),
                h('span', { class: 'list-row-sub' }, '주소 표시줄 아래 공유 아이콘을 누릅니다.'),
              ),
            ),
            h('div', { class: 'list-row', style: { border: '0', padding: '4px 0' } },
              h('span', { class: 'list-row-icon' }, icon('plus', { size: 17 })),
              h('div', { class: 'list-row-main' },
                h('span', { class: 'list-row-title' }, '2. 홈 화면에 추가'),
                h('span', { class: 'list-row-sub' }, '목록을 조금 내리면 있습니다.'),
              ),
            ),
            h('div', { class: 'list-row', style: { border: '0', padding: '4px 0' } },
              h('span', { class: 'list-row-icon' }, icon('ball', { size: 17 })),
              h('div', { class: 'list-row-main' },
                h('span', { class: 'list-row-title' }, '3. 추가'),
                h('span', { class: 'list-row-sub' }, '이제 주소 표시줄 없이 전체 화면으로 열립니다.'),
              ),
            ),
          ),
          h('p', { class: 'hint-box' }, '안드로이드 크롬은 우측 상단 ⋮ → [홈 화면에 추가]입니다.'),
        ),
      );
    },
  });
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

async function build(root, ctx) {
  const content = h('div', { class: 'content' });
  const header = appHeader({
    title: '마이',
    subtitle: state.profile?.display_name || null,
    right: [iconButton('refresh', '새로고침', () => ctx.render())],
  });
  const screen = h('div', { class: 'screen' }, header, content);

  const profile = state.profile || (await loadProfile());
  const tickets = await support.list().catch(() => []);

  content.appendChild(
    h(
      'div',
      { class: 'profile-card' },
      h(
        'div',
        { class: 'profile-head' },
        h('div', { class: 'profile-avatar' }, (profile.display_name || 'P').slice(0, 1)),
        h(
          'div',
          { class: 'profile-main' },
          h('h2', { class: 'profile-name' }, profile.display_name || '이름 없음'),
          h('p', { class: 'profile-mail' }, currentUser()?.email || ''),
          h(
            'div',
            { class: 'profile-tags' },
            badge(fmt.MODE_LABEL[profile.play_mode] || '풋살', 'primary'),
            profile.height_cm ? badge(`${profile.height_cm}cm`, 'muted') : null,
            profile.weight_kg ? badge(`${profile.weight_kg}kg`, 'muted') : null,
            profile.birth_year ? badge(`${profile.birth_year}년생`, 'muted') : null,
          ),
        ),
      ),
      button('프로필 수정', {
        block: true,
        kind: 'ghost',
        iconName: 'edit',
        onClick: () => openProfileEdit(ctx),
      }),
    ),
  );

  content.appendChild(
    section(
      '계정',
      null,
      list([
        {
          iconName: 'user',
          title: '신체 정보 · 프로필',
          sub: '이름, 종목, 키·몸무게, 출생연도',
          onClick: () => openProfileEdit(ctx),
        },
        {
          iconName: 'shield',
          tone: 'ok',
          title: '개인정보 · 공유 설정',
          sub: '기록은 기본 비공개 · 원본 GPS는 본인만',
          onClick: () =>
            openSheet({
              title: '개인정보 · 공유 설정',
              render: (body) => {
                body.appendChild(
                  h(
                    'div',
                    { class: 'stack' },
                    list([
                      { iconName: 'lock', title: '원본 GPS 좌표', sub: '본인만 볼 수 있습니다.', value: '비공개' },
                      { iconName: 'share', title: '경기 기록 공유', sub: '기록 탭에서 세션별로 켭니다.', value: '켜기 전 비공개' },
                      { iconName: 'users', title: '팀에 보이는 정보', sub: '이름·포지션·참석 여부' },
                      { iconName: 'shield', title: '키·몸무게·출생연도', sub: '팀원에게 공개되지 않습니다.' },
                    ]),
                    h('p', { class: 'hint-box' }, '공유를 켠 세션만 같은 경기의 팀원에게 집계 지표가 보입니다.'),
                  ),
                );
              },
            }),
        },
      ]),
    ),
  );

  content.appendChild(
    section(
      '고객지원',
      null,
      list([
        {
          iconName: 'help',
          title: '사용법 & Q&A',
          sub: `${QA.length}개 문답 · 오프라인에서도 열립니다.`,
          onClick: () =>
            openSheet({
              title: '사용법 & Q&A',
              subtitle: '투표·팀·기록·구장·계정',
              render: (body) => body.appendChild(qaBrowser()),
            }),
        },
        {
          iconName: 'mail',
          title: '1:1 문의',
          sub: '앱 버전과 기기 정보가 함께 전달됩니다.',
          onClick: () => openSupportForm(() => ctx.render()),
        },
        {
          iconName: 'info',
          title: '내 문의',
          sub: tickets.length ? `최근 ${tickets.length}건` : '접수한 문의가 없습니다.',
          value: String(tickets.length),
          onClick: () => openTickets(tickets, () => ctx.render()),
        },
      ]),
    ),
  );

  content.appendChild(
    section(
      '앱 정보',
      null,
      list([
        { iconName: 'ball', title: '버전', value: APP_VERSION },
        { iconName: 'share', title: '홈 화면에 추가', sub: 'Safari 공유 → 홈 화면에 추가', onClick: openInstallGuide },
        { iconName: 'shield', title: '서버', sub: 'Supabase', value: SUPABASE_URL.replace('https://', '').split('.')[0] },
      ]),
    ),
  );

  content.appendChild(
    section(
      '계정 관리',
      null,
      list([
        {
          iconName: 'logout',
          title: '로그아웃',
          sub: '이 기기에서만 로그아웃합니다.',
          onClick: async () => {
            const ok = await confirmDialog({
              title: '로그아웃할까요?',
              message: '다시 이메일로 로그인하면 기록이 그대로 보입니다.',
              confirmLabel: '로그아웃',
            });
            if (!ok) return;
            await auth.signOut();
            reset();
            ctx.onSignedOut?.();
          },
        },
        {
          iconName: 'trash',
          tone: 'red',
          danger: true,
          title: '계정 탈퇴',
          sub: '프로필·기록·위치 원본·팀 로고까지 즉시 삭제됩니다.',
          onClick: async () => {
            const ok = await confirmDialog({
              title: '정말 탈퇴할까요?',
              message: '계정과 기록이 즉시 삭제되고 되돌릴 수 없습니다. 계속하려면 아래에 "탈퇴"를 입력해 주세요.',
              confirmLabel: '탈퇴하기',
              danger: true,
              requireText: '탈퇴',
            });
            if (!ok) return;
            try {
              toast('탈퇴 처리 중…', { ms: 2600 });
              await account.remove();
              reset();
              toast('탈퇴가 완료되었습니다.', { kind: 'ok', ms: 3200 });
              ctx.onSignedOut?.();
            } catch (error) {
              toast(error.message, { kind: 'error', ms: 4600 });
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
      'PitchOS 웹은 팀 운영(일정·투표·라인업)과 기록 열람을 담당합니다. GPS 기록은 폰·워치 앱에서 남깁니다.',
    ),
  );

  return screen;
}

export async function renderMy(root, ctx) {
  root.classList.remove('auth-screen');
  await renderScreen(root, ctx, () => build(root, ctx));
}
