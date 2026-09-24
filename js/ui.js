// Petits outils d'interface : création d'éléments sûre (pas d'innerHTML), feuilles, toasts, dates.

/** h('div.card', { onclick }, ...enfants) — le texte est toujours inséré comme texte. */
export function h(tag, props = {}, ...children) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key in el && key !== 'list') el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export function toast(message, kind = 'info') {
  document.querySelectorAll('.toast').forEach((old) => old.remove());
  const el = h(`div.toast.${kind}`, { role: 'status' }, message);
  document.body.append(el);
  setTimeout(() => el.remove(), 2600);
}

/** Feuille plein écran (modale). `render(close)` renvoie le contenu. */
export function openSheet(title, render, { onClose } = {}) {
  const previousFocus = document.activeElement;
  const close = () => {
    sheet.remove();
    onClose?.();
    previousFocus?.focus?.();
  };
  const body = h('div.sheet-body');
  const sheet = h(
    'div.sheet',
    { role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('header.sheet-head', {}, h('button.link', { type: 'button', onclick: close }, 'Fermer'), h('h2', {}, title), h('span')),
    body,
  );
  sheet.addEventListener('keydown', (e) => e.key === 'Escape' && close());
  document.body.append(sheet);
  body.append(render(close));
  sheet.querySelector('input, button:not(.link)')?.focus?.({ preventScroll: true });
  return close;
}

export const fmt = (n, digits = 0) =>
  Number.isFinite(n) ? n.toLocaleString('fr-FR', { maximumFractionDigits: digits, minimumFractionDigits: 0 }) : '–';

export function isoDate(date = new Date()) {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 10);
}

export function shiftDate(iso, days) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

export function dateLabel(iso) {
  const today = isoDate();
  if (iso === today) return "Aujourd'hui";
  if (iso === shiftDate(today, -1)) return 'Hier';
  if (iso === shiftDate(today, 1)) return 'Demain';
  return new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** Barre de progression simple. */
export function bar(value, target, { label, unit = 'g', limit = false } = {}) {
  const ratio = target ? value / target : 0;
  const over = ratio > 1.05;
  const state = limit ? (over ? 'bad' : 'ok') : over ? 'over' : ratio >= 0.9 ? 'ok' : '';
  return h(
    'div.bar',
    {},
    h('div.bar-row', {}, h('span', {}, label), h('span.muted', {}, `${fmt(value)} / ${fmt(target)} ${unit}`)),
    h('div.bar-track', {}, h(`div.bar-fill.${state || 'none'}`, { style: { width: `${Math.min(100, ratio * 100)}%` } })),
  );
}

export function gradeBadge(kind, grade) {
  if (!grade) return null;
  const text = kind === 'nova' ? `NOVA ${grade}` : `${kind === 'eco' ? 'Éco' : 'Nutri'}-Score ${String(grade).toUpperCase()}`;
  return h(`span.badge.${kind}-${String(grade).toLowerCase()}`, {}, text);
}
