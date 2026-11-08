/* ==========================================================================
   debts.ts — Central de Dívidas e Empréstimos: Quem me deve / A quem devo,
              amortizações parciais e cobrança via WhatsApp + Pix
   ========================================================================== */

import { S, debtRemaining, getDebtTotals } from '../state';
import type { DebtRecord, DebtType } from '../types/finance';
import { brl, brlPlain, esc } from '../utils/currency';
import { now, toIsoDate } from '../utils/date';

export let debtsTab: DebtType = 'to_receive';

export const setDebtsTab = (t: DebtType): void => {
  debtsTab = t;
};

/**
 * Monta a mensagem amigável de cobrança com a chave Pix e o saldo restante.
 */
export const buildCollectionMessage = (debt: DebtRecord): string => {
  const remaining = brlPlain(debtRemaining(debt));
  const what = debt.description ? ` referente a ${debt.description}` : '';
  return debt.pixKey
    ? `Olá, ${debt.personName}! Segue a chave Pix ${debt.pixKey}${what} no valor de ${remaining}. Abraço!`
    : `Olá, ${debt.personName}! Passando para lembrar${what || ' do valor combinado'} no valor de ${remaining}. Abraço!`;
};

/**
 * Gera o link wa.me com o texto de cobrança já codificado.
 */
export const buildWhatsAppLink = (debt: DebtRecord): string =>
  `https://wa.me/?text=${encodeURIComponent(buildCollectionMessage(debt))}`;

const debtCard = (d: DebtRecord): string => {
  const remaining = debtRemaining(d);
  const pct = Math.min(100, (d.paidAmountCents / d.originalAmountCents) * 100);
  const settled = d.status === 'settled';
  const overdue = !settled && Boolean(d.dueDate) && (d.dueDate as string) < toIsoDate(now);
  const chips = [
    settled ? '<span class="debt-chip ok">✓ Quitada</span>' : '',
    overdue ? '<span class="debt-chip late">⚠ Vencida</span>' : '',
    d.dueDate && !settled
      ? `<span class="debt-chip">Vence ${esc(d.dueDate.split('-').reverse().join('/'))}</span>`
      : '',
    d.pixKey ? '<span class="debt-chip">❖ Pix</span>' : ''
  ].join('');

  const actions = settled
    ? `<button type="button" class="btn" data-debt-del="${esc(d.id)}">Remover</button>`
    : `<button type="button" class="btn p" data-debt-pay="${esc(d.id)}">${d.type === 'to_receive' ? 'Receber / Quitar' : 'Pagar / Quitar'}</button>${
        d.type === 'to_receive'
          ? `<button type="button" class="btn" data-debt-wa="${esc(d.id)}">💬 Cobrar no WhatsApp</button>`
          : ''
      }<button type="button" class="btn" data-debt-del="${esc(d.id)}" aria-label="Excluir dívida de ${esc(d.personName)}">🗑</button>`;

  return `<article class="debt-card${settled ? ' settled' : ''}">
<div class="debt-head"><div><b>${esc(d.personName)}</b><div class="mut" style="font-size:.82rem">${esc(d.description || 'Sem descrição')}</div></div><b class="num ${d.type === 'to_receive' ? 'pos' : 'neg'}">${brl(remaining)}</b></div>
<div class="debt-chips">${chips}</div>
<div class="prog-track" role="progressbar" aria-label="Quitação" aria-valuenow="${pct.toFixed(0)}" aria-valuemin="0" aria-valuemax="100"><div class="prog-fill ${settled ? 'pos-bg' : ''}" style="width:${pct.toFixed(0)}%"></div></div>
<div class="mut" style="font-size:.78rem;margin-top:4px">${brl(remaining)} restantes de ${brl(d.originalAmountCents)} · ${d.payments.length} ${d.payments.length === 1 ? 'pagamento' : 'pagamentos'}</div>
<div class="debt-actions">${actions}</div>
</article>`;
};

export function debts(): string {
  const totals = getDebtTotals();
  const list = S.debts
    .filter((d) => d.type === debtsTab)
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
      return (a.dueDate || '9999').localeCompare(b.dueDate || '9999');
    });

  const body = list.length
    ? list.map(debtCard).join('')
    : `<div class="empty">${debtsTab === 'to_receive' ? 'Ninguém te deve nada por aqui.' : 'Você não deve nada a ninguém.'}<br><button type="button" class="btn p" data-debt-add>Registrar dívida</button></div>`;

  return `<header class="wide"><h1><b>Dívidas</b><div class="mut" style="font-size:.8rem;font-weight:500">Empréstimos, cobranças e amortizações</div></h1><button type="button" class="btn p" data-debt-add>+ Nova</button></header>
<section class="card wide"><div class="cb debt-summary"><div class="kpi-box"><span class="mut">Total a receber</span><b class="num pos">${brl(totals.toReceiveCents)}</b></div><div class="kpi-box"><span class="mut">Total a pagar</span><b class="num neg">${brl(totals.toPayCents)}</b></div></div></section>
<section class="card wide"><div class="cb"><div class="seg" style="margin-bottom:12px"><button type="button" data-debt-tab="to_receive" aria-pressed="${debtsTab === 'to_receive'}">Quem me deve</button><button type="button" data-debt-tab="to_pay" aria-pressed="${debtsTab === 'to_pay'}">A quem devo</button></div><div class="debt-list">${body}</div></div></section>`;
}
