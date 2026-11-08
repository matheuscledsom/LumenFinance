/* ==========================================================================
   dialogs.ts — Diálogo auxiliar (#dlg2/#f2): Atalhos, Dívidas, Amortização e Cartões
   ========================================================================== */

import {
  S,
  addCard,
  addDebt,
  addShortcut,
  amortizeDebt,
  debtRemaining,
  updateCard
} from '../state';
import {
  PAYMENT_METHODS,
  type DebtType,
  type PaymentMethod
} from '../types/finance';
import { brlPlain, esc } from '../utils/currency';
import { centsToInput, parseAmountInput } from '../utils/qol';

export type Dialog2Kind = 'shortcut' | 'debt' | 'amortize' | 'card';

export interface DialogResult {
  ok: boolean;
  message: string;
}

const $ = <T extends Element = HTMLElement>(s: string): T | null =>
  document.querySelector<T>(s);

const CARD_COLORS: readonly string[] = [
  '#8b5cf6',
  '#3b82f6',
  '#06b6d4',
  '#22c55e',
  '#f97316',
  '#ef4444',
  '#ec4899',
  '#334155'
];

const open = (kind: Dialog2Kind, html: string, entityId?: string): void => {
  const f = $<HTMLFormElement>('#f2');
  if (!f) return;
  f.dataset.kind = kind;
  if (entityId) f.dataset.entityId = entityId;
  else delete f.dataset.entityId;
  f.innerHTML = `${html}<div id="f2e" class="neg" role="alert" style="margin-top:8px;font-size:.85rem"></div>
<div style="display:flex;gap:10px;margin-top:14px"><button type="button" class="btn" data-close-dlg2 style="flex:1">Cancelar</button><button class="btn p" style="flex:1">Salvar</button></div>`;
  $<HTMLDialogElement>('#dlg2')?.showModal();
  setTimeout(() => f.querySelector<HTMLInputElement>('input')?.focus(), 50);
};

export const closeDialog2 = (): void => {
  $<HTMLDialogElement>('#dlg2')?.close();
};

const payOptions = (selected: PaymentMethod): string =>
  PAYMENT_METHODS.map(
    (p) =>
      `<option value="${esc(p.id)}"${p.id === selected ? ' selected' : ''}>${esc(p.icon || '')} ${esc(p.label)}</option>`
  ).join('');

/**
 * Abre o formulário de novo atalho rápido (botão de 1 toque da Home).
 */
export function openShortcutDialog(): void {
  const catOptions = S.cats.out
    .map((c) => `<option value="${esc(c.id)}">${esc(c.icon)} ${esc(c.name)}</option>`)
    .join('');
  const cardOptions = S.cards.length
    ? `<label>Cartão (se crédito)<select id="sc-card" style="padding:11px 12px"><option value="">Nenhum</option>${S.cards
        .map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`)
        .join('')}</select></label>`
    : '';
  open(
    'shortcut',
    `<h2 id="dt2" style="margin:0 0 4px;font-size:1.2rem">Novo atalho rápido</h2>
<label>Nome<input id="sc-label" maxlength="24" placeholder="Ex.: Café" required autocomplete="off"></label>
<label>Valor (R$)<input id="sc-v" inputmode="decimal" placeholder="6,00" required autocomplete="off"></label>
<label>Categoria<select id="sc-cat" style="padding:11px 12px">${catOptions}</select></label>
<label>Pagamento<select id="sc-pay" style="padding:11px 12px">${payOptions('pix')}</select></label>
${cardOptions}`
  );
}

/**
 * Abre o formulário de nova dívida/empréstimo.
 */
export function openDebtDialog(type: DebtType): void {
  open(
    'debt',
    `<h2 id="dt2" style="margin:0 0 4px;font-size:1.2rem">Nova dívida / empréstimo</h2>
<label>Tipo<select id="d-type" style="padding:11px 12px"><option value="to_receive"${type === 'to_receive' ? ' selected' : ''}>Quem me deve</option><option value="to_pay"${type === 'to_pay' ? ' selected' : ''}>A quem devo</option></select></label>
<label>Pessoa<input id="d-person" maxlength="40" placeholder="Ex.: Carlos" required autocomplete="off"></label>
<label>Valor (R$)<input id="d-v" inputmode="decimal" placeholder="100,00" required autocomplete="off"></label>
<label>Descrição<input id="d-desc" maxlength="80" placeholder="Ex.: Jantar de sexta" autocomplete="off"></label>
<label>Vencimento (opcional)<input id="d-due" type="date"></label>
<label>Chave Pix (opcional)<input id="d-pix" maxlength="80" placeholder="E-mail, CPF, telefone ou aleatória" autocomplete="off"></label>`
  );
}

/**
 * Abre o diálogo de pagamento parcial / quitação de uma dívida.
 */
export function openAmortizeDialog(debtId: string): void {
  const debt = S.debts.find((d) => d.id === debtId);
  if (!debt) return;
  const remaining = debtRemaining(debt);
  const incomeOpt =
    debt.type === 'to_receive'
      ? `<label class="chk-row"><input id="am-income" type="checkbox" checked><span>Registrar como ganho no saldo</span></label>`
      : '';
  open(
    'amortize',
    `<h2 id="dt2" style="margin:0 0 4px;font-size:1.2rem">${debt.type === 'to_receive' ? 'Receber valor' : 'Pagar valor'}</h2>
<div class="mut" style="font-size:.88rem">${esc(debt.personName)} · restam <b>${brlPlain(remaining)}</b> de ${brlPlain(debt.originalAmountCents)}</div>
<label>Valor (R$)<input id="am-v" inputmode="decimal" placeholder="${esc(centsToInput(remaining))}" required autocomplete="off"></label>
<button type="button" class="link-btn" data-fill-remaining="${esc(centsToInput(remaining))}" style="margin-top:8px;justify-self:start">Quitar tudo (${brlPlain(remaining)})</button>
${incomeOpt}`,
    debtId
  );
}

/**
 * Abre o formulário de cadastro/edição de cartão de crédito.
 */
export function openCardDialog(cardId?: string): void {
  const card = cardId ? S.cards.find((c) => c.id === cardId) : undefined;
  const color = card?.color || CARD_COLORS[S.cards.length % CARD_COLORS.length];
  open(
    'card',
    `<h2 id="dt2" style="margin:0 0 4px;font-size:1.2rem">${card ? 'Editar cartão' : 'Novo cartão'}</h2>
<label>Nome<input id="cd-name" maxlength="24" placeholder="Ex.: Nubank" required value="${esc(card?.name || '')}" autocomplete="off"></label>
<label>Últimos 4 dígitos (opcional)<input id="cd-digits" inputmode="numeric" maxlength="4" placeholder="1234" value="${esc(card?.lastDigits || '')}" autocomplete="off"></label>
<label>Cor<input id="cd-color" type="color" value="${esc(color)}" style="height:42px;padding:2px"></label>
<label>Limite (R$)<input id="cd-limit" inputmode="decimal" placeholder="5000,00" value="${card ? esc(centsToInput(card.limitCents)) : ''}" autocomplete="off"></label>
<div class="form-split-row"><label>Dia de fechamento<input id="cd-close" type="number" min="1" max="31" value="${card?.closingDay ?? 10}" required></label><label>Dia de vencimento<input id="cd-due" type="number" min="1" max="31" value="${card?.dueDay ?? 17}" required></label></div>`,
    cardId
  );
}

const val = (id: string): string => $<HTMLInputElement>(id)?.value ?? '';

/**
 * Valida e aplica o formulário aberto em #f2 conforme o tipo (kind).
 */
export function submitDialog2(form: HTMLFormElement): DialogResult {
  const kind = form.dataset.kind as Dialog2Kind | undefined;
  const entityId = form.dataset.entityId;

  if (kind === 'shortcut') {
    const label = val('#sc-label').trim();
    const cents = parseAmountInput(val('#sc-v'));
    if (!label) return { ok: false, message: 'Informe um nome para o atalho.' };
    if (!(cents > 0)) return { ok: false, message: 'Informe um valor maior que zero.' };
    const pay = val('#sc-pay') as PaymentMethod;
    const cardId = val('#sc-card');
    addShortcut({
      label,
      amountCents: cents,
      categoryId: val('#sc-cat'),
      paymentMethod: pay,
      ...(cardId ? { cardId } : {})
    });
    return { ok: true, message: 'Atalho adicionado' };
  }

  if (kind === 'debt') {
    const person = val('#d-person').trim();
    const cents = parseAmountInput(val('#d-v'));
    if (!person) return { ok: false, message: 'Informe o nome da pessoa.' };
    if (!(cents > 0)) return { ok: false, message: 'Informe um valor maior que zero.' };
    addDebt({
      personName: person,
      type: val('#d-type') === 'to_pay' ? 'to_pay' : 'to_receive',
      originalAmountCents: cents,
      description: val('#d-desc'),
      dueDate: val('#d-due') || undefined,
      pixKey: val('#d-pix') || undefined
    });
    return { ok: true, message: 'Dívida registrada' };
  }

  if (kind === 'amortize' && entityId) {
    const cents = parseAmountInput(val('#am-v'));
    if (!(cents > 0)) return { ok: false, message: 'Informe um valor maior que zero.' };
    const asIncome = Boolean($<HTMLInputElement>('#am-income')?.checked);
    amortizeDebt(entityId, cents, asIncome);
    const settled = S.debts.find((d) => d.id === entityId)?.status === 'settled';
    return { ok: true, message: settled ? 'Dívida quitada! 🎉' : 'Pagamento registrado' };
  }

  if (kind === 'card') {
    const name = val('#cd-name').trim();
    if (!name) return { ok: false, message: 'Informe o nome do cartão.' };
    const limit = parseAmountInput(val('#cd-limit'));
    const closingDay = Math.floor(Number(val('#cd-close')));
    const dueDay = Math.floor(Number(val('#cd-due')));
    if (!(closingDay >= 1 && closingDay <= 31) || !(dueDay >= 1 && dueDay <= 31)) {
      return { ok: false, message: 'Dias de fechamento e vencimento devem estar entre 1 e 31.' };
    }
    const data = {
      name,
      lastDigits: val('#cd-digits').replace(/\D/g, '').slice(-4) || undefined,
      color: val('#cd-color'),
      limitCents: limit > 0 ? limit : 0,
      closingDay,
      dueDay
    };
    if (entityId) updateCard(entityId, data);
    else addCard(data);
    return { ok: true, message: entityId ? 'Cartão atualizado' : 'Cartão cadastrado' };
  }

  return { ok: false, message: 'Formulário inválido.' };
}
