/* ==========================================================================
   history.ts — Histórico Completo de Movimentações com Busca Textual,
                Filtros Combinados Dinâmicos e Paginação Leve em Blocos de 20
   ========================================================================== */

import {
  S,
  filterTransactions,
  normalizePay,
  normalizeTags,
  prevView
} from '../state';
import {
  PAYMENT_METHODS,
  getCategoryIcon,
  getPaymentLabel,
  type PaymentMethod,
  type TransactionFilters
} from '../types/finance';
import { brl, esc } from '../utils/currency';
import { dfmt } from '../utils/date';

export const HISTORY_PAGE_SIZE = 20;

export const historyFilters: TransactionFilters = {
  query: '',
  type: 'all',
  categoryId: 'all',
  paymentMethod: 'all',
  cardId: 'all',
  accountId: 'all',
  tag: '',
  startDate: '',
  endDate: '',
  onlyPending: false,
  onlyThirdParty: false
};

export let historyLimit: number = HISTORY_PAGE_SIZE;

/**
 * Redefine a paginação para o bloco inicial de 20 itens.
 */
export const resetHistoryPagination = (): void => {
  historyLimit = HISTORY_PAGE_SIZE;
};

/**
 * Expande o limite de itens renderizados em mais um bloco de 20 itens.
 */
export const loadMoreHistory = (): void => {
  historyLimit += HISTORY_PAGE_SIZE;
};

/**
 * Atualiza parcialmente os filtros do histórico e reinicia a paginação.
 */
export const updateHistoryFilters = (
  patch: Partial<TransactionFilters>
): void => {
  Object.assign(historyFilters, patch);
  resetHistoryPagination();
};

/**
 * Limpa todos os critérios de busca e filtragem do histórico.
 */
export const clearHistoryFilters = (): void => {
  historyFilters.query = '';
  historyFilters.type = 'all';
  historyFilters.categoryId = 'all';
  historyFilters.paymentMethod = 'all';
  historyFilters.cardId = 'all';
  historyFilters.accountId = 'all';
  historyFilters.tag = '';
  historyFilters.startDate = '';
  historyFilters.endDate = '';
  historyFilters.onlyPending = false;
  historyFilters.onlyThirdParty = false;
  resetHistoryPagination();
};

/**
 * Verifica se há algum filtro ou busca ativa no momento.
 */
export const hasActiveHistoryFilters = (): boolean =>
  Boolean(
    historyFilters.query.trim() ||
      (historyFilters.type && historyFilters.type !== 'all') ||
      (historyFilters.categoryId && historyFilters.categoryId !== 'all') ||
      (historyFilters.paymentMethod && historyFilters.paymentMethod !== 'all') ||
      (historyFilters.cardId && historyFilters.cardId !== 'all') ||
      (historyFilters.accountId && historyFilters.accountId !== 'all') ||
      (historyFilters.tag && historyFilters.tag.trim()) ||
      (historyFilters.startDate && historyFilters.startDate.trim()) ||
      (historyFilters.endDate && historyFilters.endDate.trim()) ||
      historyFilters.onlyPending ||
      historyFilters.onlyThirdParty
  );

/**
 * Extrai as tags mais frequentes presentes em S.tx (até 12 tags).
 */
export const getFrequentTags = (limit = 12): [string, number][] => {
  const counts = new Map<string, number>();
  for (const tx of S.tx) {
    const tags = normalizeTags(tx.tags);
    for (const tag of tags) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);
};

/**
 * Renderiza o card de resumo filtrado e a lista paginada de movimentações.
 * Pode ser invocado isoladamente durante a digitação com debounce para preservar o foco no input.
 */
export function renderHistoryResultsSection(): string {
  const result = filterTransactions(historyFilters);
  const visibleItems = result.items.slice(0, historyLimit);
  const remaining = Math.max(0, result.totalCount - visibleItems.length);
  const activeFilters = hasActiveHistoryFilters();

  const summaryHtml = `<section class="card wide filter-summary" aria-live="polite"><div class="filter-summary-main"><b>${result.totalCount} ${result.totalCount === 1 ? 'movimentação encontrada' : 'movimentações encontradas'}</b>${activeFilters ? '<button type="button" class="link-btn" id="hist-reset">Limpar filtros</button>' : ''}</div><div class="filter-summary-metrics"><span>Receitas: <b class="pos num">${brl(result.totalIncomeCents)}</b></span><span>Despesas: <b class="neg num">${brl(result.totalExpenseCents)}</b></span><span>Saldo: <b class="${result.balanceCents >= 0 ? 'pos' : 'neg'} num">${brl(result.balanceCents)}</b></span></div></section>`;

  const listHtml = visibleItems.length
    ? visibleItems
        .map((t) => {
          const icon = getCategoryIcon(S.cats, t.type, t.c);
          const tags = normalizeTags(t.tags);
          const tagsHtml = tags
            .map((tag) => `<span class="pill-tag">#${esc(tag)}</span>`)
            .join('');

          const card =
            t.pay === 'credit' && t.cardId ? S.cards.find((c) => c.id === t.cardId) : undefined;
          const account = t.accountId ? S.accounts.find((a) => a.id === t.accountId) : undefined;

          let payBadge = '';
          if (card) {
            const instStr =
              t.installments && t.installments.total > 1
                ? ` · ${t.installments.current}/${t.installments.total}`
                : '';
            payBadge = `<span class="pill-sub card-badge" style="border-color:${esc(card.color)}">💳 ${esc(card.name)}${instStr}</span>`;
          } else {
            const baseLabel = getPaymentLabel(normalizePay(t.pay));
            if (account && t.pay !== 'credit') {
              payBadge = `<span class="mut">${esc(baseLabel)} · ${esc(account.icon)} ${esc(account.name)}</span>`;
            } else {
              payBadge = `<span class="mut">${esc(baseLabel)}</span>`;
            }
          }

          const instBadge =
            !card && t.installments && t.installments.total > 1
              ? `<span class="pill-sub">💳 ${t.installments.current}/${t.installments.total}</span>`
              : '';
          const recBadge = t.recurring ? `<span class="pill-sub">🔁 Fixa</span>` : '';
          const pendingBadge =
            t.status === 'pending'
              ? `<span class="pill-sub pending" data-confirm-tx="${esc(t.id)}" role="button" tabindex="0" aria-label="Confirmar pagamento de ${esc(t.n)}">⏳ Pendente · Quitar</span>`
              : '';
          const tpBadge = t.thirdParty?.isThirdParty
            ? `<span class="pill-sub tp-badge ${t.thirdParty.isReimbursed ? 'pos' : 'tp-pending'}" data-toggle-tp="${esc(t.id)}" role="button" tabindex="0" aria-label="Alternar cobrança de ${esc(t.thirdParty.personName)}">👤 ${esc(t.thirdParty.personName)} · ${t.thirdParty.isReimbursed ? '✓ Pago' : 'A Cobrar'}</span>`
            : '';
          const splitBadge =
            t.splitInfo && t.splitInfo.participants.length > 1
              ? `<span class="pill-sub split-badge">🤝 Dividido (${t.splitInfo.participants.length} pessoas)</span>`
              : '';

          const subBadges = tpBadge + splitBadge + instBadge + recBadge + pendingBadge;
          const hasChips = Boolean(subBadges || tagsHtml);
          const payAndTags = `<span class="tx-meta">${payBadge}${hasChips ? ' · ' : ''}${subBadges}${tagsHtml}</span>`;
          return `<button class="tx ${t.type}${t.status === 'pending' ? ' pending-tx' : ''}" data-id="${esc(t.id)}" aria-label="Editar ${esc(t.n)}"><span class="av">${esc(icon)}</span><span class="m"><b>${esc(t.n)}</b><span class="mut">${esc(t.c)} · ${dfmt(t.d)}</span>${payAndTags}</span><b class="num ${t.type === 'in' ? 'pos' : 'neg'}">${t.type === 'in' ? '+' : '−'} ${brl(t.v)}</b></button>`;
        })
        .join('')
    : `<div class="empty">Nenhuma movimentação encontrada para os filtros selecionados.<br>${activeFilters ? '<button type="button" class="btn p" id="hist-reset-empty">Limpar filtros</button>' : '<button type="button" class="btn p" data-add="out">Registrar movimentação</button>'}</div>`;

  const moreBtnHtml =
    remaining > 0
      ? `<div style="margin-top:12px;text-align:center"><button type="button" class="btn" id="hist-more" style="width:100%">Carregar mais (+${Math.min(HISTORY_PAGE_SIZE, remaining)} de ${remaining} restantes)</button></div>`
      : '';

  return `${summaryHtml}<section class="card wide"><div class="ch"><span>Resultados</span><span class="mut">Exibindo ${visibleItems.length} de ${result.totalCount}</span></div><div class="cb">${listHtml}${moreBtnHtml}</div></section>`;
}

export function history(): string {
  const activeType = historyFilters.type || 'all';
  const activeCat = historyFilters.categoryId || 'all';
  const activePay = historyFilters.paymentMethod || 'all';
  const activeTag = historyFilters.tag || '';

  const availableCats =
    activeType === 'out'
      ? S.cats.out
      : activeType === 'in'
      ? S.cats.in
      : [...S.cats.out, ...S.cats.in];

  const seenCatNames = new Set<string>();
  const uniqueCats = availableCats.filter((c) => {
    const key = c.name.toLowerCase();
    if (seenCatNames.has(key)) return false;
    seenCatNames.add(key);
    return true;
  });

  const catOptionsHtml =
    `<option value="all"${activeCat === 'all' ? ' selected' : ''}>Todas as categorias</option>` +
    uniqueCats
      .map(
        (c) =>
          `<option value="${esc(c.name)}"${activeCat.toLowerCase() === c.name.toLowerCase() || activeCat === c.id ? ' selected' : ''}>${esc(c.icon)} ${esc(c.name)}</option>`
      )
      .join('');

  const payOptionsHtml =
    `<option value="all"${activePay === 'all' ? ' selected' : ''}>Todos os pagamentos</option>` +
    PAYMENT_METHODS.map(
      (p) =>
        `<option value="${esc(p.id)}"${activePay === p.id ? ' selected' : ''}>${esc(p.icon || '')} ${esc(p.label)}</option>`
    ).join('');

  const frequentTags = getFrequentTags(12);
  const tagsBarHtml = frequentTags.length
    ? `<div class="filter-bar" role="group" aria-label="Filtrar por tag"><button type="button" class="filter-chip${!activeTag ? ' active' : ''}" data-hist-tag="" aria-pressed="${!activeTag}">Todas as tags</button>${frequentTags
        .map(([tag, count]) => {
          const isSelected = activeTag === tag;
          return `<button type="button" class="filter-chip${isSelected ? ' active' : ''}" data-hist-tag="${esc(tag)}" aria-pressed="${isSelected}">#${esc(tag)} <small>(${count})</small></button>`;
        })
        .join('')}</div>`
    : '';

  const activeCard = historyFilters.cardId || 'all';
  const cardOptionsHtml =
    `<option value="all"${activeCard === 'all' ? ' selected' : ''}>Todos os cartões</option>` +
    S.cards
      .map(
        (c) =>
          `<option value="${esc(c.id)}"${activeCard === c.id ? ' selected' : ''}>💳 ${esc(c.name)}${c.lastDigits ? ` (•••• ${esc(c.lastDigits)})` : ''}</option>`
      )
      .join('');

  const activeAccount = historyFilters.accountId || 'all';
  const accountOptionsHtml =
    `<option value="all"${activeAccount === 'all' ? ' selected' : ''}>Todas as contas</option>` +
    S.accounts
      .map(
        (a) =>
          `<option value="${esc(a.id)}"${activeAccount === a.id ? ' selected' : ''}>${esc(a.icon)} ${esc(a.name)}</option>`
      )
      .join('');

  const payChipsHtml = PAYMENT_METHODS.map((p: { id: PaymentMethod; label: string; icon?: string }) => {
    const isSel = activePay === p.id;
    return `<button type="button" class="filter-chip${isSel ? ' active' : ''}" data-hist-pay="${esc(p.id)}" aria-pressed="${isSel}">${esc(p.icon || '')} ${esc(p.label)}</button>`;
  }).join('');

  return `<header class="wide"><div style="display:flex;align-items:center;gap:12px"><button type="button" class="btn" id="hist-back" data-v="${esc(prevView)}" aria-label="Voltar para a tela anterior">← Voltar</button><h1><b>Histórico</b><div class="mut" style="font-size:.8rem;font-weight:500">Busca textual e filtros combinados</div></h1></div></header>
<section class="card wide"><div class="cb" style="display:grid;gap:12px">
<div class="hist-search-wrap"><input id="hist-search" name="q" type="search" placeholder="Buscar por descrição ou notas (ex.: mercado, aluguel)..." value="${esc(historyFilters.query)}" autocomplete="off" aria-label="Buscar movimentações">${historyFilters.query ? '<button type="button" class="ib hist-clear-btn" id="hist-clear-q" aria-label="Limpar busca">✕</button>' : ''}</div>
<div class="filter-bar" role="group" aria-label="Filtros rápidos de tipo e status">
<button type="button" class="filter-chip${activeType === 'all' ? ' active' : ''}" data-hist-type="all" aria-pressed="${activeType === 'all'}">Todos</button>
<button type="button" class="filter-chip${activeType === 'out' ? ' active' : ''}" data-hist-type="out" aria-pressed="${activeType === 'out'}">− Gastos</button>
<button type="button" class="filter-chip${activeType === 'in' ? ' active' : ''}" data-hist-type="in" aria-pressed="${activeType === 'in'}">+ Ganhos</button>
<button type="button" class="filter-chip${historyFilters.onlyPending ? ' active' : ''}" data-hist-pending="toggle" aria-pressed="${Boolean(historyFilters.onlyPending)}">⏳ Pendentes</button>
<button type="button" class="filter-chip${historyFilters.onlyThirdParty ? ' active' : ''}" data-hist-tp="toggle" aria-pressed="${Boolean(historyFilters.onlyThirdParty)}">👤 Terceiros</button>
${payChipsHtml}
</div>
<div class="hist-selects-grid">
<label class="mut" style="margin:0;font-size:.78rem">Categoria<select id="hist-cat" aria-label="Filtrar por categoria">${catOptionsHtml}</select></label>
<label class="mut" style="margin:0;font-size:.78rem">Pagamento<select id="hist-pay" aria-label="Filtrar por forma de pagamento">${payOptionsHtml}</select></label>
<label class="mut" style="margin:0;font-size:.78rem">Cartão<select id="hist-card" aria-label="Filtrar por cartão de crédito">${cardOptionsHtml}</select></label>
<label class="mut" style="margin:0;font-size:.78rem">Conta / Banco<select id="hist-account" aria-label="Filtrar por conta bancária">${accountOptionsHtml}</select></label>
<label class="mut" style="margin:0;font-size:.78rem">De<input id="hist-start" type="date" value="${esc(historyFilters.startDate || '')}" aria-label="Data inicial"></label>
<label class="mut" style="margin:0;font-size:.78rem">Até<input id="hist-end" type="date" value="${esc(historyFilters.endDate || '')}" aria-label="Data final"></label>
</div>
${tagsBarHtml}
</div></section>
<div id="hist-dynamic-area" class="wide" style="display:grid;gap:14px">${renderHistoryResultsSection()}</div>`;
}

if (typeof document !== 'undefined') {
  document.addEventListener('change', (e: Event) => {
    const target = e.target as HTMLSelectElement | null;
    if (!target) return;
    if (target.id === 'hist-card') {
      updateHistoryFilters({ cardId: target.value });
      const dynArea = document.querySelector<HTMLElement>('#hist-dynamic-area');
      if (dynArea) dynArea.innerHTML = renderHistoryResultsSection();
    } else if (target.id === 'hist-account') {
      updateHistoryFilters({ accountId: target.value });
      const dynArea = document.querySelector<HTMLElement>('#hist-dynamic-area');
      if (dynArea) dynArea.innerHTML = renderHistoryResultsSection();
    }
  });
}
