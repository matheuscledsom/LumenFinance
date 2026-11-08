/* ==========================================================================
   main.ts — Ponto de Entrada: Boot, Roteamento de Abas, Render Central e Eventos
   ========================================================================== */

import {
  S,
  view,
  setView,
  save,
  addTx,
  updateTx,
  deleteTx,
  addCategory,
  removeCategory,
  resetState,
  normalizePay
} from './state';
import type { Category, Theme, TransactionType, ViewName } from './types/finance';
import { lum, con, parseCents } from './utils/currency';
import { home } from './components/home';
import { stats } from './components/stats';
import { calendar } from './components/calendar';
import { profile, profileCatTab, setProfileCatTab } from './components/profile';
import {
  openForm,
  cats,
  getFormTags,
  addFormTag,
  removeFormTag
} from './components/form-modal';

const $ = <T extends Element = HTMLElement>(s: string): T | null =>
  document.querySelector<T>(s);

let toastTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Exibe uma mensagem rápida (toast) no topo da tela.
 */
export const toast = (m: string): void => {
  const t = $<HTMLElement>('#toast');
  if (!t) return;
  t.textContent = m;
  t.style.display = 'block';
  if (toastTimer !== undefined) {
    clearTimeout(toastTimer);
  }
  toastTimer = setTimeout(() => {
    t.style.display = 'none';
  }, 2600);
};

/**
 * Aplica o tema ativo e as variáveis CSS de destaque no elemento raiz.
 */
export function theme(): void {
  const d = document.documentElement;
  d.dataset.theme = S.theme;
  d.style.setProperty('--ac', S.accent);
  d.style.setProperty('--on', lum(S.accent) > 0.4 ? '#111' : '#fff');
}

/**
 * Reconstrói a view ativa e a barra de navegação a partir do estado central S.
 */
export function render(): void {
  theme();

  const app = $<HTMLElement>('#app');
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

  const N: [ViewName, string, string][] = [
    ['home', '⌂', 'Início'],
    ['stats', '▥', 'Estatísticas'],
    ['cal', '▦', 'Calendário'],
    ['profile', '☺', 'Perfil']
  ];

  const nav = $<HTMLElement>('#nav');
  if (nav) {
    nav.innerHTML = N.map(
      (n) =>
        `<button data-v="${n[0]}" ${view === n[0] ? 'aria-current="page"' : ''}><span aria-hidden="true">${n[1]}</span>${n[2]}</button>`
    ).join('');
  }

  const p = $<HTMLSelectElement>('#per');
  if (p) p.value = String(S.per);
}

/* ==========================================================================
   Delegação Centralizada de Eventos
   ========================================================================== */

document.addEventListener('click', (e: MouseEvent) => {
  const target = e.target as Element | null;
  if (!target || typeof target.closest !== 'function') return;
  const g = <T extends HTMLElement = HTMLElement>(s: string): T | null =>
    target.closest<T>(s);
  let b: HTMLElement | null;

  if ((b = g('[data-rm-tag]'))) {
    const tag = b.dataset.rmTag;
    if (tag) removeFormTag(tag);
    return;
  }

  if ((b = g('[data-cat-tab]'))) {
    const nextTab: TransactionType = b.dataset.catTab === 'in' ? 'in' : 'out';
    setProfileCatTab(nextTab);
    render();
    return;
  }

  if ((b = g('[data-del-cat]'))) {
    const catId = b.dataset.delCat;
    const catType: TransactionType = b.dataset.catType === 'in' ? 'in' : 'out';
    if (catId) {
      if (removeCategory(catType, catId)) {
        render();
        toast('Categoria removida');
      } else {
        toast('Não é possível excluir categoria em uso ou padrão única');
      }
    }
    return;
  }

  if ((b = g('[data-add]'))) {
    const addType: TransactionType = b.dataset.add === 'in' ? 'in' : 'out';
    openForm(addType);
    return;
  }
  if (g('#fab')) {
    openForm('out');
    return;
  }
  if ((b = g('[data-v]'))) {
    const nextView = b.dataset.v as ViewName | undefined;
    if (nextView) {
      setView(nextView);
      render();
    }
    return;
  }
  if (g('#eye')) {
    S.hide = !S.hide;
    save();
    render();
    return;
  }
  if ((b = g('[data-th]'))) {
    const nextTheme = b.dataset.th as Theme | undefined;
    if (nextTheme) {
      S.theme = nextTheme;
      save();
      render();
    }
    return;
  }
  if ((b = g('[data-ac]'))) {
    if (b.dataset.ac) {
      S.accent = b.dataset.ac;
      save();
      render();
    }
    return;
  }
  if ((b = g('[data-t]'))) {
    const f = $<HTMLFormElement>('#f');
    if (f && b.dataset.t) {
      f.dataset.type = b.dataset.t;
      cats();
    }
    return;
  }
  if (g('#fx')) {
    $<HTMLDialogElement>('#dlg')?.close();
    return;
  }

  if ((b = g('#fdel') || g('[data-del]'))) {
    const f = $<HTMLFormElement>('#f');
    const txId = b.dataset.del || f?.dataset.txId;
    const t = S.tx.find((x) => String(x.id) === String(txId));
    if (txId && confirm(t ? `Excluir "${t.n}"?` : 'Excluir esta movimentação?')) {
      deleteTx(txId);
      if (f) delete f.dataset.txId;
      $<HTMLDialogElement>('#dlg')?.close();
      render();
      toast('Movimentação excluída');
    }
    return;
  }

  if ((b = g('.tx'))) {
    const t = S.tx.find((x) => String(x.id) === String(b?.dataset.id));
    if (t) openForm(t.type, t.id);
    return;
  }

  if (g('#rst') && confirm('Apagar todas as movimentações e preferências?')) {
    resetState();
    render();
    toast('Dados apagados');
  }
});

document.addEventListener('change', (e: Event) => {
  const target = e.target as HTMLInputElement | HTMLSelectElement | null;
  if (!target) return;

  if (target.id === 'per') {
    S.per = +target.value;
    save();
    render();
  }
  if (target.id === 'cc') {
    const c = target.value;
    const bg = getComputedStyle(document.documentElement)
      .getPropertyValue('--bg')
      .trim();
    if (
      bg[0] === '#' &&
      con(c, bg.length === 4 ? '#' + [...bg.slice(1)].map((x) => x + x).join('') : bg) < 3
    ) {
      toast('Contraste insuficiente com este tema. Escolha outra cor.');
      target.value = S.accent;
      return;
    }
    S.accent = c;
    save();
    render();
  }
  if (target.id === 'nm') {
    S.name = target.value.trim() || 'Matheus';
    save();
  }
});

const handleTxFormSubmit = (e: SubmitEvent, formEl: HTMLFormElement): void => {
  const fv = $<HTMLInputElement>('#fv');
  const fn = $<HTMLInputElement>('#fn');
  const fc = $<HTMLSelectElement>('#fc');
  const fpay = $<HTMLSelectElement>('#fpay');
  const fd = $<HTMLInputElement>('#fd');
  const ftag = $<HTMLInputElement>('#ftag');
  const fe = $<HTMLElement>('#fe');

  const v = parseCents(fv?.value);
  if (!(v > 0)) {
    e.preventDefault();
    if (fe) fe.textContent = 'Informe um valor maior que zero, como 45,50.';
    return;
  }

  if (ftag && ftag.value.trim()) {
    addFormTag(ftag.value);
    ftag.value = '';
  }

  const txId = formEl.dataset.txId;
  const updatedFields = {
    type: (formEl.dataset.type === 'in' ? 'in' : 'out') as TransactionType,
    v,
    n: (fn?.value || '').trim(),
    c: (fc?.value || 'Outros') as Category,
    d: fd?.value || '',
    pay: normalizePay(fpay?.value),
    tags: getFormTags()
  };

  if (txId) {
    updateTx(txId, updatedFields);
    delete formEl.dataset.txId;
    render();
    toast('Movimentação atualizada');
  } else {
    addTx({
      id: crypto.randomUUID(),
      ...updatedFields
    });
    render();
    toast('Movimentação salva');
  }
};

document.addEventListener('submit', (e: SubmitEvent) => {
  const target = e.target as HTMLFormElement | null;
  if (!target) return;

  if (target.id === 'fcat') {
    e.preventDefault();
    const nameInput = $<HTMLInputElement>('#fcat-name');
    const iconInput = $<HTMLInputElement>('#fcat-icon');
    const name = nameInput?.value || '';
    const icon = iconInput?.value || '🏷';
    if (addCategory(profileCatTab, name, icon)) {
      render();
      toast('Categoria adicionada');
    } else {
      toast('Categoria inválida ou já existente');
    }
    return;
  }

  if (target.id === 'f') {
    handleTxFormSubmit(e, target);
  }
});

const formEl = $<HTMLFormElement>('#f');
if (formEl && typeof formEl.addEventListener === 'function') {
  formEl.addEventListener('submit', (e: SubmitEvent) => {
    if (e.target && (e.target as HTMLElement).id === 'f') return;
    handleTxFormSubmit(e, formEl);
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
