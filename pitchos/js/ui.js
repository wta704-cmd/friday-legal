// DOM helpers and the small set of components the screens are built from.
// No framework: elements are created directly so the bundle stays a few static
// files that any static host can serve.

import { crestColor, crestInitials } from './lib/crest.js';

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
    } else if (key === 'ref') {
      el.dataset.ref = value;
    } else {
      el.setAttribute(key, value === true ? '' : value);
    }
  }
}

function append(el, children) {
  for (const child of children.flat(4)) {
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
  chart: 'M5 20V10m7 10V4m7 16v-7',
  user: 'M12 12.2a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4.5 20.5c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6',
  plus: 'M12 5v14M5 12h14',
  copy: 'M9 9.5V6.5A1.5 1.5 0 0 1 10.5 5h7A1.5 1.5 0 0 1 19 6.5v7a1.5 1.5 0 0 1-1.5 1.5h-3M6.5 9.5h7A1.5 1.5 0 0 1 15 11v7a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 5 18v-7a1.5 1.5 0 0 1 1.5-1.5',
  check: 'M5 12.5 9.5 17 19 7',
  x: 'M6 6l12 12M18 6 6 18',
  calendar: 'M4.5 8.5h15M7 4.5v3M17 4.5v3M5.5 6.5h13A1.5 1.5 0 0 1 20 8v11.5H4V8a1.5 1.5 0 0 1 1.5-1.5Z',
  pin: 'M12 21s6.5-6.2 6.5-11A6.5 6.5 0 0 0 5.5 10c0 4.8 6.5 11 6.5 11Z M12 12.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4',
  shield: 'M12 3.5 19 6v6c0 4.2-3 7.4-7 8.5-4-1.1-7-4.3-7-8.5V6l7-2.5Z',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v5.5M12 7.6v.6',
  logout: 'M15 8.5V6a1.5 1.5 0 0 0-1.5-1.5h-7A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5h7A1.5 1.5 0 0 0 15 18v-2.5M10 12h10m0 0-3-3m3 3-3 3',
  trash: 'M5 7h14M9.5 7V5.5h5V7M7 7l.8 12.2A1.5 1.5 0 0 0 9.3 20.5h5.4a1.5 1.5 0 0 0 1.5-1.4L17 7',
  refresh: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 5v4h-4',
  chevron: 'M9 5.5 15.5 12 9 18.5',
  back: 'M15 5.5 8.5 12 15 18.5',
  whistle: 'M14.5 9.5a5.5 5.5 0 1 0-4.6 8.9M14.5 9.5h5.2a2.3 2.3 0 0 0 0-4.6H10a6.5 6.5 0 0 1 4.5 4.6Z',
  ball: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7.2l3.6 2.6-1.4 4.2h-4.4L8.4 9.8 12 7.2Z M12 3v4.2M20.6 9.8l-4.9.6M17.5 19.4l-2.9-5M6.5 19.4l2.9-5M3.4 9.8l4.9.6',
  link: 'M10.5 13.5a3.5 3.5 0 0 0 5 0l2-2a3.54 3.54 0 0 0-5-5l-1 1M13.5 10.5a3.5 3.5 0 0 0-5 0l-2 2a3.54 3.54 0 0 0 5 5l1-1',
  lock: 'M6.5 10.5h11V20h-11zM8.8 10.5V8a3.2 3.2 0 0 1 6.4 0v2.5',
  share: 'M12 15V4m0 0L8.5 7.5M12 4l3.5 3.5M5 14v5.5h14V14',
};

export function icon(name, { size = 22, className = '' } = {}) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
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
// Bits
// ---------------------------------------------------------------------------

export function crest(name, { size = 44, logoUrl = null } = {}) {
  if (logoUrl) {
    return h('img', {
      class: 'crest',
      src: logoUrl,
      alt: '',
      width: size,
      height: size,
      style: { width: `${size}px`, height: `${size}px` },
    });
  }
  return h(
    'div',
    {
      class: 'crest',
      style: {
        width: `${size}px`,
        height: `${size}px`,
        background: crestColor(name),
        fontSize: `${Math.round(size * 0.38)}px`,
      },
      'aria-hidden': 'true',
    },
    crestInitials(name),
  );
}

export function badge(text, tone = 'muted') {
  return h('span', { class: `badge badge-${tone}` }, text);
}

export function chip(text, { tone = 'muted', iconName = null, onclick = null, active = false } = {}) {
  return h(
    'button',
    {
      class: `chip chip-${tone}${active ? ' is-active' : ''}`,
      type: 'button',
      onclick,
    },
    iconName ? icon(iconName, { size: 15 }) : null,
    h('span', null, text),
  );
}

export function spinner(label = '불러오는 중…') {
  return h('div', { class: 'spinner-wrap' }, h('div', { class: 'spinner' }), h('p', { class: 'muted' }, label));
}

export function emptyState({ iconName = 'info', title, body, actionLabel, onAction }) {
  return h(
    'div',
    { class: 'empty' },
    h('div', { class: 'empty-icon' }, icon(iconName, { size: 26 })),
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
    h('div', { class: 'empty-icon danger' }, icon('info', { size: 26 })),
    h('p', { class: 'empty-title' }, '불러오지 못했습니다'),
    h('p', { class: 'empty-body' }, error?.message || '잠시 뒤 다시 시도해 주세요.'),
    onRetry
      ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: onRetry }, '다시 시도')
      : null,
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

export function row(title, value, { sub = null, onClick = null } = {}) {
  return h(
    onClick ? 'button' : 'div',
    { class: 'list-row', type: onClick ? 'button' : null, onclick: onClick },
    h(
      'div',
      { class: 'list-row-main' },
      h('span', { class: 'list-row-title' }, title),
      sub ? h('span', { class: 'list-row-sub' }, sub) : null,
    ),
    h('span', { class: 'list-row-value' }, value),
    onClick ? icon('chevron', { size: 18, className: 'chev' }) : null,
  );
}

export function stat(label, value, { unit = '', tone = '' } = {}) {
  return h(
    'div',
    { class: `stat ${tone}` },
    h('span', { class: 'stat-value' }, value, unit ? h('small', null, ` ${unit}`) : null),
    h('span', { class: 'stat-label' }, label),
  );
}

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------

function fieldShell(label, control, hint, { required = false } = {}) {
  const wrap = h(
    'label',
    { class: 'field' },
    h('span', { class: 'field-label' }, label, required ? h('em', { class: 'req' }, '*') : null),
    control,
    hint ? h('span', { class: 'field-hint' }, hint) : null,
  );
  return wrap;
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
  return { el, input: control, get value() { return control.value; } };
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
  return { el, input: control, get value() { return control.value; } };
}

export function textarea({ label, value = '', placeholder = '', hint = '', maxlength = 4000, rows = 5, required = false }) {
  const control = h('textarea', { class: 'input textarea', placeholder, maxlength, rows, required: required || null }, value);
  const el = fieldShell(label, control, hint, { required });
  return { el, input: control, get value() { return control.value; } };
}

export function checkbox({ label, checked = false, hint = '', onChange = null }) {
  const control = h('input', { type: 'checkbox', checked: checked || null, onchange: onChange });
  const el = h(
    'label',
    { class: 'check' },
    control,
    h('span', null, h('span', { class: 'check-label' }, label), hint ? h('span', { class: 'check-hint' }, hint) : null),
  );
  return { el, input: control, get checked() { return control.checked; } };
}

export function switchToggle({ checked, label, onChange }) {
  const button = h('button', {
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
  }, h('span', { class: 'switch-knob' }));
  return button;
}

export function button(label, { kind = 'primary', onClick, iconName = null, size = '', type = 'button', disabled = false, block = false }) {
  return h(
    'button',
    {
      class: `btn btn-${kind}${size ? ` btn-${size}` : ''}${block ? ' btn-block' : ''}`,
      type,
      onclick: onClick,
      disabled: disabled || null,
    },
    iconName ? icon(iconName, { size: 18 }) : null,
    label,
  );
}

// ---------------------------------------------------------------------------
// Toast / sheet / dialog
// ---------------------------------------------------------------------------

let toastHost = null;
function host(id) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    document.body.appendChild(el);
  }
  toastHost = el;
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

export function openSheet({ title, subtitle = null, render, footer = null, onClose = null }) {
  const overlay = h('div', { class: 'sheet-overlay' });
  const body = h('div', { class: 'sheet-body' });
  const closeButton = h(
    'button',
    { class: 'icon-btn', type: 'button', 'aria-label': '닫기', onclick: () => close() },
    icon('x', { size: 20 }),
  );
  const head = h(
    'div',
    { class: 'sheet-head' },
    h('div', { class: 'sheet-titles' }, h('h2', null, title), subtitle ? h('p', null, subtitle) : null),
    closeButton,
  );
  const sheet = h(
    'div',
    { class: 'sheet', role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'sheet-grabber' }),
    head,
    body,
    footer ? h('div', { class: 'sheet-footer' }, footer) : null,
  );
  overlay.appendChild(sheet);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    overlay.classList.add('closing');
    setTimeout(() => overlay.remove(), 200);
    onClose?.();
  }

  document.body.appendChild(overlay);
  document.body.classList.add('sheet-open');
  requestAnimationFrame(() => overlay.classList.add('open'));
  Promise.resolve(render?.(body, { close })).catch((error) => {
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
      setTimeout(() => overlay.remove(), 180);
      resolve(value);
    };

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
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));
    if (textInput) setTimeout(() => textInput.focus(), 120);
  });
}

// ---------------------------------------------------------------------------
// Local preferences (selected team, last tab)
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
