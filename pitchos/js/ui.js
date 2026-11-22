// DOM helpers and the small component kit every screen is built from.
// No framework: elements are created directly so the app stays a handful of
// static files that any HTTPS host can serve.

import { crestColor, crestInitials, avatarTone } from './lib/crest.js';
import { layoutQuarter, PITCH_BOX } from './lib/pitch.js';

// ---------------------------------------------------------------------------
// Elements
// ---------------------------------------------------------------------------

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  applyAttrs(el, attrs);
  append(el, children);
  return el;
}

function applyAttrs(el, attrs) {
  if (!attrs) return;
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'html') el.innerHTML = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'style') {
      if (typeof value === 'string') el.setAttribute('style', value);
      else Object.assign(el.style, value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'value') {
      el.value = value;
    } else if (key === 'checked' || key === 'disabled' || key === 'hidden' || key === 'selected') {
      el[key] = Boolean(value);
    } else {
      el.setAttribute(key, value === true ? '' : value);
    }
  }
}

function append(el, children) {
  for (const child of children.flat(5)) {
    if (child === null || child === undefined || child === false || child === true) continue;
    if (Array.isArray(child)) append(el, child);
    else if (child instanceof Node) el.appendChild(child);
    else el.appendChild(document.createTextNode(String(child)));
  }
}

/** Replace an element's children, skipping null/false so a conditional never renders "null". */
export function setChildren(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

export function mount(root, ...children) {
  root.replaceChildren();
  append(root, children);
  return root;
}

export function clear(el) {
  el.replaceChildren();
  return el;
}

// ---------------------------------------------------------------------------
// Icons (24x24 stroke, currentColor)
// ---------------------------------------------------------------------------

const ICONS = {
  home: 'M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5',
  team: 'M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-4A3.5 3.5 0 0 0 5 17.5V19M10.5 11a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5M17 11.2a2.9 2.9 0 1 0 0-5.8M19 19v-1.4a3.2 3.2 0 0 0-2.4-3.1',
  users: 'M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-4A3.5 3.5 0 0 0 5 17.5V19M10.5 11a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5M17 11.2a2.9 2.9 0 1 0 0-5.8M19 19v-1.4a3.2 3.2 0 0 0-2.4-3.1',
  chart: 'M5 20V10m7 10V4m7 16v-7',
  activity: 'M3 12h3.5l2.5-6 4 12 2.5-6H21',
  user: 'M12 12.2a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4.5 20.5c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  copy: 'M9 9.5V6.5A1.5 1.5 0 0 1 10.5 5h7A1.5 1.5 0 0 1 19 6.5v7a1.5 1.5 0 0 1-1.5 1.5h-3M6.5 9.5h7A1.5 1.5 0 0 1 15 11v7a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 5 18v-7a1.5 1.5 0 0 1 1.5-1.5',
  check: 'M5 12.5 9.5 17 19 7',
  x: 'M6 6l12 12M18 6 6 18',
  calendar: 'M4.5 8.5h15M7 4.5v3M17 4.5v3M5.5 6.5h13A1.5 1.5 0 0 1 20 8v11.5H4V8a1.5 1.5 0 0 1 1.5-1.5Z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7.5V12l3 2',
  pin: 'M12 21s6.5-6.2 6.5-11A6.5 6.5 0 0 0 5.5 10c0 4.8 6.5 11 6.5 11Z M12 12.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4',
  shield: 'M12 3.5 19 6v6c0 4.2-3 7.4-7 8.5-4-1.1-7-4.3-7-8.5V6l7-2.5Z',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v5.5M12 7.6v.6',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9.6 9.4a2.5 2.5 0 1 1 3.6 2.3c-.8.5-1.2 1-1.2 2M12 17v.4',
  logout: 'M15 8.5V6a1.5 1.5 0 0 0-1.5-1.5h-7A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5h7A1.5 1.5 0 0 0 15 18v-2.5M10 12h10m0 0-3-3m3 3-3 3',
  trash: 'M5 7h14M9.5 7V5.5h5V7M7 7l.8 12.2A1.5 1.5 0 0 0 9.3 20.5h5.4a1.5 1.5 0 0 0 1.5-1.4L17 7',
  refresh: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 5v4h-4',
  chevron: 'M9 5.5 15.5 12 9 18.5',
  chevronDown: 'M6 9.5 12 15.5 18 9.5',
  back: 'M15 5.5 8.5 12 15 18.5',
  whistle: 'M14.5 9.5a5.5 5.5 0 1 0-4.6 8.9M14.5 9.5h5.2a2.3 2.3 0 0 0 0-4.6H10a6.5 6.5 0 0 1 4.5 4.6Z',
  ball: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7.2l3.6 2.6-1.4 4.2h-4.4L8.4 9.8 12 7.2Z M12 3v4.2M20.6 9.8l-4.9.6M17.5 19.4l-2.9-5M6.5 19.4l2.9-5M3.4 9.8l4.9.6',
  link: 'M10.5 13.5a3.5 3.5 0 0 0 5 0l2-2a3.54 3.54 0 0 0-5-5l-1 1M13.5 10.5a3.5 3.5 0 0 0-5 0l-2 2a3.54 3.54 0 0 0 5 5l1-1',
  lock: 'M6.5 10.5h11V20h-11zM8.8 10.5V8a3.2 3.2 0 0 1 6.4 0v2.5',
  key: 'M10 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM10 8h11M18 8v3.5M15 8v2.5',
  share: 'M12 15V4m0 0L8.5 7.5M12 4l3.5 3.5M5 14v5.5h14V14',
  trophy: 'M8 4h8v4.5a4 4 0 0 1-8 0V4ZM8 5.5H5.5V7A2.5 2.5 0 0 0 8 9.5M16 5.5h2.5V7A2.5 2.5 0 0 1 16 9.5M12 12.5V17M9 20h6M10 17h4',
  heart: 'M12 20s-7-4.3-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.7-7 9-7 9Z',
  alert: 'M12 8v5M12 16.4v.6M12 3.6 21 20H3l9-16.4Z',
  mail: 'M4 6.5h16v11H4zM4 7l8 6 8-6',
  edit: 'M4 20h4L19 9l-4-4L4 16v4ZM14.5 5.5l4 4',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-3.6-3.6',
  ruler: 'M4 14 14 4l6 6L10 20l-6-6ZM8 10l2 2M11 7l2 2M5 13l2 2',
  sparkles: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3ZM18.5 15.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1Z',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  flag: 'M6 21V4M6 5h11l-1.8 3.5L17 12H6',
};

export function icon(name, { size = 22, className = '', strokeWidth = 1.8 } = {}) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', String(strokeWidth));
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  if (className) svg.setAttribute('class', className);
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICONS[name] || ICONS.info);
  svg.appendChild(path);
  return svg;
}

// ---------------------------------------------------------------------------
// Crest / badges / chips
// ---------------------------------------------------------------------------

export function crest(name, { size = 44, logoUrl = null, tone = 'crest' } = {}) {
  const style = { width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.36)}px` };
  if (tone === 'avatar') {
    const t = avatarTone(name);
    style.background = t.bg;
    style.color = t.fg;
  } else if (tone === 'light') {
    style.background = '#fff';
    style.color = '#0E8A3D';
  } else if (tone === 'ghost') {
    style.background = 'rgba(255,255,255,0.16)';
    style.color = '#fff';
  } else if (!logoUrl) {
    style.background = crestColor(name);
  }
  if (logoUrl) {
    return h('img', {
      class: 'crest',
      src: logoUrl,
      alt: '',
      width: size,
      height: size,
      style,
    });
  }
  return h('div', { class: 'crest', style, 'aria-hidden': 'true' }, crestInitials(name));
}

export function badge(text, tone = 'muted') {
  return h('span', { class: `badge badge-${tone}` }, text);
}

/** 경기 상태 배지: 진행 중은 LIVE(빨간 점), 취소는 빨강, 나머지는 회색. */
export function matchStatusBadge(status, label) {
  const tone = status === 'live' ? 'live' : status === 'canceled' ? 'bad' : 'muted';
  return badge(label, tone);
}

/**
 * 브랜드 워드마크 (JOKBAL + 네온 그린 도트 + L).
 * 색은 부모의 currentColor를 따르고, 도트만 브랜드 네온색으로 고정한다.
 */
export function wordmark({ className = '', label = 'JOKBAL.L', large = false } = {}) {
  return h(
    'span',
    {
      class: `wordmark${large ? ' wordmark-lg' : ''}${className ? ` ${className}` : ''}`,
      role: 'img',
      'aria-label': label,
    },
    h('span', { class: 'wm-text', 'aria-hidden': 'true' }, 'JOKBAL'),
    h('span', { class: 'wm-dot', 'aria-hidden': 'true' }),
    h('span', { class: 'wm-text', 'aria-hidden': 'true' }, 'L'),
  );
}

/** 앱 아이콘(스퀄클 PNG). 홈 화면 아이콘과 같은 파일을 쓴다. */
export function appIcon(size = 52, className = 'auth-icon') {
  return h('img', {
    class: className,
    src: './icons/icon-192.png',
    alt: '',
    width: size,
    height: size,
    style: { width: `${size}px`, height: `${size}px` },
  });
}

export function chip(text, { iconName = null, onClick = null, active = false, count = null } = {}) {
  return h(
    'button',
    { class: `chip${active ? ' is-active' : ''}`, type: 'button', onclick: onClick },
    iconName ? icon(iconName, { size: 15 }) : null,
    h('span', null, text),
    count === null || count === undefined ? null : h('span', { class: 'chip-count' }, String(count)),
  );
}

export function avatarStack(rows, { max = 5, size = 30 } = {}) {
  const list = (rows || []).filter(Boolean);
  const shown = list.slice(0, max);
  const rest = list.length - shown.length;
  return h(
    'div',
    { class: 'avatar-stack', 'aria-hidden': 'true' },
    ...shown.map((row) => crest(row.display_name || row.name || 'P', { size, tone: 'avatar' })),
    rest > 0 ? h('span', { class: 'avatar-more' }, `+${rest}`) : null,
  );
}

// ---------------------------------------------------------------------------
// Buttons / fields
// ---------------------------------------------------------------------------

export function button(
  label,
  { kind = 'primary', onClick, iconName = null, size = '', type = 'button', disabled = false, block = false } = {},
) {
  return h(
    'button',
    {
      class: `btn btn-${kind}${size ? ` btn-${size}` : ''}${block ? ' btn-block' : ''}`,
      type,
      onclick: onClick,
      disabled: disabled || null,
    },
    iconName ? icon(iconName, { size: 17 }) : null,
    label,
  );
}

function fieldShell(label, control, hint, { required = false } = {}) {
  return h(
    'label',
    { class: 'field' },
    h('span', { class: 'field-label' }, label, required ? h('em', { class: 'req' }, '*') : null),
    control,
    hint ? h('span', { class: 'field-hint' }, hint) : null,
  );
}

export function input({
  label,
  type = 'text',
  value = '',
  placeholder = '',
  hint = '',
  inputmode = null,
  autocomplete = null,
  min = null,
  max = null,
  step = null,
  maxlength = null,
  required = false,
  name = null,
  readonly = false,
}) {
  const control = h('input', {
    class: 'input',
    type,
    value,
    placeholder,
    inputmode,
    autocomplete,
    min,
    max,
    step,
    maxlength,
    required: required || null,
    name,
    readonly: readonly || null,
  });
  const el = fieldShell(label, control, hint, { required });
  return {
    el,
    input: control,
    get value() {
      return control.value;
    },
  };
}

export function select({ label, options, value = '', hint = '', required = false, name = null }) {
  const control = h(
    'select',
    { class: 'input', name },
    ...options.map((option) =>
      h('option', { value: option.value, selected: String(option.value) === String(value) }, option.label),
    ),
  );
  const el = fieldShell(label, control, hint, { required });
  return {
    el,
    input: control,
    get value() {
      return control.value;
    },
  };
}

let stepperSeq = 0;

/**
 * -/+ 스텝퍼 + 빠른 선택 칩. 숫자 입력도 같이 받는다(1분 단위 등).
 *
 * - label을 <label for>로 잇지 않고 div로 감싼다: 버튼(칩)을 label 안에 두면
 *   iOS에서 탭 이벤트가 한 번 더 발생해 값이 두 칸씩 움직인다.
 *
 * @returns {{ el: HTMLElement, get value(): number, set(value: number, opts?: {silent?: boolean}): number, focus(): void }}
 */
export function stepper({
  label,
  value = 0,
  min = 0,
  max = 100,
  step = 1,
  suffix = '분',
  chips = [],
  hint = '',
  onChange = null,
  ariaLabel = null,
}) {
  stepperSeq += 1;
  const id = `stepper-${stepperSeq}`;
  const normalize = (next) => {
    const number = Number(next);
    if (!Number.isFinite(number)) return value;
    return Math.min(max, Math.max(min, Math.round(number)));
  };

  const control = h('input', {
    class: 'step-input',
    id,
    type: 'number',
    inputmode: 'numeric',
    pattern: '[0-9]*',
    min,
    max,
    step,
    value: String(value),
    'aria-label': ariaLabel || label,
  });

  const chipButtons = chips.map((chip) => {
    const chipValue = typeof chip === 'object' && chip !== null ? chip.value : chip;
    const chipLabel =
      typeof chip === 'object' && chip !== null ? chip.label : `${chipValue}${suffix}`;
    return h(
      'button',
      {
        class: 'chip',
        type: 'button',
        dataset: { value: String(chipValue) },
        onclick: () => set(chipValue),
      },
      chipLabel,
    );
  });

  let current = normalize(value);

  function paint() {
    control.value = String(current);
    for (const chip of chipButtons) {
      chip.classList.toggle('is-active', Number(chip.dataset.value) === current);
    }
  }

  function set(next, { silent = false } = {}) {
    current = normalize(next);
    paint();
    if (!silent) onChange?.(current);
    return current;
  }

  const minus = h(
    'button',
    {
      class: 'step-btn',
      type: 'button',
      'aria-label': `${label} 줄이기`,
      onclick: () => set(current - step),
    },
    icon('minus', { size: 17 }),
  );
  const plus = h(
    'button',
    {
      class: 'step-btn',
      type: 'button',
      'aria-label': `${label} 늘리기`,
      onclick: () => set(current + step),
    },
    icon('plus', { size: 17 }),
  );

  control.addEventListener('input', () => {
    if (control.value === '') return; // 지우는 중에는 기다린다
    const number = Number(control.value);
    if (!Number.isFinite(number)) return;
    current = Math.min(max, Math.max(min, Math.round(number)));
    for (const chip of chipButtons) {
      chip.classList.toggle('is-active', Number(chip.dataset.value) === current);
    }
    onChange?.(current);
  });
  control.addEventListener('blur', () => {
    if (control.value === '') set(current, { silent: false });
    else paint();
  });

  paint();

  const el = h(
    'div',
    { class: 'field stepper-field' },
    h('span', { class: 'field-label' }, h('label', { for: id }, label)),
    h(
      'div',
      { class: 'stepper' },
      minus,
      h('div', { class: 'step-box' }, control, suffix ? h('span', { class: 'step-suffix' }, suffix) : null),
      plus,
    ),
    chipButtons.length ? h('div', { class: 'chip-row chip-wrap' }, ...chipButtons) : null,
    hint ? h('span', { class: 'field-hint' }, hint) : null,
  );

  return {
    el,
    get value() {
      return current;
    },
    set,
    focus: () => control.focus(),
  };
}

export function textarea({ label, value = '', placeholder = '', hint = '', maxlength = 4000, rows = 5, required = false }) {
  const control = h(
    'textarea',
    { class: 'input textarea', placeholder, maxlength, rows, required: required || null },
    value,
  );
  const el = fieldShell(label, control, hint, { required });
  return {
    el,
    input: control,
    get value() {
      return control.value;
    },
  };
}

export function checkbox({ label, checked = false, hint = '', onChange = null }) {
  const control = h('input', { type: 'checkbox', checked: checked || null, onchange: onChange });
  const el = h(
    'label',
    { class: 'check' },
    control,
    h('span', null, h('span', { class: 'check-label' }, label), hint ? h('span', { class: 'check-hint' }, hint) : null),
  );
  return {
    el,
    input: control,
    get checked() {
      return control.checked;
    },
  };
}

export function switchToggle({ checked, label, onChange }) {
  const button = h(
    'button',
    {
      class: `switch${checked ? ' is-on' : ''}`,
      type: 'button',
      role: 'switch',
      'aria-checked': checked ? 'true' : 'false',
      'aria-label': label,
      onclick: () => {
        const next = !button.classList.contains('is-on');
        button.classList.toggle('is-on', next);
        button.setAttribute('aria-checked', next ? 'true' : 'false');
        onChange?.(next);
      },
    },
    h('span', { class: 'switch-knob' }),
  );
  return button;
}

// ---------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------

export function pageHead({ eyebrow = null, title, sub = null, action = null }) {
  return h(
    'div',
    { class: 'page-head' },
    h(
      'div',
      null,
      eyebrow ? h('p', { class: 'eyebrow' }, eyebrow) : null,
      h('h1', { class: 'page-title' }, title),
      sub ? h('p', { class: 'page-sub' }, sub) : null,
    ),
    action,
  );
}

export function section(title, action = null, ...children) {
  return h(
    'section',
    { class: 'section' },
    h('div', { class: 'section-head' }, h('h2', { class: 'section-title' }, title), action),
    ...children,
  );
}

export function card(...children) {
  return h('div', { class: 'card' }, ...children);
}

/**
 * iOS grouped list. Each item: { iconName, tone, title, sub, value, onClick, danger, trailing }
 */
export function list(items) {
  return h(
    'div',
    { class: 'list' },
    ...items.filter(Boolean).map((item) => {
      const tag = item.onClick ? 'button' : 'div';
      return h(
        tag,
        {
          class: 'list-row',
          type: item.onClick ? 'button' : null,
          onclick: item.onClick || null,
        },
        item.iconName
          ? h('span', { class: `list-row-icon${item.tone ? ` tone-${item.tone}` : ''}` }, icon(item.iconName, { size: 17 }))
          : null,
        h(
          'div',
          { class: 'list-row-main' },
          h('span', { class: `list-row-title${item.danger ? ' danger' : ''}` }, item.title),
          item.sub ? h('span', { class: 'list-row-sub' }, item.sub) : null,
        ),
        item.trailing || null,
        item.value ? h('span', { class: 'list-row-value' }, item.value) : null,
        item.onClick ? icon('chevron', { size: 17, className: 'chev' }) : null,
      );
    }),
  );
}

export function statTile({ label, value, unit = '', iconName = 'activity', tone = '' }) {
  return h(
    'div',
    { class: `kpi${tone ? ` tone-${tone}` : ''}` },
    iconName ? h('span', { class: 'kpi-icon' }, icon(iconName, { size: 17 })) : null,
    h('span', { class: 'kpi-label' }, label),
    h('span', { class: 'kpi-value' }, value, unit ? h('small', null, unit) : null),
  );
}

/** 막대 그래프: rows [{label, value, display, rest}] — value는 0~1 비율이 아니라 원값. */
export function barChart(rows, { emptyLabel = '아직 기록이 없습니다.' } = {}) {
  const list_ = (rows || []).filter(Boolean);
  if (!list_.length) return h('p', { class: 'muted small center pad' }, emptyLabel);
  const max = Math.max(...list_.map((row) => Number(row.value) || 0), 1);
  return h(
    'div',
    { class: 'chart' },
    ...list_.map((row) =>
      h(
        'div',
        { class: 'chart-col' },
        h('span', { class: 'chart-value' }, row.display ?? ''),
        h('div', {
          class: `chart-bar${row.rest ? ' is-rest' : ''}`,
          style: { height: `${Math.max(4, Math.round(((Number(row.value) || 0) / max) * 84))}px` },
        }),
        h('span', { class: 'chart-label' }, row.label),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// Pitch board (mini tactical board)
// ---------------------------------------------------------------------------

function svgEl(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs || {})) el.setAttribute(key, String(value));
  return el;
}

function pitchBackground() {
  const svg = svgEl('svg', {
    viewBox: `0 0 ${PITCH_BOX.width} ${PITCH_BOX.height}`,
    preserveAspectRatio: 'none',
    class: 'pitch-svg',
    'aria-hidden': 'true',
  });
  const W = PITCH_BOX.width;
  const H = PITCH_BOX.height;
  const band = H / 10;
  // Alternating mow stripes.
  for (let index = 1; index < 10; index += 2) {
    svg.appendChild(
      svgEl('rect', {
        x: 0,
        y: index * band,
        width: W,
        height: band,
        fill: 'rgba(255,255,255,0.045)',
      }),
    );
  }
  const line = { fill: 'none', stroke: 'rgba(255,255,255,0.5)', 'stroke-width': 0.7 };
  svg.appendChild(svgEl('rect', { x: 2, y: 2, width: 96, height: H - 4, rx: 3, ...line }));
  svg.appendChild(svgEl('path', { d: `M2 ${H / 2}h96`, ...line }));
  svg.appendChild(svgEl('circle', { cx: 50, cy: H / 2, r: 11, ...line }));
  svg.appendChild(svgEl('circle', { cx: 50, cy: H / 2, r: 0.9, fill: 'rgba(255,255,255,0.55)' }));
  // Penalty areas + goals, both ends.
  svg.appendChild(svgEl('rect', { x: 26, y: 2, width: 48, height: 13, ...line }));
  svg.appendChild(svgEl('rect', { x: 38, y: 2, width: 24, height: 5, ...line }));
  svg.appendChild(svgEl('rect', { x: 26, y: H - 15, width: 48, height: 13, ...line }));
  svg.appendChild(svgEl('rect', { x: 38, y: H - 7, width: 24, height: 5, ...line }));
  svg.appendChild(svgEl('path', { d: `M41 0h18M41 ${H}h18`, stroke: 'rgba(255,255,255,0.75)', 'stroke-width': 1.6 }));
  return svg;
}

/**
 * rows: [{ user_id, position }] (라인업 행), nameOf(userId) -> 표시 이름.
 */
export function pitchBoard({ rows, nameOf, mode = 'futsal', empty = null }) {
  const placed = layoutQuarter(rows || [], { mode });
  const wrap = h('div', { class: `pitch-wrap${placed.length > 8 ? ' is-dense' : ''}` }, pitchBackground());
  if (!placed.length) {
    wrap.appendChild(
      h(
        'div',
        { class: 'pitch-empty' },
        icon('sparkles', { size: 22 }),
        h('b', null, empty?.title || '라인업이 아직 없습니다'),
        h('span', null, empty?.body || '참석한 팀원으로 자동 배분해 보세요.'),
      ),
    );
    return wrap;
  }
  for (const row of placed) {
    const name = nameOf(row.user_id) || '팀원';
    wrap.appendChild(
      h(
        'div',
        {
          class: 'pitch-player',
          style: { left: `${row.x}%`, top: `${(row.y / PITCH_BOX.height) * 100}%` },
        },
        h('span', { class: `pitch-dot${row.line === 'GK' ? ' is-gk' : ''}` }, name.slice(0, 2)),
        h('span', { class: 'pitch-name' }, name),
      ),
    );
  }
  return wrap;
}

// ---------------------------------------------------------------------------
// Empty / error / spinner
// ---------------------------------------------------------------------------

export function spinner(label = '불러오는 중…') {
  return h('div', { class: 'spinner-wrap' }, h('div', { class: 'spinner' }), h('p', null, label));
}

export function emptyState({ iconName = 'info', title, body, actionLabel, onAction }) {
  return h(
    'div',
    { class: 'empty' },
    h('div', { class: 'empty-icon' }, icon(iconName, { size: 25 })),
    h('p', { class: 'empty-title' }, title),
    body ? h('p', { class: 'empty-body' }, body) : null,
    actionLabel
      ? h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: onAction }, actionLabel)
      : null,
  );
}

export function errorState(error, onRetry) {
  return h(
    'div',
    { class: 'empty' },
    h('div', { class: 'empty-icon danger' }, icon('alert', { size: 25 })),
    h('p', { class: 'empty-title' }, '불러오지 못했습니다'),
    h('p', { class: 'empty-body' }, error?.message || '잠시 뒤 다시 시도해 주세요.'),
    onRetry
      ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: onRetry }, '다시 시도')
      : null,
  );
}

// ---------------------------------------------------------------------------
// Toast / sheet / dialog
// ---------------------------------------------------------------------------

function host(id) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    document.body.appendChild(el);
  }
  return el;
}

export function toast(message, { kind = 'info', ms = 2800 } = {}) {
  const el = host('toast-host');
  const item = h('div', { class: `toast toast-${kind}` }, message);
  el.appendChild(item);
  setTimeout(() => {
    item.classList.add('leaving');
    setTimeout(() => item.remove(), 220);
  }, ms);
  return item;
}

let sheetDepth = 0;

export function openSheet({ title, subtitle = null, render, footer = null, onClose = null, closable = true }) {
  const overlay = h('div', { class: 'sheet-overlay' });
  const body = h('div', { class: 'sheet-body' });
  const closeButton = closable
    ? h(
        'button',
        { class: 'icon-btn', type: 'button', 'aria-label': '닫기', onclick: () => close() },
        icon('x', { size: 18 }),
      )
    : null;
  const head = h(
    'div',
    { class: 'sheet-head' },
    h('div', { class: 'sheet-titles' }, h('h2', null, title), subtitle ? h('p', null, subtitle) : null),
    closeButton,
  );
  const sheet = h(
    'div',
    { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'sheet-grabber' }),
    head,
    body,
    footer ? h('div', { class: 'sheet-footer' }, footer) : null,
  );
  overlay.appendChild(sheet);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay && closable) close();
  });

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    overlay.classList.add('closing');
    setTimeout(() => overlay.remove(), 260);
    sheetDepth = Math.max(0, sheetDepth - 1);
    if (sheetDepth === 0) document.body.classList.remove('sheet-open');
    document.removeEventListener('keydown', onKey);
    onClose?.();
  }

  function onKey(event) {
    if (event.key === 'Escape' && closable) close();
  }

  document.body.appendChild(overlay);
  sheetDepth += 1;
  document.body.classList.add('sheet-open');
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => overlay.classList.add('open'));
  Promise.resolve(render?.(body, { close, sheet })).catch((error) => {
    body.replaceChildren(errorState(error));
  });
  return { overlay, sheet, body, close };
}

export function confirmDialog({
  title,
  message,
  confirmLabel = '확인',
  cancelLabel = '취소',
  danger = false,
  requireText = null,
}) {
  return new Promise((resolve) => {
    const overlay = h('div', { class: 'modal-overlay' });
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      overlay.classList.add('closing');
      setTimeout(() => overlay.remove(), 200);
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };
    function onKey(event) {
      if (event.key === 'Escape') finish(false);
    }

    const confirmButton = h(
      'button',
      {
        class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`,
        type: 'button',
        onclick: () => finish(true),
        disabled: requireText ? true : null,
      },
      confirmLabel,
    );

    let textInput = null;
    if (requireText) {
      textInput = h('input', {
        class: 'input',
        type: 'text',
        placeholder: requireText,
        autocomplete: 'off',
        oninput: () => {
          confirmButton.disabled = textInput.value.trim() !== requireText;
        },
      });
    }

    const box = h(
      'div',
      { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
      h('h3', null, title),
      message ? h('p', { class: 'modal-message' }, message) : null,
      textInput,
      h(
        'div',
        { class: 'modal-actions' },
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => finish(false) }, cancelLabel),
        confirmButton,
      ),
    );
    overlay.appendChild(box);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) finish(false);
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));
    if (textInput) setTimeout(() => textInput.focus(), 140);
  });
}

// ---------------------------------------------------------------------------
// Local preferences (selected team they last looked at)
// ---------------------------------------------------------------------------

export function readPrefs() {
  try {
    return JSON.parse(localStorage.getItem('pitchos.web.prefs.v1') || '{}') || {};
  } catch {
    return {};
  }
}

export function writePrefs(patch) {
  const next = { ...readPrefs(), ...patch };
  try {
    localStorage.setItem('pitchos.web.prefs.v1', JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}
