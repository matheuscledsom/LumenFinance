/* ==========================================================================
   debts.ts — Central de Dívidas e Empréstimos: Quem me deve / A quem devo,
              amortizações parciais com seleção de conta, liquidação agrupada
              e cobrança via WhatsApp + Pix
   ========================================================================== */

import {
  S,
  debtRemaining,
  getDebtTotals,
  getMutualDebtCompensation,
  settleAllDebtsOfPerson,
  settleMutualDebt
} from '../state';
import type { DebtRecord, DebtType } from '../types/finance';
import { brl, brlPlain, esc } from '../utils/currency';
import { now, toIsoDate } from '../utils/date';
import { centsToInput, parseAmountInput } from '../utils/qol';

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

/**
 * Abre o formulário de amortização / quitação de dívida permitindo escolher a conta bancária.
 */
export function openAmortizeWithAccount(debtId: string): void {
  const debt = S.debts.find((d) => d.id === debtId);
  if (!debt) return;
  const remaining = debtRemaining(debt);
  const isToReceive = debt.type === 'to_receive';
  const labelTx = isToReceive
    ? 'Registrar como ganho no saldo'
    : 'Registrar saída no extrato';
  const accLabel = isToReceive
    ? 'Em qual conta o dinheiro entrou?'
    : 'De qual conta o dinheiro saiu?';
  const accOptions = S.accounts
    .map(
      (a) =>
        `<option value="${esc(a.id)}"${a.isDefault ? ' selected' : ''}>${esc(a.icon)} ${esc(a.name)}</option>`
    )
    .join('');

  const f = document.querySelector<HTMLFormElement>('#f2');
  if (!f) return;
  f.dataset.kind = 'amortize';
  f.dataset.entityId = debtId;
  f.innerHTML = `<h2 id="dt2" style="margin:0 0 4px;font-size:1.2rem">${isToReceive ? 'Receber valor' : 'Pagar valor'}</h2>
<div class="mut" style="font-size:.88rem">${esc(debt.personName)} · restam <b>${brlPlain(remaining)}</b> de ${brlPlain(debt.originalAmountCents)}</div>
<label>Valor (R$)<input id="am-v" inputmode="decimal" placeholder="${esc(centsToInput(remaining))}" value="${esc(centsToInput(remaining))}" required autocomplete="off"></label>
<button type="button" class="link-btn" id="am-fill-max" data-fill-remaining="${esc(centsToInput(remaining))}" style="margin-top:8px;justify-self:start">Quitar tudo (${brlPlain(remaining)})</button>
<label class="chk-row" style="margin-top:10px"><input id="am-income" type="checkbox" checked><span>${esc(labelTx)}</span></label>
<div id="am-acc-wrap" style="margin-top:8px"><label class="mut" style="font-size:.78rem;margin:0 0 4px">${esc(accLabel)}<select id="am-account" style="padding:10px 12px;margin-top:4px">${accOptions}</select></label></div>
<div id="f2e" class="neg" role="alert" style="margin-top:8px;font-size:.85rem"></div>
<div style="display:flex;gap:10px;margin-top:14px"><button type="button" class="btn" data-close-dlg2 style="flex:1">Cancelar</button><button class="btn p" style="flex:1">Salvar</button></div>`;

  const chk = f.querySelector<HTMLInputElement>('#am-income');
  const accWrap = f.querySelector<HTMLElement>('#am-acc-wrap');
  chk?.addEventListener('change', () => {
    if (accWrap) accWrap.style.display = chk.checked ? 'block' : 'none';
  });

  const fillBtn = f.querySelector<HTMLButtonElement>('#am-fill-max');
  fillBtn?.addEventListener('click', () => {
    const vInput = f.querySelector<HTMLInputElement>('#am-v');
    if (vInput) vInput.value = centsToInput(remaining);
  });

  const dlg2 = document.querySelector<HTMLDialogElement>('#dlg2');
  dlg2?.showModal();
  setTimeout(() => f.querySelector<HTMLInputElement>('input')?.focus(), 50);
}

/**
 * Abre o diálogo de quitação agrupada de todas as dívidas de um contato.
 */
export function openSettleAllDialog(personName: string, debtType: DebtType): void {
  const target = personName.trim().toLowerCase();
  const activeDebts = S.debts.filter(
    (d) =>
      d.status === 'active' &&
      d.type === debtType &&
      d.personName.trim().toLowerCase() === target
  );
  const totalRemaining = activeDebts.reduce((sum, d) => sum + debtRemaining(d), 0);
  if (!(totalRemaining > 0)) return;

  const isToReceive = debtType === 'to_receive';
  const labelTx = isToReceive
    ? 'Registrar como ganho no saldo'
    : 'Registrar saída no extrato';
  const accLabel = isToReceive
    ? 'Em qual conta o dinheiro entrou?'
    : 'De qual conta o dinheiro saiu?';
  const accOptions = S.accounts
    .map(
      (a) =>
        `<option value="${esc(a.id)}"${a.isDefault ? ' selected' : ''}>${esc(a.icon)} ${esc(a.name)}</option>`
    )
    .join('');

  const f = document.querySelector<HTMLFormElement>('#f2');
  if (!f) return;
  f.dataset.kind = 'settle-all';
  f.dataset.settlePerson = personName;
  f.dataset.settleType = debtType;
  f.innerHTML = `<h2 id="dt2" style="margin:0 0 4px;font-size:1.2rem">Liquidar tudo de ${esc(personName)}</h2>
<div class="mut" style="font-size:.88rem">${activeDebts.length} ${activeDebts.length === 1 ? 'conta pendente' : 'contas pendentes'} · Total: <b class="${isToReceive ? 'pos' : 'neg'}">${brl(totalRemaining)}</b></div>
<div style="font-size:.82rem;margin-top:10px;line-height:1.4">Esta ação quitará simultaneamente todas as contas ativas deste contato no valor total de <b>${brl(totalRemaining)}</b>.</div>
<label class="chk-row" style="margin-top:12px"><input id="st-ledger" type="checkbox" checked><span>${esc(labelTx)}</span></label>
<div id="st-acc-wrap" style="margin-top:8px"><label class="mut" style="font-size:.78rem;margin:0 0 4px">${esc(accLabel)}<select id="st-account" style="padding:10px 12px;margin-top:4px">${accOptions}</select></label></div>
<div id="f2e" class="neg" role="alert" style="margin-top:8px;font-size:.85rem"></div>
<div style="display:flex;gap:10px;margin-top:14px"><button type="button" class="btn" data-close-dlg2 style="flex:1">Cancelar</button><button class="btn p" style="flex:1">Confirmar Liquidação</button></div>`;

  const chk = f.querySelector<HTMLInputElement>('#st-ledger');
  const accWrap = f.querySelector<HTMLElement>('#st-acc-wrap');
  chk?.addEventListener('change', () => {
    if (accWrap) accWrap.style.display = chk.checked ? 'block' : 'none';
  });

  const dlg2 = document.querySelector<HTMLDialogElement>('#dlg2');
  dlg2?.showModal();
}

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

  const activeList = list.filter((d) => d.status === 'active');
  const peopleMap = new Map<
    string,
    { count: number; totalRemaining: number; debts: DebtRecord[] }
  >();

  for (const d of activeList) {
    const name = d.personName.trim();
    const existing = peopleMap.get(name) || {
      count: 0,
      totalRemaining: 0,
      debts: []
    };
    existing.count += 1;
    existing.totalRemaining += debtRemaining(d);
    existing.debts.push(d);
    peopleMap.set(name, existing);
  }

  const groupedCardsHtml = [...peopleMap.entries()]
    .map(([personName, data]) => {
      const comp = getMutualDebtCompensation(personName);
      return `<div class="debtor-card-grouped">
  <div class="debtor-grouped-info">
    <b>${esc(personName)}</b>
    <span class="mut" style="font-size:.78rem">${data.count} ${data.count === 1 ? 'conta' : 'contas'} · Total: <b class="${debtsTab === 'to_receive' ? 'pos' : 'neg'}">${brl(data.totalRemaining)}</b></span>
  </div>
  <div class="debtor-grouped-actions">
    ${
      comp.canCompensate
        ? `<button type="button" class="btn btn-compensate" data-compensate-person="${esc(personName)}" title="Compensar dívidas mútuas">⚖️ Compensar (${brl(Math.min(comp.toReceiveCents, comp.toPayCents))})</button>`
        : ''
    }
    <button type="button" class="btn p btn-settle-person" data-settle-person="${esc(personName)}" data-settle-type="${esc(debtsTab)}" title="Liquidar todas as contas desta pessoa">⚡ Liquidar Tudo</button>
  </div>
</div>`;
    })
    .join('');

  const groupedSectionHtml =
    peopleMap.size > 0
      ? `<div class="debtors-grouped-section"><div class="debtors-grouped-title">Resumo Agrupado por Pessoa</div><div class="debtors-grouped-grid">${groupedCardsHtml}</div></div>`
      : '';

  const body = list.length
    ? list.map(debtCard).join('')
    : `<div class="empty">${debtsTab === 'to_receive' ? 'Ninguém te deve nada por aqui.' : 'Você não deve nada a ninguém.'}<br><button type="button" class="btn p" data-debt-add>Registrar dívida</button></div>`;

  return `<header class="wide"><h1><b>Dívidas</b><div class="mut" style="font-size:.8rem;font-weight:500">Empréstimos, cobranças e amortizações</div></h1><button type="button" class="btn p" data-debt-add>+ Nova</button></header>
<section class="card wide"><div class="cb debt-summary"><div class="kpi-box"><span class="mut">Total a receber</span><b class="num pos">${brl(totals.toReceiveCents)}</b></div><div class="kpi-box"><span class="mut">Total a pagar</span><b class="num neg">${brl(totals.toPayCents)}</b></div></div></section>
<section class="card wide"><div class="cb"><div class="seg" style="margin-bottom:12px"><button type="button" data-debt-tab="to_receive" aria-pressed="${debtsTab === 'to_receive'}">Quem me deve</button><button type="button" data-debt-tab="to_pay" aria-pressed="${debtsTab === 'to_pay'}">A quem devo</button></div>${groupedSectionHtml}<div class="debt-list" style="margin-top:12px">${body}</div></div></section>`;
}

if (typeof document !== 'undefined') {
  document.addEventListener(
    'click',
    (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const payBtn = target.closest<HTMLElement>('[data-debt-pay]');
      if (payBtn?.dataset.debtPay) {
        e.preventDefault();
        e.stopPropagation();
        openAmortizeWithAccount(payBtn.dataset.debtPay);
        return;
      }

      const settleBtn = target.closest<HTMLElement>('[data-settle-person]');
      if (settleBtn?.dataset.settlePerson && settleBtn.dataset.settleType) {
        e.preventDefault();
        e.stopPropagation();
        openSettleAllDialog(
          settleBtn.dataset.settlePerson,
          settleBtn.dataset.settleType as DebtType
        );
        return;
      }

      const compBtn = target.closest<HTMLElement>('[data-compensate-person]');
      if (compBtn?.dataset.compensatePerson) {
        e.preventDefault();
        e.stopPropagation();
        const person = compBtn.dataset.compensatePerson;
        if (
          confirm(
            `Executar o encontro de contas para ${person}? As dívidas mútuas serão abatidas automaticamente.`
          )
        ) {
          settleMutualDebt(person);
          const tabBtn = document.querySelector<HTMLElement>(
            `[data-debt-tab="${debtsTab}"]`
          );
          if (tabBtn) tabBtn.click();
        }
      }
    },
    true
  );

  document.addEventListener(
    'submit',
    (e: SubmitEvent) => {
      const form = e.target as HTMLFormElement | null;
      if (form?.id === 'f2' && form.dataset.kind === 'settle-all') {
        e.preventDefault();
        e.stopPropagation();
        const person = form.dataset.settlePerson || '';
        const debtType = (form.dataset.settleType as DebtType) || 'to_receive';
        const inLedger = Boolean(
          form.querySelector<HTMLInputElement>('#st-ledger')?.checked
        );
        const accId = form.querySelector<HTMLSelectElement>('#st-account')?.value;
        settleAllDebtsOfPerson(person, debtType, inLedger, accId);
        document.querySelector<HTMLDialogElement>('#dlg2')?.close();

        const tabBtn = document.querySelector<HTMLElement>(
          `[data-debt-tab="${debtType}"]`
        );
        if (tabBtn) tabBtn.click();
      }
    },
    true
  );
}
