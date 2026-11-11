/* ==========================================================================
   cards.ts — Central de Cartões de Crédito, Contas Bancárias e Liquidez
   ========================================================================== */

import {
  S,
  addAccount,
  adjustAccountBalance,
  getAccountBalances,
  getAccountById,
  removeAccount,
  removeCard,
  transferBetweenAccounts,
  updateAccount
} from '../state';
import type { BankAccount, CreditCard } from '../types/finance';
import {
  calculateInvoiceMonth,
  formatInvoiceLabel,
  getBestPurchaseDay,
  getCardDetailedInvoice,
  getCardLimitStatus,
  getCardLimitUsage,
  getInvoiceTotal,
  payCardInvoice
} from '../utils/credit-card';
import { brl, brlPlain, esc, lum } from '../utils/currency';
import { cur, now, prevM, toIsoDate, ym } from '../utils/date';
import { centsToInput, parseAmountInput } from '../utils/qol';
import { openCardDialog, openUnifiedCardAccountDialog } from './dialogs';
export { openUnifiedCardAccountDialog };

export let selectedCardsInvoiceMonth: string = cur;

export const setCardsInvoiceMonth = (monthYear: string): void => {
  selectedCardsInvoiceMonth = monthYear;
};

export const stepCardsMonth = (delta: number): void => {
  selectedCardsInvoiceMonth = prevM(selectedCardsInvoiceMonth, -delta);
};

const $ = <T extends Element = HTMLElement>(s: string): T | null =>
  document.querySelector<T>(s);

/**
 * Abre o modal de transferência entre contas bancárias.
 */
export function openTransferDialog(fromAccountId?: string): void {
  const f = $<HTMLFormElement>('#f2');
  if (!f) return;

  const defaultFrom = fromAccountId || S.accounts[0]?.id || '';
  const defaultTo = S.accounts.find((a) => a.id !== defaultFrom)?.id || '';

  const fromOptions = S.accounts
    .map(
      (a) =>
        `<option value="${esc(a.id)}"${a.id === defaultFrom ? ' selected' : ''}>${esc(a.icon)} ${esc(a.name)}</option>`
    )
    .join('');

  const toOptions = S.accounts
    .map(
      (a) =>
        `<option value="${esc(a.id)}"${a.id === defaultTo ? ' selected' : ''}>${esc(a.icon)} ${esc(a.name)}</option>`
    )
    .join('');

  f.dataset.kind = 'transfer';
  delete f.dataset.entityId;
  f.innerHTML = `<h2 id="dt2" style="margin:0 0 4px;font-size:1.2rem">🔄 Transferir entre Contas</h2>
<div class="mut" style="font-size:.82rem;margin-bottom:12px">Mova dinheiro entre suas contas sem alterar receitas ou despesas pessoais.</div>
<label>Conta de Origem<select id="tr-from" style="padding:10px 12px;margin-top:4px">${fromOptions}</select></label>
<label style="margin-top:10px">Conta de Destino<select id="tr-to" style="padding:10px 12px;margin-top:4px">${toOptions}</select></label>
<label style="margin-top:10px">Valor (R$)<input id="tr-v" inputmode="decimal" placeholder="0,00" required autocomplete="off"></label>
<label style="margin-top:10px">Data<input id="tr-d" type="date" value="${toIsoDate(now)}"></label>
<label style="margin-top:10px">Descrição (opcional)<input id="tr-desc" maxlength="60" placeholder="Ex.: Reserva do mês" autocomplete="off"></label>
<div id="f2e" class="neg" role="alert" style="margin-top:8px;font-size:.85rem"></div>
<div style="display:flex;gap:10px;margin-top:14px"><button type="button" class="btn" data-close-dlg2 style="flex:1">Cancelar</button><button class="btn p" style="flex:1">Transferir</button></div>`;

  $<HTMLDialogElement>('#dlg2')?.showModal();
  setTimeout(() => f.querySelector<HTMLInputElement>('#tr-v')?.focus(), 50);
}

/**
 * Abre o modal de ajuste de saldo real (bater com o extrato do banco).
 */
export function openAdjustBalanceDialog(accountId: string): void {
  const account = getAccountById(accountId);
  if (!account) return;

  const balances = getAccountBalances();
  const detail = balances.find((b) => b.account.id === accountId);
  const currentTotal = detail ? detail.totalBankBalanceCents : account.initialBalanceCents;
  const custody = detail ? detail.thirdPartyCustodyCents : 0;

  const f = $<HTMLFormElement>('#f2');
  if (!f) return;

  f.dataset.kind = 'adjust_balance';
  f.dataset.entityId = accountId;
  f.innerHTML = `<h2 id="dt2" style="margin:0 0 4px;font-size:1.2rem">⚖️ Ajustar Saldo Real</h2>
<div class="mut" style="font-size:.84rem;margin-bottom:8px">Conta: <b>${esc(account.icon)} ${esc(account.name)}</b></div>
<div style="font-size:.8rem;line-height:1.4;margin-bottom:12px;padding:8px 10px;background:var(--card);border:1px solid var(--bd);border-radius:var(--r)">
  Informe o saldo exato que você vê agora no aplicativo do banco. O Lumen calculará a diferença e ajustará seu saldo inicial, preservando integralmente o dinheiro de terceiros em custódia (<b>${brl(custody)}</b>).
</div>
<label>Saldo Atual no Aplicativo do Banco (R$)<input id="adj-v" inputmode="decimal" placeholder="${esc(centsToInput(currentTotal))}" value="${esc(centsToInput(currentTotal))}" required autocomplete="off"></label>
<div id="f2e" class="neg" role="alert" style="margin-top:8px;font-size:.85rem"></div>
<div style="display:flex;gap:10px;margin-top:14px"><button type="button" class="btn" data-close-dlg2 style="flex:1">Cancelar</button><button class="btn p" style="flex:1">Salvar Ajuste</button></div>`;

  $<HTMLDialogElement>('#dlg2')?.showModal();
  setTimeout(() => f.querySelector<HTMLInputElement>('#adj-v')?.focus(), 50);
}

/**
 * Abre o modal de cadastro ou edição de conta bancária (redireciona para o modal unificado).
 */
export function openAccountDialog(accountId?: string): void {
  openUnifiedCardAccountDialog(accountId);
}

/**
 * Abre o modal de pagamento de fatura de cartão com liquidação inteligente.
 */
export function openPayInvoiceDialog(cardId: string, monthYear: string): void {
  const card = S.cards.find((c) => c.id === cardId);
  if (!card) return;

  const detailed = getCardDetailedInvoice(cardId, monthYear);
  if (detailed.remainingCents <= 0) return;

  const balances = getAccountBalances();
  const totalCustodyAvailable = balances.reduce(
    (acc, b) => acc + b.thirdPartyCustodyCents,
    0
  );

  const suggestedCustody = Math.min(
    totalCustodyAvailable,
    detailed.thirdPartyCents,
    detailed.remainingCents
  );

  const label = formatInvoiceLabel(monthYear);
  const accOptions = S.accounts
    .map(
      (a) =>
        `<option value="${esc(a.id)}"${a.isDefault ? ' selected' : ''}>${esc(a.icon)} ${esc(a.name)} (Livre: ${brl(balances.find((b) => b.account.id === a.id)?.personalBalanceCents || 0)})</option>`
    )
    .join('');

  const f = $<HTMLFormElement>('#f2');
  if (!f) return;

  f.dataset.kind = 'pay_invoice';
  f.dataset.cardId = cardId;
  f.dataset.monthYear = monthYear;
  f.dataset.totalCents = String(detailed.remainingCents);

  f.innerHTML = `<h2 id="dt2" style="margin:0 0 4px;font-size:1.2rem">⚡ Pagar Fatura: ${esc(card.name)}</h2>
<div class="mut" style="font-size:.82rem;margin-bottom:10px">Competência: <b>${esc(label)}</b></div>
<div class="pay-invoice-breakdown" style="padding:10px 12px;background:var(--card);border:1px solid var(--bd);border-radius:var(--r);font-size:.84rem;line-height:1.5">
  <div style="display:flex;justify-content:space-between"><span>Total em Aberto:</span><b class="num">${brl(detailed.remainingCents)}</b></div>
  <div style="display:flex;justify-content:space-between;color:var(--mut)"><span>Sua Parte Pessoal:</span><span>${brl(detailed.personalCents)}</span></div>
  <div style="display:flex;justify-content:space-between;color:var(--mut)"><span>Parte de Amigos/Terceiros:</span><span>${brl(detailed.thirdPartyCents)}</span></div>
  ${
    totalCustodyAvailable > 0
      ? `<div style="display:flex;justify-content:space-between;color:var(--pos);margin-top:4px"><span>Dinheiro Guardado em Custódia:</span><b>${brl(totalCustodyAvailable)}</b></div>`
      : ''
  }
</div>

<div style="margin-top:14px">
  <label style="display:flex;align-items:center;gap:8px;font-weight:600;font-size:.9rem;cursor:pointer">
    <input type="radio" name="inv-mode" value="my_account" checked>
    <span>Pagar com Minha Conta Bancária</span>
  </label>
  <div id="inv-my-acc-panel" style="margin-left:24px;margin-top:8px">
    <label class="mut" style="font-size:.78rem">Conta debitada:
      <select id="inv-account" style="padding:8px 10px;margin-top:4px">${accOptions}</select>
    </label>
    ${
      totalCustodyAvailable > 0
        ? `<div class="custody-toggle-box" style="margin-top:10px;padding:8px 10px;border:1px dashed var(--bd);border-radius:var(--r);font-size:.8rem">
            <label class="chk-row" style="margin:0">
              <input id="inv-use-custody" type="checkbox"${suggestedCustody > 0 ? ' checked' : ''}>
              <span>Abater dinheiro guardado de terceiros</span>
            </label>
            <div id="inv-custody-amount-wrap" style="margin-top:6px;display:${suggestedCustody > 0 ? 'block' : 'none'}">
              <label class="mut" style="font-size:.76rem">Valor a abater da custódia (R$):
                <input id="inv-custody-val" inputmode="decimal" value="${centsToInput(suggestedCustody)}" style="padding:6px 10px;margin-top:2px">
              </label>
            </div>
          </div>`
        : ''
    }
  </div>

  <label style="display:flex;align-items:center;gap:8px;font-weight:600;font-size:.9rem;cursor:pointer;margin-top:12px">
    <input type="radio" name="inv-mode" value="external">
    <span>Terceiro pagou direto por fora</span>
  </label>
  <div id="inv-external-panel" style="margin-left:24px;margin-top:6px;display:none">
    <div class="mut" style="font-size:.78rem;line-height:1.4">
      O amigo/terceiro pagou a fatura pelo próprio aplicativo dele. O limite do seu cartão será liberado e a fatura dada como quitada sem mexer em nenhuma conta sua.
    </div>
  </div>
</div>

<label style="margin-top:14px">Valor Pago (R$)<input id="inv-paid-v" inputmode="decimal" value="${esc(centsToInput(detailed.remainingCents))}" required></label>
<div id="f2e" class="neg" role="alert" style="margin-top:8px;font-size:.85rem"></div>
<div style="display:flex;gap:10px;margin-top:14px"><button type="button" class="btn" data-close-dlg2 style="flex:1">Cancelar</button><button class="btn p" style="flex:1">Confirmar Pagamento</button></div>`;

  const radios = f.querySelectorAll<HTMLInputElement>('input[name="inv-mode"]');
  const myAccPanel = f.querySelector<HTMLElement>('#inv-my-acc-panel');
  const extPanel = f.querySelector<HTMLElement>('#inv-external-panel');
  const custodyChk = f.querySelector<HTMLInputElement>('#inv-use-custody');
  const custodyValWrap = f.querySelector<HTMLElement>('#inv-custody-amount-wrap');

  radios.forEach((r) => {
    r.addEventListener('change', () => {
      const isMy = r.value === 'my_account';
      if (myAccPanel) myAccPanel.style.display = isMy ? 'block' : 'none';
      if (extPanel) extPanel.style.display = isMy ? 'none' : 'block';
    });
  });

  custodyChk?.addEventListener('change', () => {
    if (custodyValWrap) custodyValWrap.style.display = custodyChk.checked ? 'block' : 'none';
  });

  $<HTMLDialogElement>('#dlg2')?.showModal();
}

/**
 * Renderiza o Hub de Cartões & Contas Unificado.
 */
export function cards(): string {
  const accountBalances = getAccountBalances();
  const monthLabel = formatInvoiceLabel(selectedCardsInvoiceMonth);

  const unifiedCardsHtml = accountBalances.map(
    ({
      account,
      totalBankBalanceCents,
      personalBalanceCents,
      thirdPartyCustodyCents,
      isNearZero
    }) => {
      const card = account.linkedCardId
        ? S.cards.find((c) => c.id === account.linkedCardId)
        : S.cards.find(
            (c) =>
              c.linkedAccountId === account.id ||
              c.name.toLowerCase() === account.name.toLowerCase()
          );

      const hasCredit = Boolean(account.hasCredit || (card && account.cardMode !== 'debit'));
      const isCreditOnly = account.cardMode === 'credit';

      const totalFmt = S.hide ? '••••' : brl(totalBankBalanceCents);
      const personalFmt = S.hide ? '••••' : brl(personalBalanceCents);
      const custodyFmt = S.hide ? '••••' : brl(thirdPartyCustodyCents);

      const modeBadge = isCreditOnly
        ? '<span class="pill" style="font-size:.68rem">Só Crédito</span>'
        : hasCredit
        ? '<span class="pill" style="font-size:.68rem">Múltiplo (Débito + Crédito)</span>'
        : '<span class="pill" style="font-size:.68rem">Conta / Débito</span>';

      const pixBadge = account.pixKey
        ? `<button type="button" class="pill" data-copy-pix="${esc(account.pixKey)}" title="Clique para copiar a Chave Pix" style="cursor:pointer;font-size:.72rem">🔑 Pix: <b>${esc(account.pixKey)}</b> 📋</button>`
        : '';

      let creditSectionHtml = '';
      if (hasCredit && card) {
        const limitStatus = getCardLimitStatus(card.id);
        const detailed = getCardDetailedInvoice(card.id, selectedCardsInvoiceMonth);

        const limitFmt = S.hide ? '••••' : brl(limitStatus.limitCents);
        const committedFmt = S.hide ? '••••' : brl(limitStatus.committedCents);
        const availableFmt = S.hide ? '••••' : brl(limitStatus.availableCents);
        const invoiceTotalFmt = S.hide ? '••••' : brl(detailed.totalCents);
        const personalInvFmt = S.hide ? '••••' : brl(detailed.personalCents);
        const thirdPartyInvFmt = S.hide ? '••••' : brl(detailed.thirdPartyCents);
        const remainingInvFmt = S.hide ? '••••' : brl(detailed.remainingCents);

        const usagePct = Math.min(100, Math.round(limitStatus.usageRatio * 100));

        const statusBadge =
          detailed.status === 'paid'
            ? '<span class="pill pos">✅ Paga</span>'
            : detailed.status === 'closed'
            ? '<span class="pill neg">⚠️ Fechada</span>'
            : detailed.status === 'partial'
            ? '<span class="pill warning">Parcial</span>'
            : '<span class="pill">⚡ Aberta</span>';

        const itemsHtml = detailed.items.length
          ? `<div class="invoice-items-list">
              ${detailed.items
                .map((t) => {
                  const tVal = S.hide ? '••••' : brl(t.v);
                  return `<div class="invoice-item">
                    <div class="invoice-item-info">
                      <b>${esc(t.n)}</b>
                      <div class="mut" style="font-size:.74rem">${esc(t.d.split('-').reverse().join('/'))}</div>
                    </div>
                    <b class="num">${tVal}</b>
                  </div>`;
                })
                .join('')}
            </div>`
          : '<div class="mut" style="font-size:.8rem;padding:6px 0">Nenhum gasto nesta fatura.</div>';

        creditSectionHtml = `
          <div class="bank-credit-section" style="margin-top:12px;padding-top:10px;border-top:1px dashed var(--bd)">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <span style="font-size:.82rem;font-weight:600">💳 Fatura & Limite de Crédito</span>
              <span class="mut" style="font-size:.74rem">Fecha dia ${card.closingDay} · Vence dia ${card.dueDay}</span>
            </div>

            <div class="card-limit-progress" style="margin-bottom:10px">
              <div class="card-limit-labels">
                <span class="mut">Limite: <b>${limitFmt}</b></span>
                <span class="${limitStatus.isWarning ? 'neg' : 'mut'}">Usado: <b>${committedFmt} (${usagePct}%)</b></span>
                <span class="pos">Disponível: <b>${availableFmt}</b></span>
              </div>
              <div class="card-limit-bar">
                <div class="card-limit-bar-fill${limitStatus.isWarning ? ' warning' : ''}" style="width:${usagePct}%;background:${esc(limitStatus.isWarning ? 'var(--neg)' : card.color)}"></div>
              </div>
            </div>

            <div class="invoice-nav-container">
              <div class="invoice-nav-bar">
                <button type="button" class="btn btn-sm" data-step-card-month="-1" title="Mês anterior">◀</button>
                <span class="invoice-month-label"><b>${esc(monthLabel)}</b> ${statusBadge}</span>
                <button type="button" class="btn btn-sm" data-step-card-month="1" title="Próximo mês">▶</button>
              </div>

              <div class="invoice-summary-box">
                <div class="invoice-breakdown-row">
                  <span class="mut">Total da Fatura:</span>
                  <b class="num">${invoiceTotalFmt}</b>
                </div>
                ${
                  detailed.thirdPartyCents > 0
                    ? `<div class="invoice-breakdown-row sub">
                        <span class="mut">Pessoal:</span>
                        <span>${personalInvFmt}</span>
                      </div>
                      <div class="invoice-breakdown-row sub">
                        <span class="mut">Terceiros:</span>
                        <span>${thirdPartyInvFmt}</span>
                      </div>`
                    : ''
                }
                ${
                  detailed.status !== 'paid' && detailed.remainingCents > 0
                    ? `<div class="invoice-action-bar">
                        <span class="mut" style="font-size:.8rem">A pagar: <b class="num neg">${remainingInvFmt}</b></span>
                        <button type="button" class="btn p btn-sm" data-pay-invoice="${esc(card.id)}" data-invoice-ym="${esc(selectedCardsInvoiceMonth)}">⚡ Pagar Fatura</button>
                      </div>`
                    : ''
                }
              </div>

              <details class="invoice-items-details">
                <summary class="mut" style="font-size:.78rem;cursor:pointer;padding:4px 0">Ver lançamentos da fatura (${detailed.items.length})</summary>
                ${itemsHtml}
              </details>
            </div>
          </div>
        `;
      }

      return `<div class="bank-account-card card${isNearZero ? ' warning-border' : ''}">
        <div class="bank-card-header">
          <div class="bank-card-title">
            <span class="bank-card-icon" style="background:${esc(account.color)}20;color:${esc(account.color)}">${esc(account.icon)}</span>
            <div>
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                <b>${esc(account.name)}</b>
                ${account.lastDigits ? `<span class="mut" style="font-size:.76rem">•••• ${esc(account.lastDigits)}</span>` : ''}
                ${account.isDefault ? '<span class="pill" style="font-size:.68rem">Principal</span>' : ''}
                ${modeBadge}
              </div>
              ${pixBadge ? `<div style="margin-top:3px">${pixBadge}</div>` : ''}
            </div>
          </div>
          <div class="bank-card-menu">
            <button type="button" class="btn btn-sm" data-edit-unified="${esc(account.id)}" title="Editar Banco/Cartão">✏️</button>
            ${
              S.accounts.length > 1
                ? `<button type="button" class="btn btn-sm" data-del-account="${esc(account.id)}" title="Excluir conta">🗑</button>`
                : ''
            }
          </div>
        </div>

        ${
          !isCreditOnly
            ? `<div class="bank-balances-stack">
          <div class="bank-balance-row main">
            <span class="mut">Saldo Livre (Pessoal)</span>
            <b class="num ${personalBalanceCents >= 0 ? '' : 'neg'}">${personalFmt}</b>
          </div>
          <div class="bank-balance-row sub">
            <span class="mut">Saldo Total no App do Banco</span>
            <span class="num">${totalFmt}</span>
          </div>
          ${
            thirdPartyCustodyCents > 0
              ? `<div class="bank-balance-row custody">
                  <span class="mut">🤝 Guardado de Terceiros</span>
                  <b class="num pos">${custodyFmt}</b>
                </div>`
              : ''
          }
        </div>

        <div class="bank-card-actions">
          <button type="button" class="btn btn-sm" data-adjust-account="${esc(account.id)}">⚖️ Ajustar Saldo Real</button>
        </div>`
            : ''
        }

        ${creditSectionHtml}
      </div>`;
    }
  );

  return `<header class="wide">
    <h1>
      <b>Cartões & Contas</b>
      <div class="mut" style="font-size:.8rem;font-weight:500">Bancos, contas e faturas integrados com transparência</div>
    </h1>
    <div style="display:flex;gap:8px">
      <button type="button" class="btn" data-transfer-modal>🔄 Transferir</button>
      <button type="button" class="btn p" data-new-unified>+ Novo Cartão / Conta</button>
    </div>
  </header>

  <section class="wide" style="margin-top:14px">
    <div class="bank-accounts-grid">${unifiedCardsHtml.join('')}</div>
  </section>`;
}

const virtualCard = (card: CreditCard): string => {
  const usage = getCardLimitUsage(card.id);
  const invoiceYm = calculateInvoiceMonth(toIsoDate(now), card.closingDay);
  const invoiceTotal = getInvoiceTotal(card.id, invoiceYm);
  const on = lum(card.color) > 0.45 ? '#111' : '#fff';
  const pct = Math.min(100, Math.max(0, usage.percent));
  const over = usage.limitCents > 0 && usage.usedCents > usage.limitCents;
  const limitInfo =
    usage.limitCents > 0
      ? `<div class="vc-limit"><div class="vc-limit-head"><span>Disponível <b class="num">${brl(Math.max(0, usage.availableCents))}</b></span><span class="num">${usage.percent.toFixed(0)}% usado</span></div><div class="vc-track" role="progressbar" aria-label="Limite utilizado" aria-valuenow="${pct.toFixed(0)}" aria-valuemin="0" aria-valuemax="100"><div class="vc-fill${over ? ' vc-over' : ''}" style="width:${pct.toFixed(0)}%"></div></div><div class="vc-limit-foot"><span class="num">${brl(usage.usedCents)} de ${brl(usage.limitCents)}</span></div></div>`
      : `<div class="vc-limit"><div class="vc-limit-head"><span>Limite não informado</span><span class="num">${brl(usage.usedCents)} em uso</span></div></div>`;

  return `<article class="vcard" style="--vc:${esc(card.color)};--vc-on:${on}" aria-label="Cartão ${esc(card.name)}">
<div class="vc-top"><b class="vc-name">${esc(card.name)}</b><span class="vc-digits num">${card.lastDigits ? `•••• ${esc(card.lastDigits)}` : '••••'}</span></div>
<div class="vc-invoice"><span>Fatura de ${esc(formatInvoiceLabel(invoiceYm))}</span><b class="num">${brl(invoiceTotal)}</b></div>
${limitInfo}
<div class="vc-days"><span>Fecha dia <b>${card.closingDay}</b></span><span>Vence dia <b>${card.dueDay}</b></span><span class="vc-best">★ Melhor dia de compra: <b>${getBestPurchaseDay(card.closingDay)}</b></span></div>
<div class="vc-actions"><button type="button" class="vc-btn" data-card-edit="${esc(card.id)}">Editar</button><button type="button" class="vc-btn" data-card-del="${esc(card.id)}">Excluir</button></div>
</article>`;
};

/**
 * Seção "Cartões de Crédito" exibida no Perfil.
 */
export function cardsSection(): string {
  const list = S.cards.length
    ? `<div class="vcard-list">${S.cards.map(virtualCard).join('')}</div>`
    : `<div class="empty" style="padding:8px">Nenhum cartão cadastrado ainda.</div>`;
  return `<section class="card wide"><div class="ch"><span>Cartões de Crédito</span><button type="button" class="btn p" data-card-add style="padding:6px 12px;font-size:.8rem">+ Cartão</button></div><div class="cb">
<div class="mut" style="margin-bottom:10px">Compras no crédito entram na fatura conforme o dia de fechamento e consomem o limite do cartão.</div>
${list}
</div></section>`;
}
