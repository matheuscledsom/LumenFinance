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
  createInstallments,
  materializeRecurring,
  toggleReimbursement,
  confirmTransaction,
  addCategory,
  removeCategory,
  setCategoryBudget,
  removeCategoryBudget,
  setSavingsGoal,
  getCategoryBudgetsProgress,
  resetState,
  normalizePay,
  removeCard,
  removeDebt,
  removeShortcut,
  runShortcut
} from './state';
import type {
  Category,
  Theme,
  ThirdPartyInfo,
  Transaction,
  TransactionType,
  ViewName
} from './types/finance';
import { brl, lum, con, parseCents } from './utils/currency';
import { parseAmountInput } from './utils/qol';
import { home } from './components/home';
import { stats } from './components/stats';
import {
  calendar,
  stepCalMonth,
  goCalToday,
  selectCalDate,
  selectedDateStr
} from './components/calendar';
import { profile, profileCatTab, setProfileCatTab } from './components/profile';
import {
  history,
  historyFilters,
  updateHistoryFilters,
  clearHistoryFilters,
  loadMoreHistory,
  renderHistoryResultsSection
} from './components/history';
import { debts, debtsTab, setDebtsTab, buildWhatsAppLink } from './components/debts';
import {
  openShortcutDialog,
  openDebtDialog,
  openAmortizeDialog,
  openCardDialog,
  closeDialog2,
  submitDialog2
} from './components/dialogs';
import {
  onboarding,
  nextOnboardingStep,
  prevOnboardingStep,
  finishOnboarding
} from './components/onboarding';
import {
  openForm,
  pasteAmountFromClipboard,
  cats,
  getFormTags,
  addFormTag,
  removeFormTag
} from './components/form-modal';

const $ = <T extends Element = HTMLElement>(s: string): T | null =>
  document.querySelector<T>(s);

let toastTimer: ReturnType<typeof setTimeout> | undefined;
let toastUndo: (() => void) | null = null;
let lastBalanceTap = 0;

export interface ToastAction {
  label: string;
  run: () => void;
}

/**
 * Exibe uma mensagem rápida (toast) no topo da tela, com ação opcional (ex.: "Desfazer").
 */
export const toast = (m: string, action?: ToastAction): void => {
  const t = $<HTMLElement>('#toast');
  if (!t) return;
  t.textContent = m;
  toastUndo = null;
  if (action) {
    toastUndo = action.run;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-undo';
    btn.dataset.toastUndo = '1';
    btn.textContent = action.label;
    t.append(' ', btn);
  }
  t.style.display = 'block';
  if (toastTimer !== undefined) {
    clearTimeout(toastTimer);
  }
  toastTimer = setTimeout(() => {
    t.style.display = 'none';
    toastUndo = null;
  }, action ? 5500 : 2600);
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
        : view === 'history'
        ? history()
        : view === 'debts'
        ? debts()
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
    ['debts', '⇄', 'Dívidas'],
    ['profile', '☺', 'Perfil']
  ];

  const nav = $<HTMLElement>('#nav');
  if (nav) {
    nav.innerHTML = N.map(
      (n) =>
        `<button data-v="${n[0]}" ${view === n[0] || (view === 'history' && n[0] === 'home') ? 'aria-current="page"' : ''}><span aria-hidden="true">${n[1]}</span>${n[2]}</button>`
    ).join('');
  }

  const onbRoot = $<HTMLElement>('#onb-root');
  if (onbRoot) onbRoot.innerHTML = onboarding();

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

  if (g('[data-toast-undo]')) {
    const undo = toastUndo;
    toastUndo = null;
    const t = $<HTMLElement>('#toast');
    if (t) t.style.display = 'none';
    if (undo) undo();
    return;
  }

  if (g('.bal')) {
    const tapAt = Date.now();
    if (tapAt - lastBalanceTap < 350) {
      lastBalanceTap = 0;
      S.hide = !S.hide;
      save();
      render();
      return;
    }
    lastBalanceTap = tapAt;
  }

  if (g('[data-onb-next]')) {
    nextOnboardingStep();
    render();
    return;
  }
  if (g('[data-onb-prev]')) {
    prevOnboardingStep();
    render();
    return;
  }
  if (g('[data-onb-skip]')) {
    finishOnboarding(true);
    render();
    return;
  }
  if (g('[data-onb-finish]')) {
    finishOnboarding();
    render();
    toast(`Tudo pronto, ${S.name}!`);
    return;
  }

  if ((b = g('[data-quick]'))) {
    const created = b.dataset.quick ? runShortcut(b.dataset.quick) : null;
    if (created) {
      render();
      toast(`${created.n} registrado · ${brl(created.v)}`, {
        label: 'Desfazer',
        run: () => {
          deleteTx(created.id);
          render();
          toast('Lançamento desfeito');
        }
      });
    }
    return;
  }

  if (g('[data-shortcut-add]')) {
    openShortcutDialog();
    return;
  }

  if ((b = g('[data-del-shortcut]'))) {
    if (b.dataset.delShortcut) {
      removeShortcut(b.dataset.delShortcut);
      render();
      toast('Atalho removido');
    }
    return;
  }

  if (g('[data-close-dlg2]')) {
    closeDialog2();
    return;
  }

  if ((b = g('[data-fill-remaining]'))) {
    const am = $<HTMLInputElement>('#am-v');
    if (am) am.value = b.dataset.fillRemaining ?? '';
    return;
  }

  if (g('[data-card-add]')) {
    openCardDialog();
    return;
  }
  if ((b = g('[data-card-edit]'))) {
    openCardDialog(b.dataset.cardEdit);
    return;
  }
  if ((b = g('[data-card-del]'))) {
    const card = S.cards.find((c) => c.id === b?.dataset.cardDel);
    if (card && confirm(`Excluir o cartão "${card.name}"? As compras serão mantidas sem cartão.`)) {
      removeCard(card.id);
      render();
      toast('Cartão removido');
    }
    return;
  }

  if ((b = g('[data-debt-tab]'))) {
    setDebtsTab(b.dataset.debtTab === 'to_pay' ? 'to_pay' : 'to_receive');
    render();
    return;
  }
  if (g('[data-debt-add]')) {
    openDebtDialog(debtsTab);
    return;
  }
  if ((b = g('[data-debt-pay]'))) {
    if (b.dataset.debtPay) openAmortizeDialog(b.dataset.debtPay);
    return;
  }
  if ((b = g('[data-debt-del]'))) {
    const debt = S.debts.find((d) => d.id === b?.dataset.debtDel);
    if (debt && confirm(`Excluir a dívida de "${debt.personName}"?`)) {
      removeDebt(debt.id);
      render();
      toast('Dívida removida');
    }
    return;
  }
  if ((b = g('[data-debt-wa]'))) {
    const debt = S.debts.find((d) => d.id === b?.dataset.debtWa);
    if (debt) {
      if (debt.pixKey && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard
          .writeText(debt.pixKey)
          .then(() => toast('Chave Pix copiada e mensagem aberta no WhatsApp'))
          .catch(() => toast('Não foi possível copiar a chave Pix'));
      }
      window.open(buildWhatsAppLink(debt), '_blank', 'noopener');
    }
    return;
  }

  if (g('#fpaste')) {
    pasteAmountFromClipboard().then((ok) =>
      toast(ok ? 'Valor colado da área de transferência' : 'Nenhum valor encontrado na área de transferência')
    );
    return;
  }

  if ((b = g('[data-toggle-tp]'))) {
    e.stopPropagation();
    const txId = b.dataset.toggleTp;
    if (txId) {
      toggleReimbursement(txId);
      const updated = S.tx.find((x) => String(x.id) === String(txId));
      render();
      toast(
        updated?.thirdParty?.isReimbursed
          ? 'Reembolso marcado como Pago!'
          : 'Marcado como A Cobrar'
      );
    }
    return;
  }

  if ((b = g('[data-confirm-tx]'))) {
    e.stopPropagation();
    const txId = b.dataset.confirmTx;
    if (txId) {
      confirmTransaction(txId);
      render();
      toast('Conta marcada como paga!');
    }
    return;
  }

  if (g('#cal-prev')) {
    stepCalMonth(-1);
    render();
    return;
  }

  if (g('#cal-next')) {
    stepCalMonth(1);
    render();
    return;
  }

  if (g('#cal-today')) {
    goCalToday();
    render();
    return;
  }

  if ((b = g('[data-cal-date]'))) {
    const dt = b.dataset.calDate;
    if (dt) {
      selectCalDate(dt);
      render();
    }
    return;
  }

  if (g('#hist-clear-q')) {
    updateHistoryFilters({ query: '' });
    render();
    $<HTMLInputElement>('#hist-search')?.focus();
    return;
  }

  if (g('#hist-reset') || g('#hist-reset-empty')) {
    clearHistoryFilters();
    render();
    return;
  }

  if ((b = g('[data-hist-type]'))) {
    const t = b.dataset.histType;
    if (t === 'all' || t === 'in' || t === 'out') {
      updateHistoryFilters({ type: t });
      render();
    }
    return;
  }

  if (g('[data-hist-pending]')) {
    updateHistoryFilters({ onlyPending: !historyFilters.onlyPending });
    render();
    return;
  }

  if (g('[data-hist-tp]')) {
    updateHistoryFilters({ onlyThirdParty: !historyFilters.onlyThirdParty });
    render();
    return;
  }

  if ((b = g('[data-hist-pay]'))) {
    const p = b.dataset.histPay;
    if (p) {
      const normalized = normalizePay(p);
      updateHistoryFilters({
        paymentMethod: historyFilters.paymentMethod === normalized ? 'all' : normalized
      });
      render();
    }
    return;
  }

  if ((b = g('[data-hist-tag]'))) {
    const tg = b.dataset.histTag ?? '';
    updateHistoryFilters({
      tag: historyFilters.tag === tg ? '' : tg
    });
    render();
    return;
  }

  if (g('#hist-more')) {
    loadMoreHistory();
    render();
    return;
  }

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

  if ((b = g('[data-clear-budget]'))) {
    const catId = b.dataset.clearBudget;
    if (catId) {
      removeCategoryBudget(catId);
      render();
      toast('Orçamento removido');
    }
    return;
  }

  if (g('#fgoal-save')) {
    const goalInput = $<HTMLInputElement>('#fgoal');
    const cents = parseCents(goalInput?.value);
    setSavingsGoal(cents > 0 ? cents : 0);
    render();
    toast(cents > 0 ? 'Meta de economia atualizada' : 'Meta de economia removida');
    return;
  }

  if (g('#fgoal-clear')) {
    setSavingsGoal(0);
    render();
    toast('Meta de economia removida');
    return;
  }

  if ((b = g('[data-add]'))) {
    const addType: TransactionType = b.dataset.add === 'in' ? 'in' : 'out';
    openForm(addType, null, view === 'cal' ? selectedDateStr : undefined);
    return;
  }
  if (g('#fab')) {
    openForm('out', null, view === 'cal' ? selectedDateStr : undefined);
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
    return;
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
    return;
  }
  if (target.id === 'nm') {
    S.name = target.value.trim() || 'Matheus';
    save();
    return;
  }
  if (target.id === 'fgoal') {
    const cents = parseCents(target.value);
    setSavingsGoal(cents > 0 ? cents : 0);
    render();
    toast(cents > 0 ? 'Meta de economia atualizada' : 'Meta de economia removida');
    return;
  }
  if (target.id === 'round-toggle') {
    S.roundUpEnabled = (target as HTMLInputElement).checked;
    save();
    render();
    toast(S.roundUpEnabled ? 'Cofrinho de arredondamento ativado' : 'Cofrinho desativado');
    return;
  }
  if (target.id === 'hist-cat') {
    updateHistoryFilters({ categoryId: target.value });
    render();
    return;
  }
  if (target.id === 'hist-pay') {
    updateHistoryFilters({
      paymentMethod: target.value === 'all' ? 'all' : normalizePay(target.value)
    });
    render();
    return;
  }
  if (target.id === 'hist-start') {
    updateHistoryFilters({ startDate: target.value });
    render();
    return;
  }
  if (target.id === 'hist-end') {
    updateHistoryFilters({ endDate: target.value });
    render();
    return;
  }
  if (target.dataset && target.dataset.budgetInput) {
    const catId = target.dataset.budgetInput;
    const cents = parseCents(target.value);
    if (cents > 0) {
      setCategoryBudget(catId, cents);
      render();
      toast('Orçamento atualizado');
    } else {
      removeCategoryBudget(catId);
      render();
      toast('Orçamento removido');
    }
  }
});

let histSearchTimer: ReturnType<typeof setTimeout> | undefined;

document.addEventListener('input', (e: Event) => {
  const target = e.target as HTMLInputElement | null;
  if (!target) return;

  if (target.id === 'hist-search' || target.id === 'q') {
    const val = target.value;
    if (histSearchTimer !== undefined) {
      clearTimeout(histSearchTimer);
    }
    histSearchTimer = setTimeout(() => {
      updateHistoryFilters({ query: val });
      const dynArea = $<HTMLElement>('#hist-dynamic-area');
      if (dynArea) {
        dynArea.innerHTML = renderHistoryResultsSection();
      } else {
        render();
      }
    }, 150);
  }
});

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('scroll', () => {
    if (view !== 'history') return;
    const moreBtn = $<HTMLButtonElement>('#hist-more');
    if (!moreBtn) return;
    const scrollBottom = window.innerHeight + window.scrollY;
    const docHeight = document.documentElement.offsetHeight || document.body?.offsetHeight || 0;
    if (docHeight > 0 && scrollBottom >= docHeight - 160) {
      loadMoreHistory();
      const dynArea = $<HTMLElement>('#hist-dynamic-area');
      if (dynArea) {
        dynArea.innerHTML = renderHistoryResultsSection();
      }
    }
  });
}

const handleTxFormSubmit = (e: SubmitEvent, formEl: HTMLFormElement): void => {
  const fv = $<HTMLInputElement>('#fv');
  const fn = $<HTMLInputElement>('#fn');
  const fc = $<HTMLSelectElement>('#fc');
  const fpay = $<HTMLSelectElement>('#fpay');
  const fd = $<HTMLInputElement>('#fd');
  const frec = $<HTMLInputElement>('#frec');
  const finst = $<HTMLInputElement>('#finst');
  const ftp = $<HTMLInputElement>('#ftp');
  const ftpName = $<HTMLInputElement>('#ftp-name');
  const ftag = $<HTMLInputElement>('#ftag');
  const fe = $<HTMLElement>('#fe');

  const v = parseAmountInput(fv?.value);
  if (!(v > 0)) {
    e.preventDefault();
    if (fe) fe.textContent = 'Informe um valor maior que zero, como 45,50.';
    return;
  }

  const activeType = (formEl.dataset.type === 'in' ? 'in' : 'out') as TransactionType;
  const isTpChecked = activeType === 'out' && Boolean(ftp?.checked);
  const tpPerson = (ftpName?.value || '').trim();

  if (isTpChecked && !tpPerson) {
    e.preventDefault();
    if (fe) fe.textContent = 'Informe o nome da pessoa para a compra de terceiro.';
    return;
  }

  if (ftag && ftag.value.trim()) {
    addFormTag(ftag.value);
    ftag.value = '';
  }

  const txId = formEl.dataset.txId;
  const existing = txId ? S.tx.find((t) => String(t.id) === String(txId)) : undefined;
  const instCount = Math.min(72, Math.max(1, parseInt(finst?.value || '1', 10) || 1));
  const isRecurring = Boolean(frec?.checked) && instCount === 1;

  const thirdPartyObj: ThirdPartyInfo | undefined = isTpChecked
    ? {
        isThirdParty: true,
        personName: tpPerson,
        isReimbursed: existing?.thirdParty?.isReimbursed ?? false
      }
    : undefined;

  const fcardEl = $<HTMLSelectElement>('#fcard');
  const cardId =
    activeType === 'out' &&
    normalizePay(fpay?.value) === 'credit' &&
    fcardEl?.value &&
    S.cards.some((c) => c.id === fcardEl.value)
      ? fcardEl.value
      : undefined;

  const baseFields = {
    cardId,
    type: activeType,
    v,
    n: (fn?.value || '').trim(),
    c: (fc?.value || 'Outros') as Category,
    d: fd?.value || '',
    pay: normalizePay(fpay?.value),
    tags: getFormTags(),
    thirdParty: thirdPartyObj
  };

  if (txId) {
    const updatedData: Partial<Transaction> = {
      ...baseFields,
      recurring: isRecurring
        ? {
            groupId: existing?.recurring?.groupId || crypto.randomUUID(),
            frequency: 'monthly',
            isTemplate: existing?.recurring?.isTemplate ?? true
          }
        : undefined
    };
    updateTx(txId, updatedData);
    delete formEl.dataset.txId;
  } else if (instCount > 1) {
    const generated = createInstallments(
      {
        ...baseFields,
        thirdParty: isTpChecked
          ? { isThirdParty: true, personName: tpPerson, isReimbursed: false }
          : undefined
      },
      instCount
    );
    S.tx.push(...generated);
    save();
  } else if (isRecurring) {
    addTx({
      id: crypto.randomUUID(),
      ...baseFields,
      recurring: {
        groupId: crypto.randomUUID(),
        frequency: 'monthly',
        isTemplate: true
      }
    });
    materializeRecurring();
  } else {
    addTx({
      id: crypto.randomUUID(),
      ...baseFields
    });
  }

  render();

  if (baseFields.type === 'out' && !isTpChecked && baseFields.d) {
    const txMonth = baseFields.d.slice(0, 7);
    const progresses = getCategoryBudgetsProgress(txMonth);
    const catProg = progresses.find(
      (p) =>
        p.categoryName.toLowerCase() === baseFields.c.toLowerCase() ||
        p.categoryId === baseFields.c
    );
    if (catProg && catProg.isOverBudget) {
      toast(`Atenção: Limite mensal de ${catProg.categoryName} ultrapassado!`);
      return;
    }
  }

  toast(txId ? 'Movimentação atualizada' : 'Movimentação salva');
};

document.addEventListener('submit', (e: SubmitEvent) => {
  const target = e.target as HTMLFormElement | null;
  if (!target) return;

  if (target.id === 'f2') {
    e.preventDefault();
    const res = submitDialog2(target);
    if (!res.ok) {
      const err = $<HTMLElement>('#f2e');
      if (err) err.textContent = res.message;
      return;
    }
    closeDialog2();
    render();
    toast(res.message);
    return;
  }

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

materializeRecurring();
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
