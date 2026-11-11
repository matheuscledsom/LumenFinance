/* ==========================================================================
   form-modal.ts — Modal de Lançamentos com Seletor de Contas, Cartão de Crédito
                   com Cadastro Rápido Inline, Rachador de Contas e Dicas de Tags
   ========================================================================== */

import {
  S,
  addAccount,
  addCard,
  addCustomTag,
  findLastByName,
  normalizePay,
  normalizeTag,
  normalizeTags
} from '../state';
import {
  PAYMENT_METHODS,
  type BillSplitInfo,
  type Category,
  type PaymentMethod,
  type SplitParticipant,
  type TransactionType
} from '../types/finance';
import { guessCategory } from '../utils/category-guesser';
import { brl, esc } from '../utils/currency';
import {
  calculateInvoiceMonth,
  formatInvoiceLabel,
  getCardLimitUsage
} from '../utils/credit-card';
import { now, toIsoDate } from '../utils/date';
import {
  centsToInput,
  extractMoneyFromText,
  looksLikeExpression,
  parseAmountInput
} from '../utils/qol';

const $ = <T extends Element = HTMLElement>(s: string): T | null =>
  document.querySelector<T>(s);

/**
 * Estado local de tags ativas e taxa de serviço no modal.
 */
let currentTags: string[] = [];
let categoryManuallyChanged = false;
let currentServiceTipPercent = 0;

/**
 * Retorna uma cópia das tags atualmente registradas no formulário.
 */
export function getFormTags(): string[] {
  return [...currentTags];
}

/**
 * Renderiza os chips (.pill-tag) de tags ativas no container #ftags do modal.
 */
export function renderFormTags(): void {
  const box = $<HTMLElement>('#ftags');
  if (!box) return;
  box.innerHTML = currentTags
    .map(
      (tag) =>
        `<span class="pill-tag">#${esc(tag)}<button type="button" class="pill-del" data-rm-tag="${esc(tag)}" aria-label="Remover tag ${esc(tag)}">×</button></span>`
    )
    .join('');
}

/**
 * Normaliza, evita duplicatas e adiciona uma ou mais tags (separadas por vírgula) ao estado do modal.
 */
export function addFormTag(rawInput: string): boolean {
  const parts = rawInput.split(',');
  let added = false;
  for (const part of parts) {
    const cleaned = normalizeTag(part);
    if (cleaned && !currentTags.includes(cleaned)) {
      currentTags.push(cleaned);
      addCustomTag(cleaned);
      added = true;
    }
  }
  if (added) {
    renderFormTags();
  }
  return added;
}

/**
 * Remove uma tag do estado local do modal e atualiza a visualização dos chips.
 */
export function removeFormTag(tag: string): void {
  const cleaned = normalizeTag(tag);
  const next = currentTags.filter((t) => t !== cleaned && t !== tag);
  if (next.length !== currentTags.length) {
    currentTags = next;
    renderFormTags();
  }
}

/**
 * Formata um valor em centavos para BRL explícito no preview de parcelas.
 */
const formatBrlPreview = (cents: number): string =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Sincroniza as regras de exclusão mútua entre recorrência (#frec) e parcelas (#finst),
 * atualizando também o preview em tempo real ("Ex: 3x de R$ 50,00").
 */
export function syncRecurrenceAndInstallments(): void {
  const frec = $<HTMLInputElement>('#frec');
  const finst = $<HTMLInputElement>('#finst');
  const fv = $<HTMLInputElement>('#fv');
  const prev = $<HTMLElement>('#finst-prev');
  if (!frec || !finst) return;

  const parsedInst = Math.min(72, Math.max(1, parseInt(finst.value || '1', 10) || 1));

  if (frec.checked) {
    finst.value = '1';
    finst.disabled = true;
    frec.disabled = false;
    if (prev) prev.textContent = '';
    return;
  }

  finst.disabled = false;

  if (parsedInst > 1) {
    frec.checked = false;
    frec.disabled = true;
    if (prev) {
      const totalCents = parseAmountInput(fv?.value);
      const partCents = totalCents > 0 ? Math.floor(totalCents / parsedInst) : 5000;
      prev.textContent =
        totalCents > 0
          ? `${parsedInst}x de ${formatBrlPreview(partCents)}`
          : `Ex: ${parsedInst}x de ${formatBrlPreview(partCents)}`;
    }
  } else {
    frec.disabled = false;
    if (prev) prev.textContent = '';
  }
}

/**
 * Sincroniza a exibição da seção e do campo "Nome da pessoa" (#ftp-name) para compras de terceiros.
 */
export function syncThirdPartyVisibility(): void {
  const f = $<HTMLFormElement>('#f');
  const tpSec = $<HTMLElement>('#ftp-section');
  const ftp = $<HTMLInputElement>('#ftp');
  const nameWrap = $<HTMLElement>('#ftp-name-wrap');
  const isOut = f?.dataset.type !== 'in';

  if (tpSec) {
    tpSec.style.display = isOut ? 'block' : 'none';
  }
  if (nameWrap) {
    nameWrap.style.display = isOut && Boolean(ftp?.checked) ? 'grid' : 'none';
  }
}

/**
 * Sincroniza o seletor de conta bancária / carteira (#faccount):
 * - Para 'in': "Onde entrou o dinheiro? (Banco / Carteira)"
 * - Para 'out' (quando pay !== 'credit'): "De qual conta saiu? (Banco / Carteira)"
 */
export function syncAccountSelector(): void {
  const f = $<HTMLFormElement>('#f');
  const wrap = $<HTMLElement>('#faccount-group');
  const label = $<HTMLElement>('#faccount-label');
  const fpay = $<HTMLSelectElement>('#fpay');
  if (!wrap || !f) return;

  const isOut = f.dataset.type !== 'in';
  if (isOut) {
    wrap.style.display = fpay?.value !== 'credit' ? 'block' : 'none';
    if (label) label.textContent = 'De qual conta saiu? (Banco / Carteira)';
  } else {
    wrap.style.display = 'block';
    if (label) label.textContent = 'Onde entrou o dinheiro? (Banco / Carteira)';
  }
}

/**
 * Exibe o container #fcard-group quando a forma de pagamento é "Crédito",
 * mostrando o mini-form #fcard-quick-add caso não haja cartões e atualizando #fcard-invoice-hint.
 */
export function syncCardSelector(): void {
  const f = $<HTMLFormElement>('#f');
  const wrap = $<HTMLElement>('#fcard-group');
  const fpay = $<HTMLSelectElement>('#fpay');
  const fcard = $<HTMLSelectElement>('#fcard');
  const hint = $<HTMLElement>('#fcard-invoice-hint');
  const fd = $<HTMLInputElement>('#fd');
  const finst = $<HTMLInputElement>('#finst');
  const fv = $<HTMLInputElement>('#fv');
  const quickAdd = $<HTMLElement>('#fcard-quick-add');
  const selectWrap = $<HTMLElement>('#fcard-select-wrap');
  if (!wrap || !fpay) return;

  const visible = f?.dataset.type !== 'in' && fpay.value === 'credit';
  wrap.style.display = visible ? 'block' : 'none';
  if (!visible) return;

  if (S.cards.length === 0) {
    if (selectWrap) selectWrap.style.display = 'none';
    if (quickAdd) quickAdd.style.display = 'block';
    if (hint) {
      hint.textContent = 'Nenhum cartão cadastrado. Cadastre seu cartão abaixo sem sair desta tela:';
    }
    return;
  } else {
    if (selectWrap) selectWrap.style.display = 'flex';
  }

  if (!fcard || !hint) return;
  const card = S.cards.find((c) => c.id === fcard.value) || S.cards[0];
  if (!card || !fd?.value) {
    hint.textContent = '';
    return;
  }

  const invoiceYm = calculateInvoiceMonth(fd.value, card.closingDay);
  const label = formatInvoiceLabel(invoiceYm);
  const usage = getCardLimitUsage(card.id);
  const purchaseCents = parseAmountInput(fv?.value);
  const availableAfter = Math.max(0, usage.availableCents - purchaseCents);
  const parcels =
    Math.floor(Number(finst?.value)) > 1 ? ' · Parcelas seguem nas faturas seguintes' : '';

  hint.textContent = `📅 Esta compra cairá na fatura de ${label} (Vencimento dia ${card.dueDay})${parcels} · Limite disponível após compra: ${brl(availableAfter)}`;
}

/**
 * Atualiza a dica "Última vez em X: R$ Y" conforme o nome digitado em #fn.
 */
export function syncLastPaidHint(): void {
  const fn = $<HTMLInputElement>('#fn');
  const hint = $<HTMLElement>('#fn-hint');
  const f = $<HTMLFormElement>('#f');
  if (!fn || !hint) return;
  const last = f?.dataset.type === 'in' ? null : findLastByName(fn.value, f?.dataset.txId);
  hint.textContent = last
    ? `Última vez em ${last.n.replace(/\s*\(\d+\/\d+\)\s*$/, '')}: ${brl(last.v)}`
    : '';
}

/**
 * Detecta se a categoria ativa é Streaming ou Academia e exibe o bloco contextual #f-sub-box.
 */
export function syncSubscriptionBox(): void {
  const f = $<HTMLFormElement>('#f');
  if (f?.dataset.type === 'in') {
    const box = $<HTMLElement>('#f-sub-box');
    if (box) box.style.display = 'none';
    return;
  }
  const fc = $<HTMLSelectElement>('#fc');
  const cat = fc?.value?.toLowerCase() || '';
  const isSub =
    cat.includes('streaming') ||
    cat.includes('assinatura') ||
    cat.includes('academia') ||
    cat.includes('bem-estar');

  const subBox = $<HTMLElement>('#f-sub-box');
  if (subBox) {
    subBox.style.display = isSub ? 'block' : 'none';
  }
  if (isSub) {
    const frec = $<HTMLInputElement>('#frec');
    if (frec && !frec.dataset.userToggled) {
      frec.checked = true;
      syncRecurrenceAndInstallments();
    }
  }
}

/**
 * Reage à alteração de titularidade de assinatura (#fsub-ownership).
 */
export function handleSubscriptionOwnershipChange(ownership: string): void {
  if (ownership === 'shared_mine') {
    const splitChk = $<HTMLInputElement>('#f-split-chk');
    const splitBox = $<HTMLElement>('#f-split-box');
    if (splitChk) {
      splitChk.checked = true;
      if (splitBox) splitBox.style.display = 'block';
      if (document.querySelectorAll('.split-friend-row').length === 0) {
        addSplitFriendRow();
        splitEqually();
      }
    }
  } else if (ownership === 'third_party_card') {
    const fpay = $<HTMLSelectElement>('#fpay');
    if (fpay && fpay.value === 'credit') {
      fpay.value = 'pix';
      syncAccountSelector();
      syncCardSelector();
    }
  }
}

/**
 * Atualiza o bloco do Modo Casal no formulário.
 */
export function syncCoupleSection(): void {
  const chk = $<HTMLInputElement>('#f-couple-chk');
  const details = $<HTMLElement>('#f-couple-details');
  if (chk && details) {
    details.style.display = chk.checked ? 'flex' : 'none';
  }
}

/**
 * Atualiza as opções de categoria de S.cats[type] com ícone e nome formatados,
 * além do estado dos botões de tipo (Gasto/Ganho).
 */
export function cats(selectedCat?: Category): void {
  const f = $<HTMLFormElement>('#f');
  if (!f) return;
  const t = (f.dataset.type === 'in' ? 'in' : 'out') as TransactionType;
  const fc = $<HTMLSelectElement>('#fc');
  const list = S.cats[t] || [];

  if (fc && list.length > 0) {
    const current = selectedCat ?? fc.value;
    const hasMatch = list.some((c) => c.name === current || c.id === current);
    const activeCatName = hasMatch
      ? list.find((c) => c.name === current || c.id === current)?.name ?? list[0].name
      : selectedCat || list[0].name;

    const options = [...list];
    if (selectedCat && !hasMatch) {
      options.push({ id: `legacy-${selectedCat}`, name: selectedCat, icon: '📦' });
    }

    fc.innerHTML = options
      .map(
        (c) =>
          `<option value="${esc(c.name)}"${c.name === activeCatName ? ' selected' : ''}>${esc(c.icon)} ${esc(c.name)}</option>`
      )
      .join('');
    fc.value = activeCatName;
  }

  f.querySelectorAll<HTMLButtonElement>('[data-t]').forEach((b) =>
    b.setAttribute('aria-pressed', String(b.dataset.t === t))
  );

  const splitSec = $<HTMLElement>('#f-split-section');
  if (splitSec) {
    splitSec.style.display = t === 'out' ? 'block' : 'none';
  }

  syncThirdPartyVisibility();
  syncAccountSelector();
  syncCardSelector();
  syncLastPaidHint();
  syncSubscriptionBox();
  syncCoupleSection();
}

/**
 * Atualiza o validador e sumário em tempo real (#f-split-summary) do rachador de contas.
 */
export function updateSplitSummary(): void {
  const chk = $<HTMLInputElement>('#f-split-chk');
  if (!chk || !chk.checked) return;

  const totalPurchaseCents = parseAmountInput($<HTMLInputElement>('#fv')?.value);
  const meInput = $<HTMLInputElement>('#split-me-val');
  const meCents = parseAmountInput(meInput?.value);

  const friendRows = document.querySelectorAll<HTMLElement>('.split-friend-row');
  let friendsTotalCents = 0;
  friendRows.forEach((r) => {
    const valInput = r.querySelector<HTMLInputElement>('.split-person-val');
    friendsTotalCents += parseAmountInput(valInput?.value);
  });

  const sumAll = meCents + friendsTotalCents;
  const diff = totalPurchaseCents - sumAll;
  const friendCount = friendRows.length;

  const summaryEl = $<HTMLElement>('#f-split-summary');
  if (!summaryEl) return;

  const mePct =
    totalPurchaseCents > 0 ? ((meCents / totalPurchaseCents) * 100).toFixed(0) : '100';
  const mePctEl = $<HTMLElement>('#split-me-pct');
  if (mePctEl) mePctEl.textContent = `${mePct}%`;

  if (diff === 0) {
    summaryEl.innerHTML = `<span class="pos">✓ Divisão exata:</span> Sua parte: <b>${brl(meCents)}</b> · A cobrar (${friendCount} ${friendCount === 1 ? 'pessoa' : 'pessoas'}): <b>${brl(friendsTotalCents)}</b> · Total: <b>${brl(totalPurchaseCents)}</b>`;
  } else {
    const diffText = diff > 0 ? `Faltam ${brl(diff)}` : `Passou ${brl(Math.abs(diff))}`;
    summaryEl.innerHTML = `<span class="neg">⚠ ${diffText}:</span> Sua parte: <b>${brl(meCents)}</b> · A cobrar (${friendCount} ${friendCount === 1 ? 'pessoa' : 'pessoas'}): <b>${brl(friendsTotalCents)}</b> · Total: <b>${brl(totalPurchaseCents)}</b> <button type="button" class="link-btn" id="f-split-fix-diff">Ajustar diferença na minha parte</button>`;
  }
}

/**
 * Divide o valor total igualmente em centavos exatos entre Você e os amigos (alocando o resto em "Você").
 */
export function splitEqually(): void {
  const totalPurchaseCents = parseAmountInput($<HTMLInputElement>('#fv')?.value);
  if (!(totalPurchaseCents > 0)) return;

  const friendRows = document.querySelectorAll<HTMLElement>('.split-friend-row');
  const totalPeople = 1 + friendRows.length;
  const baseShare = Math.floor(totalPurchaseCents / totalPeople);
  const remainder = totalPurchaseCents - baseShare * totalPeople;

  const meInput = $<HTMLInputElement>('#split-me-val');
  if (meInput) {
    meInput.value = centsToInput(baseShare + remainder);
  }

  friendRows.forEach((r) => {
    const valInput = r.querySelector<HTMLInputElement>('.split-person-val');
    if (valInput) {
      valInput.value = centsToInput(baseShare);
    }
  });

  updateSplitSummary();
}

/**
 * Adiciona uma nova linha de participante amigo na lista #f-split-list.
 */
export function addSplitFriendRow(name = '', amountCents = 0, debtId?: string): void {
  const container = $<HTMLElement>('#f-split-friends');
  if (!container) return;

  const row = document.createElement('div');
  row.className = 'split-person-row split-friend-row';
  row.dataset.participantId = crypto.randomUUID();
  if (debtId) row.dataset.debtId = debtId;

  row.innerHTML = `<input class="split-person-name" maxlength="40" placeholder="Nome da pessoa" value="${esc(name)}" required autocomplete="off"><span class="split-val-wrap"><input class="split-person-val" inputmode="decimal" placeholder="0,00" value="${amountCents > 0 ? esc(centsToInput(amountCents)) : ''}" required autocomplete="off"><button type="button" class="btn-del-person" aria-label="Remover participante" title="Remover">×</button></span>`;

  container.appendChild(row);

  const valInput = row.querySelector<HTMLInputElement>('.split-person-val');
  valInput?.addEventListener('input', updateSplitSummary);

  const delBtn = row.querySelector<HTMLButtonElement>('.btn-del-person');
  delBtn?.addEventListener('click', () => {
    row.remove();
    updateSplitSummary();
  });

  updateSplitSummary();
}

/**
 * Coleta os dados do rachador de contas (#f-split-section) se estiver ativo.
 */
export function getFormSplitInfo(): BillSplitInfo | null {
  const chk = $<HTMLInputElement>('#f-split-chk');
  if (!chk || !chk.checked) return null;

  const fv = $<HTMLInputElement>('#fv');
  const totalPurchaseCents = parseAmountInput(fv?.value);
  const meVal = parseAmountInput($<HTMLInputElement>('#split-me-val')?.value);

  const friends: SplitParticipant[] = [];
  const friendRows = document.querySelectorAll<HTMLElement>('.split-friend-row');
  friendRows.forEach((row) => {
    const nameInput = row.querySelector<HTMLInputElement>('.split-person-name');
    const valInput = row.querySelector<HTMLInputElement>('.split-person-val');
    const name = nameInput?.value.trim() || '';
    const cents = parseAmountInput(valInput?.value);
    const id = row.dataset.participantId || crypto.randomUUID();
    const debtId = row.dataset.debtId;
    if (name && cents > 0) {
      friends.push({
        id,
        name,
        amountCents: cents,
        isMe: false,
        debtId: debtId || undefined
      });
    }
  });

  if (friends.length === 0) return null;

  const meParticipant: SplitParticipant = {
    id: 'me',
    name: S.name || 'Você',
    amountCents:
      meVal >= 0 && meVal + friends.reduce((a, p) => a + p.amountCents, 0) > 0
        ? meVal
        : Math.max(0, totalPurchaseCents - friends.reduce((a, p) => a + p.amountCents, 0)),
    isMe: true
  };

  return {
    totalPurchaseCents:
      totalPurchaseCents ||
      meParticipant.amountCents + friends.reduce((a, p) => a + p.amountCents, 0),
    serviceTipPercent: currentServiceTipPercent,
    participants: [meParticipant, ...friends]
  };
}

/**
 * Abre o modal de movimentação para criação (txId = null) ou edição (txId fornecido).
 */
export function openForm(
  type: TransactionType,
  txId: string | null = null,
  defaultDate?: string
): void {
  const f = $<HTMLFormElement>('#f');
  if (!f) return;

  const tx = txId != null ? S.tx.find((x) => String(x.id) === String(txId)) : null;
  const activeType: TransactionType = tx ? tx.type : type;
  const activePay: PaymentMethod = tx ? normalizePay(tx.pay) : 'money';
  const valStr = tx ? centsToInput(tx.splitInfo?.totalPurchaseCents || tx.v) : '';
  const descStr = tx ? tx.n : '';
  const dateStr = tx ? tx.d : defaultDate || toIsoDate(now);
  const isRecurring = Boolean(tx?.recurring);
  const instTotal =
    tx?.installments?.total && tx.installments.total > 1 ? tx.installments.total : 1;
  const isThirdParty = Boolean(tx?.thirdParty?.isThirdParty);
  const tpPersonName = tx?.thirdParty?.personName || '';
  const hasSplit = Boolean(tx?.splitInfo && tx.splitInfo.participants.length > 1);

  currentTags = tx ? normalizeTags(tx.tags) : [];
  categoryManuallyChanged = Boolean(tx);
  currentServiceTipPercent = tx?.splitInfo?.serviceTipPercent || 0;

  const payOptions = PAYMENT_METHODS.map(
    (p) =>
      `<option value="${esc(p.id)}"${p.id === activePay ? ' selected' : ''}>${esc(p.icon || '')} ${esc(p.label)}</option>`
  ).join('');

  const sortedAccounts = [...S.accounts].sort((a, b) => {
    if (a.kind === 'cash' && b.kind !== 'cash') return 1;
    if (a.kind !== 'cash' && b.kind === 'cash') return -1;
    return 0;
  });

  const accountOptions = sortedAccounts
    .map((a) => {
      const modeLabel =
        a.kind === 'cash'
          ? '💵 Dinheiro Físico'
          : a.cardMode === 'both'
          ? '🏦 Conta + Cartão'
          : a.cardMode === 'credit'
          ? '💳 Só Cartão'
          : '🏦 Conta Corrente / Débito';
      return `<option value="${esc(a.id)}"${tx?.accountId === a.id || (!tx?.accountId && a.isDefault) ? ' selected' : ''}>${esc(a.icon)} ${esc(a.name)} · ${modeLabel}</option>`;
    })
    .join('');

  const cardOptions = S.cards
    .map(
      (c) =>
        `<option value="${esc(c.id)}"${tx?.cardId === c.id ? ' selected' : ''}>💳 ${esc(c.name)}${c.lastDigits ? ` (•••• ${esc(c.lastDigits)})` : ''} · Fecha dia ${c.closingDay}</option>`
    )
    .join('');

  const frequentFriendChips = S.frequentPeople
    .slice(0, 6)
    .map(
      (name) =>
        `<button type="button" class="filter-chip btn-quick-friend" data-friend-name="${esc(name)}">+ ${esc(name)}</button>`
    )
    .join('');

  const allTags = [...S.customTags];
  for (const existingTx of S.tx) {
    for (const tg of normalizeTags(existingTx.tags)) {
      if (!allTags.includes(tg)) {
        allTags.push(tg);
      }
    }
  }
  const tagChipsHtml = allTags
    .slice(0, 15)
    .map(
      (t) =>
        `<button type="button" class="filter-chip btn-tag-sugg" data-sugg-tag="${esc(t)}">#${esc(t)}</button>`
    )
    .join('');

  f.innerHTML = `<h2 id="dt" style="margin:0 0 4px;font-size:1.2rem">${tx ? 'Editar movimentação' : 'Nova movimentação'}</h2>
<div class="seg" style="margin-top:10px"><button type="button" data-t="out" aria-pressed="${activeType === 'out'}">Gasto</button><button type="button" data-t="in" aria-pressed="${activeType === 'in'}">Ganho</button></div>
<label>Valor (R$) · aceita contas como 45+12,50<span class="fv-row"><input id="fv" inputmode="decimal" placeholder="0,00" value="${esc(valStr)}" required autocomplete="off"><button type="button" class="ib" id="fpaste" aria-label="Colar valor da área de transferência" title="Colar Pix / comprovante">📋</button></span></label>
<label>Descrição<input id="fn" maxlength="60" required placeholder="Ex.: Almoço" value="${esc(descStr)}" autocomplete="off"><small id="fn-hint" class="mut" aria-live="polite"></small></label>
<label>Categoria<select id="fc" style="padding:11px 12px"></select></label>

<div id="f-sub-box" class="sub-context-box" style="display:none;background:var(--mut-bg, rgba(139,92,246,0.08));border:1px solid var(--bd);border-radius:var(--r);padding:10px 12px;margin:8px 0">
  <div style="font-weight:600;font-size:.85rem;margin-bottom:4px">📺 Assinatura / Mensalidade Detectada</div>
  <p class="mut" style="font-size:.78rem;margin:0 0 6px">Recorrência mensal sugerida. De quem é esta assinatura?</p>
  <label style="font-size:.82rem;margin:0">Titularidade:
    <select id="fsub-ownership" style="padding:6px 8px;font-size:.82rem;margin-top:2px">
      <option value="mine"${tx?.subscriptionMeta?.ownership === 'mine' ? ' selected' : ''}>1. Só meu (no meu cartão/conta)</option>
      <option value="shared_mine"${tx?.subscriptionMeta?.ownership === 'shared_mine' ? ' selected' : ''}>2. No meu cartão, mas divido com amigos/família</option>
      <option value="third_party_card"${tx?.subscriptionMeta?.ownership === 'third_party_card' ? ' selected' : ''}>3. No cartão de outra pessoa (eu pago minha parte)</option>
    </select>
  </label>
</div>

<label>Forma de pagamento<select id="fpay" style="padding:11px 12px">${payOptions}</select></label>

<div id="faccount-group">
  <label id="faccount-label">${activeType === 'in' ? 'Onde entrou o dinheiro? (Banco / Carteira)' : 'De qual conta saiu? (Banco / Carteira)'}</label>
  <div class="selector-inline-row">
    <select id="faccount" style="flex:1;padding:11px 12px">${accountOptions}</select>
    <button type="button" class="btn btn-inline-action" id="faccount-quick-toggle" title="Cadastrar nova conta ou banco">+ Nova Conta</button>
  </div>
  <div id="faccount-quick-add" class="quick-inline-box" style="display:none">
    <div class="quick-inline-title">Cadastrar novo banco / carteira</div>
    <div class="quick-inline-grid">
      <input id="facc-name" maxlength="24" placeholder="Nome (ex: Nubank, Itaú)" autocomplete="off">
      <input id="facc-icon" maxlength="4" placeholder="🏦" value="🏦" style="text-align:center" aria-label="Ícone">
    </div>
    <div class="quick-inline-grid" style="margin-top:8px">
      <input id="facc-balance" inputmode="decimal" placeholder="Saldo inicial (R$ 0,00)">
      <input id="facc-color" type="color" value="#8b5cf6" style="height:42px;padding:2px" aria-label="Cor da conta">
    </div>
    <div class="quick-inline-actions">
      <button type="button" class="btn p" id="facc-save-btn">Salvar e Selecionar</button>
      <button type="button" class="btn" id="facc-cancel-btn">Cancelar</button>
    </div>
  </div>
</div>

<div id="fcard-group" style="display:none">
  <label>Cartão de crédito utilizado</label>
  <div id="fcard-select-wrap" class="selector-inline-row">
    <select id="fcard" style="flex:1;padding:11px 12px">${cardOptions}</select>
    <button type="button" class="btn btn-inline-action" id="fcard-quick-toggle" title="Cadastrar novo cartão">+ Novo Cartão</button>
  </div>
  <div id="fcard-quick-add" class="quick-inline-box" style="display:none">
    <div class="quick-inline-title">Novo cartão de crédito</div>
    <div class="quick-inline-grid">
      <input id="fcd-name" maxlength="24" placeholder="Nome (ex: Nubank, Inter)" autocomplete="off">
      <input id="fcd-digits" inputmode="numeric" maxlength="4" placeholder="Últimos 4 díg.">
    </div>
    <div class="quick-inline-grid" style="margin-top:8px">
      <input id="fcd-limit" inputmode="decimal" placeholder="Limite total (R$)">
      <input id="fcd-color" type="color" value="#8b5cf6" style="height:42px;padding:2px" aria-label="Cor do cartão">
    </div>
    <div class="form-split-row" style="margin-top:8px">
      <label style="margin:0">Fecha dia (1-31)<input id="fcd-close" type="number" min="1" max="31" value="10"></label>
      <label style="margin:0">Vence dia (1-31)<input id="fcd-due" type="number" min="1" max="31" value="17"></label>
    </div>
    <div class="quick-inline-actions">
      <button type="button" class="btn p" id="fcd-save-btn">Salvar e Selecionar Cartão</button>
      <button type="button" class="btn" id="fcd-cancel-btn">Cancelar</button>
    </div>
  </div>
  <div id="fcard-invoice-hint" class="mut" style="font-size:.8rem;margin-top:6px" aria-live="polite"></div>
</div>

<label>Data<input id="fd" type="date" value="${esc(dateStr)}" required></label>
<div class="form-split-row"><label class="chk-row"><input id="frec" type="checkbox"${isRecurring ? ' checked' : ''}><span>Repetir mensalmente</span></label><label>Parcelas<input id="finst" type="number" min="1" max="72" value="${instTotal}"${isRecurring ? ' disabled' : ''}></label></div>
<div id="finst-prev" class="mut" style="font-size:.8rem;margin-top:4px"></div>

<div id="ftp-section" style="display:${activeType === 'out' ? 'block' : 'none'}">
  <label class="chk-row" style="margin-top:6px"><input id="ftp" type="checkbox"${isThirdParty ? ' checked' : ''}><span>Compra para outra pessoa (Cartão emprestado)</span></label>
  <label id="ftp-name-wrap" style="display:${activeType === 'out' && isThirdParty ? 'grid' : 'none'};margin-top:4px">Nome da pessoa<input id="ftp-name" maxlength="40" placeholder="Ex: Irmão, Amigo" value="${esc(tpPersonName)}" autocomplete="off"></label>
</div>

<div id="f-split-section" style="display:${activeType === 'out' ? 'block' : 'none'}">
  <label class="chk-row" style="margin-top:6px"><input id="f-split-chk" type="checkbox"${hasSplit ? ' checked' : ''}><span>🤝 Dividir conta com mais pessoas</span></label>
  <div id="f-split-box" class="split-box" style="display:${hasSplit ? 'block' : 'none'}">
    <div class="split-tip-row">
      <span class="mut" style="font-size:.78rem;font-weight:600">Taxa de serviço / Gorjeta:</span>
      <div class="filter-bar">
        <button type="button" class="filter-chip${currentServiceTipPercent === 0 ? ' active' : ''}" data-tip="0">0%</button>
        <button type="button" class="filter-chip${currentServiceTipPercent === 10 ? ' active' : ''}" data-tip="10">+10%</button>
        <button type="button" class="filter-chip${currentServiceTipPercent === 12 ? ' active' : ''}" data-tip="12">+12%</button>
        <button type="button" class="filter-chip${currentServiceTipPercent === 15 ? ' active' : ''}" data-tip="15">+15%</button>
      </div>
    </div>
    ${frequentFriendChips ? `<div class="split-friends-sugg"><span class="mut" style="font-size:.76rem">Amigos frequentes:</span><div class="filter-bar">${frequentFriendChips}</div></div>` : ''}
    <div id="f-split-list" class="split-list">
      <div class="split-person-row split-me-row">
        <span class="split-name-label"><b>Você (Minha parte)</b> <small id="split-me-pct" class="mut">100%</small></span>
        <input id="split-me-val" class="split-val-input" inputmode="decimal" placeholder="0,00" value="${tx?.splitInfo ? esc(centsToInput(tx.v)) : esc(valStr)}">
      </div>
      <div id="f-split-friends"></div>
    </div>
    <div class="split-actions-row">
      <button type="button" class="btn" id="f-add-person">+ Adicionar pessoa</button>
      <button type="button" class="btn p" id="f-split-equal">⚖️ Dividir igualmente</button>
    </div>
    <div id="f-split-summary" class="split-summary-bar" aria-live="polite"></div>
  </div>
</div>

${
  S.couple.enabled
    ? `<div id="f-couple-box" style="margin-top:8px;padding:8px 10px;border:1px solid var(--bd);border-radius:var(--r);background:var(--card)">
  <label class="chk-row" style="margin:0">
    <input id="f-couple-chk" type="checkbox"${tx?.isCoupleExpense ? ' checked' : ''}>
    <span>💑 Despesa conjunta do casal</span>
  </label>
  <div id="f-couple-details" style="display:${tx?.isCoupleExpense ? 'flex' : 'none'};gap:8px;margin-top:6px;align-items:center">
    <span class="mut" style="font-size:.8rem">Quem pagou?</span>
    <select id="f-couple-paidby" style="flex:1;padding:6px 8px;font-size:.82rem">
      <option value="me"${tx?.paidBy !== 'partner' ? ' selected' : ''}>Eu (${esc(S.name || 'Você')})</option>
      <option value="partner"${tx?.paidBy === 'partner' ? ' selected' : ''}>${esc(S.couple.partnerName || 'Parceiro(a)')}</option>
    </select>
  </div>
</div>`
    : ''
}

<label>Observações / Anotações
  <textarea id="fnotes" rows="2" maxlength="200" placeholder="Detalhes opcionais sobre este lançamento..." style="padding:8px 10px;font-family:inherit;font-size:.85rem;border-radius:var(--r);border:1px solid var(--bd);background:var(--card);color:var(--tx);resize:none">${esc(tx?.notes || '')}</textarea>
</label>

<label>Tags<input id="ftag" placeholder="Adicionar tag (Enter ou vírgula)" autocomplete="off"></label>
<div class="tag-help-hint">💡 Tags pré-criadas (toque para adicionar):</div>
<div class="tag-suggestions" role="group" aria-label="Sugestões rápidas de tags" style="margin-bottom:6px">${tagChipsHtml}</div>
<div id="ftags" class="tag-list" aria-live="polite"></div>

<div id="fe" class="neg" role="alert" style="margin-top:8px;font-size:.85rem"></div>
<div style="display:flex;gap:10px;margin-top:14px"><button type="button" class="btn" id="fx" style="flex:1">Cancelar</button>${tx ? `<button type="button" class="btn neg" id="fdel" data-del="${esc(tx.id)}" style="flex:1">Excluir</button>` : ''}<button class="btn p" style="flex:1">Salvar</button></div>`;

  f.dataset.type = activeType;
  if (tx) {
    f.dataset.txId = String(tx.id);
  } else {
    delete f.dataset.txId;
  }

  const fpay = $<HTMLSelectElement>('#fpay');
  if (fpay) fpay.value = activePay;

  cats(tx ? tx.c : undefined);
  renderFormTags();
  syncRecurrenceAndInstallments();
  syncThirdPartyVisibility();
  syncAccountSelector();
  syncCardSelector();
  syncLastPaidHint();

  if (tx?.splitInfo && tx.splitInfo.participants) {
    const friends = tx.splitInfo.participants.filter((p) => !p.isMe);
    friends.forEach((fr) => {
      addSplitFriendRow(fr.name, fr.amountCents, fr.debtId);
    });
    updateSplitSummary();
  }

  const fc = $<HTMLSelectElement>('#fc');
  if (fc && typeof fc.addEventListener === 'function') {
    fc.addEventListener('change', () => {
      categoryManuallyChanged = true;
    });
  }

  const fv = $<HTMLInputElement>('#fv');
  if (fv && typeof fv.addEventListener === 'function') {
    fv.addEventListener('input', () => {
      syncRecurrenceAndInstallments();
      syncCardSelector();
      updateSplitSummary();
    });
    fv.addEventListener('blur', () => {
      if (!looksLikeExpression(fv.value)) return;
      const cents = parseAmountInput(fv.value);
      if (cents > 0) {
        fv.value = centsToInput(cents);
        syncRecurrenceAndInstallments();
        syncCardSelector();
        updateSplitSummary();
      }
    });
  }

  const fpay2 = $<HTMLSelectElement>('#fpay');
  const fcard = $<HTMLSelectElement>('#fcard');
  const fd = $<HTMLInputElement>('#fd');
  fpay2?.addEventListener('change', () => {
    syncAccountSelector();
    syncCardSelector();
  });
  fcard?.addEventListener('change', syncCardSelector);
  fd?.addEventListener('input', syncCardSelector);
  fd?.addEventListener('change', syncCardSelector);

  const frec = $<HTMLInputElement>('#frec');
  if (frec && typeof frec.addEventListener === 'function') {
    frec.addEventListener('change', () => {
      syncRecurrenceAndInstallments();
    });
  }

  const finst = $<HTMLInputElement>('#finst');
  if (finst && typeof finst.addEventListener === 'function') {
    finst.addEventListener('input', () => {
      syncRecurrenceAndInstallments();
      syncCardSelector();
    });
    finst.addEventListener('change', () => {
      syncRecurrenceAndInstallments();
      syncCardSelector();
    });
  }

  const ftp = $<HTMLInputElement>('#ftp');
  if (ftp && typeof ftp.addEventListener === 'function') {
    ftp.addEventListener('change', () => {
      syncThirdPartyVisibility();
    });
  }

  const fn = $<HTMLInputElement>('#fn');
  if (fn && typeof fn.addEventListener === 'function') {
    fn.addEventListener('input', () => {
      syncLastPaidHint();
      if (categoryManuallyChanged) return;
      const currentType = (f.dataset.type === 'in' ? 'in' : 'out') as TransactionType;
      const available = S.cats[currentType] || [];
      const guessed = guessCategory(fn.value, available);
      const selectEl = $<HTMLSelectElement>('#fc');
      if (guessed && selectEl && selectEl.value !== guessed.name) {
        selectEl.value = guessed.name;
        if (selectEl.classList) {
          selectEl.classList.remove('cat-auto');
          selectEl.classList.add('cat-auto');
        }
      }
    });
  }

  // Mini-formulário inline de Conta Bancária / Carteira
  const faccToggle = $<HTMLButtonElement>('#faccount-quick-toggle');
  const faccQuickAdd = $<HTMLElement>('#faccount-quick-add');
  faccToggle?.addEventListener('click', () => {
    if (faccQuickAdd) {
      faccQuickAdd.style.display = faccQuickAdd.style.display === 'none' ? 'block' : 'none';
      if (faccQuickAdd.style.display === 'block') {
        $<HTMLInputElement>('#facc-name')?.focus();
      }
    }
  });

  $<HTMLButtonElement>('#facc-cancel-btn')?.addEventListener('click', () => {
    if (faccQuickAdd) faccQuickAdd.style.display = 'none';
  });

  $<HTMLButtonElement>('#facc-save-btn')?.addEventListener('click', () => {
    const name = $<HTMLInputElement>('#facc-name')?.value.trim() || '';
    const icon = $<HTMLInputElement>('#facc-icon')?.value.trim() || '🏦';
    const color = $<HTMLInputElement>('#facc-color')?.value || '#8b5cf6';
    const balance = parseAmountInput($<HTMLInputElement>('#facc-balance')?.value);
    const fe = $<HTMLElement>('#fe');

    if (!name) {
      if (fe) fe.textContent = 'Informe o nome da conta bancária ou carteira.';
      return;
    }

    const created = addAccount(name, icon, color, balance);
    const accSelect = $<HTMLSelectElement>('#faccount');
    if (accSelect) {
      const opt = document.createElement('option');
      opt.value = created.id;
      opt.textContent = `${created.icon} ${created.name}`;
      opt.selected = true;
      accSelect.appendChild(opt);
    }
    if (faccQuickAdd) faccQuickAdd.style.display = 'none';
    if (fe) fe.textContent = '';
  });

  // Mini-formulário inline de Cartão de Crédito
  const fcardToggle = $<HTMLButtonElement>('#fcard-quick-toggle');
  const fcardQuickAdd = $<HTMLElement>('#fcard-quick-add');
  fcardToggle?.addEventListener('click', () => {
    if (fcardQuickAdd) {
      fcardQuickAdd.style.display = fcardQuickAdd.style.display === 'none' ? 'block' : 'none';
      if (fcardQuickAdd.style.display === 'block') {
        $<HTMLInputElement>('#fcd-name')?.focus();
      }
    }
  });

  $<HTMLButtonElement>('#fcd-cancel-btn')?.addEventListener('click', () => {
    if (fcardQuickAdd && S.cards.length > 0) {
      fcardQuickAdd.style.display = 'none';
    }
  });

  $<HTMLButtonElement>('#fcd-save-btn')?.addEventListener('click', () => {
    const name = $<HTMLInputElement>('#fcd-name')?.value.trim() || '';
    const lastDigits = $<HTMLInputElement>('#fcd-digits')?.value.replace(/\D/g, '').slice(-4);
    const limit = parseAmountInput($<HTMLInputElement>('#fcd-limit')?.value);
    const closingDay = Math.floor(Number($<HTMLInputElement>('#fcd-close')?.value || 10));
    const dueDay = Math.floor(Number($<HTMLInputElement>('#fcd-due')?.value || 17));
    const color = $<HTMLInputElement>('#fcd-color')?.value || '#8b5cf6';
    const fe = $<HTMLElement>('#fe');

    if (!name) {
      if (fe) fe.textContent = 'Informe o nome do cartão de crédito.';
      return;
    }

    const created = addCard({
      name,
      lastDigits: lastDigits || undefined,
      limitCents: limit,
      closingDay: Math.min(31, Math.max(1, closingDay)),
      dueDay: Math.min(31, Math.max(1, dueDay)),
      color
    });

    const cardSelect = $<HTMLSelectElement>('#fcard');
    if (cardSelect) {
      const opt = document.createElement('option');
      opt.value = created.id;
      opt.textContent = `💳 ${created.name}${created.lastDigits ? ` (•••• ${created.lastDigits})` : ''} · Fecha dia ${created.closingDay}`;
      opt.selected = true;
      cardSelect.appendChild(opt);
    }

    const selectWrap = $<HTMLElement>('#fcard-select-wrap');
    if (selectWrap) selectWrap.style.display = 'flex';
    if (fcardQuickAdd) fcardQuickAdd.style.display = 'none';
    if (fe) fe.textContent = '';

    syncCardSelector();
  });

  // Rachador de contas dinâmico
  const splitChk = $<HTMLInputElement>('#f-split-chk');
  const splitBox = $<HTMLElement>('#f-split-box');
  splitChk?.addEventListener('change', () => {
    if (splitBox) {
      splitBox.style.display = splitChk.checked ? 'block' : 'none';
      if (splitChk.checked && document.querySelectorAll('.split-friend-row').length === 0) {
        addSplitFriendRow();
        splitEqually();
      }
    }
  });

  const subOwnership = $<HTMLSelectElement>('#fsub-ownership');
  subOwnership?.addEventListener('change', () => {
    handleSubscriptionOwnershipChange(subOwnership.value);
  });

  const coupleChk = $<HTMLInputElement>('#f-couple-chk');
  coupleChk?.addEventListener('change', () => {
    syncCoupleSection();
  });

  $<HTMLInputElement>('#split-me-val')?.addEventListener('input', updateSplitSummary);

  const ftag = $<HTMLInputElement>('#ftag');
  if (ftag && typeof ftag.addEventListener === 'function') {
    ftag.addEventListener('keydown', (ev: KeyboardEvent) => {
      if (ev.key === 'Enter' || ev.key === ',') {
        ev.preventDefault();
        if (ftag.value.trim()) {
          addFormTag(ftag.value);
          ftag.value = '';
        }
      }
    });
    ftag.addEventListener('input', () => {
      if (ftag.value.includes(',')) {
        const segments = ftag.value.split(',');
        const trailing = segments.pop() ?? '';
        const completed = segments.join(',');
        if (completed.trim()) {
          addFormTag(completed);
        }
        ftag.value = trailing;
      }
    });
  }

  $<HTMLDialogElement>('#dlg')?.showModal();
  setTimeout(() => {
    const fvEl = $<HTMLInputElement>('#fv');
    if (fvEl) fvEl.focus();
  }, 50);
}

/**
 * Trata cliques dentro do modal de movimentações via delegação centralizada em main.ts.
 */
export function handleFormModalClick(target: Element): boolean {
  const friendBtn = target.closest<HTMLButtonElement>('.btn-quick-friend');
  if (friendBtn?.dataset.friendName) {
    addSplitFriendRow(friendBtn.dataset.friendName, 0);
    splitEqually();
    return true;
  }

  const tipBtn = target.closest<HTMLButtonElement>('[data-tip]');
  if (tipBtn?.dataset.tip) {
    const tipPct = parseInt(tipBtn.dataset.tip, 10) || 0;
    currentServiceTipPercent = tipPct;
    const f = $<HTMLFormElement>('#f');
    f?.querySelectorAll('[data-tip]').forEach((b) =>
      b.classList.toggle('active', (b as HTMLElement).dataset.tip === String(tipPct))
    );
    if (tipPct > 0) {
      const fv = $<HTMLInputElement>('#fv');
      const currentCents = parseAmountInput(fv?.value);
      if (currentCents > 0) {
        const withTip = Math.round(currentCents * (1 + tipPct / 100));
        if (fv) fv.value = centsToInput(withTip);
        splitEqually();
      }
    }
    return true;
  }

  const suggBtn = target.closest<HTMLButtonElement>('.btn-tag-sugg');
  if (suggBtn?.dataset.suggTag) {
    addFormTag(suggBtn.dataset.suggTag);
    return true;
  }

  if (target.closest('#f-split-fix-diff')) {
    const totalPurchase = parseAmountInput($<HTMLInputElement>('#fv')?.value);
    const friendRows = document.querySelectorAll<HTMLElement>('.split-friend-row');
    let friendsTotal = 0;
    friendRows.forEach((r) => {
      friendsTotal += parseAmountInput(
        r.querySelector<HTMLInputElement>('.split-person-val')?.value
      );
    });
    const meInput = $<HTMLInputElement>('#split-me-val');
    if (meInput) {
      meInput.value = centsToInput(Math.max(0, totalPurchase - friendsTotal));
      updateSplitSummary();
    }
    return true;
  }

  if (target.closest('#f-add-person')) {
    addSplitFriendRow();
    return true;
  }

  if (target.closest('#f-split-equal')) {
    splitEqually();
    return true;
  }

  if (target.closest('#faccount-quick-toggle')) {
    const box = $<HTMLElement>('#faccount-quick-add');
    if (box) {
      box.style.display = box.style.display === 'none' ? 'block' : 'none';
      if (box.style.display === 'block') {
        $<HTMLInputElement>('#facc-name')?.focus();
      }
    }
    return true;
  }

  if (target.closest('#facc-cancel-btn')) {
    const box = $<HTMLElement>('#faccount-quick-add');
    if (box) box.style.display = 'none';
    return true;
  }

  if (target.closest('#facc-save-btn')) {
    const name = $<HTMLInputElement>('#facc-name')?.value.trim() || '';
    const icon = $<HTMLInputElement>('#facc-icon')?.value.trim() || '🏦';
    const color = $<HTMLInputElement>('#facc-color')?.value || '#8b5cf6';
    const balance = parseAmountInput($<HTMLInputElement>('#facc-balance')?.value);
    const fe = $<HTMLElement>('#fe');
    if (!name) {
      if (fe) fe.textContent = 'Informe o nome da conta bancária ou carteira.';
      return true;
    }
    const created = addAccount(name, icon, color, balance);
    const accSelect = $<HTMLSelectElement>('#faccount');
    if (accSelect) {
      const opt = document.createElement('option');
      opt.value = created.id;
      opt.textContent = `${created.icon} ${created.name}`;
      opt.selected = true;
      accSelect.appendChild(opt);
    }
    const box = $<HTMLElement>('#faccount-quick-add');
    if (box) box.style.display = 'none';
    if (fe) fe.textContent = '';
    return true;
  }

  if (target.closest('#fcard-quick-toggle')) {
    const box = $<HTMLElement>('#fcard-quick-add');
    if (box) {
      box.style.display = box.style.display === 'none' ? 'block' : 'none';
      if (box.style.display === 'block') {
        $<HTMLInputElement>('#fcd-name')?.focus();
      }
    }
    return true;
  }

  if (target.closest('#fcd-cancel-btn')) {
    const box = $<HTMLElement>('#fcard-quick-add');
    if (box && S.cards.length > 0) box.style.display = 'none';
    return true;
  }

  if (target.closest('#fcd-save-btn')) {
    const name = $<HTMLInputElement>('#fcd-name')?.value.trim() || '';
    const lastDigits = $<HTMLInputElement>('#fcd-digits')?.value.replace(/\D/g, '').slice(-4);
    const limit = parseAmountInput($<HTMLInputElement>('#fcd-limit')?.value);
    const closingDay = Math.floor(Number($<HTMLInputElement>('#fcd-close')?.value || 10));
    const dueDay = Math.floor(Number($<HTMLInputElement>('#fcd-due')?.value || 17));
    const color = $<HTMLInputElement>('#fcd-color')?.value || '#8b5cf6';
    const fe = $<HTMLElement>('#fe');
    if (!name) {
      if (fe) fe.textContent = 'Informe o nome do cartão de crédito.';
      return true;
    }
    const created = addCard({
      name,
      lastDigits: lastDigits || undefined,
      limitCents: limit,
      closingDay: Math.min(31, Math.max(1, closingDay)),
      dueDay: Math.min(31, Math.max(1, dueDay)),
      color
    });
    const cardSelect = $<HTMLSelectElement>('#fcard');
    if (cardSelect) {
      const opt = document.createElement('option');
      opt.value = created.id;
      opt.textContent = `💳 ${created.name}${created.lastDigits ? ` (•••• ${created.lastDigits})` : ''} · Fecha dia ${created.closingDay}`;
      opt.selected = true;
      cardSelect.appendChild(opt);
    }
    const selectWrap = $<HTMLElement>('#fcard-select-wrap');
    if (selectWrap) selectWrap.style.display = 'flex';
    const box = $<HTMLElement>('#fcard-quick-add');
    if (box) box.style.display = 'none';
    if (fe) fe.textContent = '';
    syncCardSelector();
    return true;
  }

  return false;
}

/**
 * Lê o clipboard e preenche #fv com o primeiro valor monetário encontrado.
 * Retorna true quando um valor foi aplicado.
 */
export async function pasteAmountFromClipboard(): Promise<boolean> {
  if (!navigator.clipboard || typeof navigator.clipboard.readText !== 'function') return false;
  try {
    const text = await navigator.clipboard.readText();
    const cents = extractMoneyFromText(text);
    const fv = $<HTMLInputElement>('#fv');
    if (cents === null || !fv) return false;
    fv.value = centsToInput(cents);
    syncRecurrenceAndInstallments();
    syncCardSelector();
    updateSplitSummary();
    return true;
  } catch {
    return false;
  }
}
