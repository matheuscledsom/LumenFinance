/* ==========================================================================
   app.js — Ponto de Entrada: Boot, Roteamento de Abas, Render Central e Eventos
   ========================================================================== */

import { S, view, setView, save, resetState } from './state.js';
import { lum, con, parseCents } from './utils/currency.js';
import { home } from './components/home.js';
import { stats } from './components/stats.js';
import { calendar } from './components/calendar.js';
import { profile } from './components/profile.js';
import { openForm, cats } from './components/form-modal.js';

const $ = (s) => document.querySelector(s);

/**
 * Exibe uma mensagem rápida (toast) no topo da tela.
 */
export const toast = (m) => {
  const t = $('#toast');
  if (!t) return;
  t.textContent = m;
  t.style.display = 'block';
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.style.display = 'none'), 2600);
};

/**
 * Aplica o tema ativo e as variáveis CSS de destaque no elemento raiz.
 */
export function theme() {
  const d = document.documentElement;
  d.dataset.theme = S.theme;
  d.style.setProperty('--ac', S.accent);
  d.style.setProperty('--on', lum(S.accent) > 0.4 ? '#111' : '#fff');
}

/**
 * Reconstrói a view ativa e a barra de navegação a partir do estado central S.
 */
export function render() {
  theme();

  const app = $('#app');
  if (app) {
    app.innerHTML =
      view === 'home'
        ? home()
        : view === 'profile'
        ? profile()
        : view === 'stats'
        ? stats()
        : calendar();
  }

  const N = [
    ['home', '⌂', 'Início'],
    ['stats', '▥', 'Estatísticas'],
    ['cal', '▦', 'Calendário'],
    ['profile', '☺', 'Perfil']
  ];

  const nav = $('#nav');
  if (nav) {
    nav.innerHTML = N.map(
      (n) =>
        `<button data-v="${n[0]}" ${view === n[0] ? 'aria-current="page"' : ''}><span aria-hidden="true">${n[1]}</span>${n[2]}</button>`
    ).join('');
  }

  const p = $('#per');
  if (p) p.value = S.per;
}

/* ==========================================================================
   Delegação Centralizada de Eventos
   ========================================================================== */

document.addEventListener('click', (e) => {
  const g = (s) => e.target.closest(s);
  let b;

  if ((b = g('[data-add]'))) return openForm(b.dataset.add);
  if (g('#fab')) return openForm('out');
  if ((b = g('[data-v]'))) {
    setView(b.dataset.v);
    return render();
  }
  if (g('#eye')) {
    S.hide = !S.hide;
    save();
    return render();
  }
  if ((b = g('[data-th]'))) {
    S.theme = b.dataset.th;
    save();
    return render();
  }
  if ((b = g('[data-ac]'))) {
    S.accent = b.dataset.ac;
    save();
    return render();
  }
  if ((b = g('[data-t]'))) {
    $('#f').dataset.type = b.dataset.t;
    return cats();
  }
  if (g('#fx')) return $('#dlg').close();

  if ((b = g('.tx'))) {
    const t = S.tx.find((x) => x.id == b.dataset.id);
    if (t && confirm('Excluir "' + t.n + '"?')) {
      S.tx = S.tx.filter((x) => x !== t);
      save();
      render();
      toast('Movimentação excluída');
    }
    return;
  }

  if (g('#rst') && confirm('Apagar todas as movimentações e preferências?')) {
    resetState();
    render();
    toast('Dados apagados');
  }
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'per') {
    S.per = +e.target.value;
    save();
    render();
  }
  if (e.target.id === 'cc') {
    const c = e.target.value;
    const bg = getComputedStyle(document.documentElement)
      .getPropertyValue('--bg')
      .trim();
    if (
      bg[0] === '#' &&
      con(c, bg.length === 4 ? '#' + [...bg.slice(1)].map((x) => x + x).join('') : bg) < 3
    ) {
      toast('Contraste insuficiente com este tema. Escolha outra cor.');
      e.target.value = S.accent;
      return;
    }
    S.accent = c;
    save();
    render();
  }
  if (e.target.id === 'nm') {
    S.name = e.target.value.trim() || 'Matheus';
    save();
  }
});

const formEl = $('#f');
if (formEl) {
  formEl.addEventListener('submit', (e) => {
    const v = parseCents($('#fv').value);
    if (!(v > 0)) {
      e.preventDefault();
      $('#fe').textContent = 'Informe um valor maior que zero, como 45,50.';
      return;
    }
    S.tx.push({
      id: Date.now(),
      type: $('#f').dataset.type,
      v,
      n: $('#fn').value.trim(),
      c: $('#fc').value,
      d: $('#fd').value
    });
    save();
    render();
    toast('Movimentação salva');
  });
}

/* ==========================================================================
   Inicialização e Service Worker (PWA)
   ========================================================================== */

render();

if (
  typeof navigator !== 'undefined' &&
  'serviceWorker' in navigator &&
  (location.protocol === 'https:' ||
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1')
) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
