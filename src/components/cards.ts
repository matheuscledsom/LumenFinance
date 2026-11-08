/* ==========================================================================
   cards.ts — Cartões Virtuais: Melhor Dia de Compra, Fatura Atual e Termômetro de Limite
   ========================================================================== */

import { S } from '../state';
import type { CreditCard } from '../types/finance';
import { brl, esc, lum } from '../utils/currency';
import {
  calculateInvoiceMonth,
  formatInvoiceLabel,
  getBestPurchaseDay,
  getCardLimitUsage,
  getInvoiceTotal
} from '../utils/credit-card';
import { now, toIsoDate } from '../utils/date';

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
