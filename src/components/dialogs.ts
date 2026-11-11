/* ==========================================================================
   dialogs.ts — Diálogo auxiliar (#dlg2/#f2): Atalhos, Dívidas, Amortização e Cartões
   ========================================================================== */

import {
  S,
  save,
  addAccount,
  addCard,
  addDebt,
  addShortcut,
  adjustAccountBalance,
  amortizeDebt,
  debtRemaining,
  transferBetweenAccounts,
  updateAccount,
  updateCard,
  upsertBankWithCard
} from '../state';
import {
  PAYMENT_METHODS,
  type BankAccount,
  type CreditCard,
  type DebtType,
  type PaymentMethod
} from '../types/finance';
import { payCardInvoice } from '../utils/credit-card';
import { brlPlain, esc } from '../utils/currency';
import { centsToInput, parseAmountInput } from '../utils/qol';

export type Dialog2Kind =
  | 'shortcut'
  | 'debt'
  | 'amortize'
  | 'card'
  | 'transfer'
  | 'adjust_balance'
  | 'account'
  | 'unified_card_account'
  | 'profile_media_adjust'
  | 'whatsapp_config'
  | 'send_whatsapp'
  | 'pay_invoice'
  | 'customize_home'
  | 'settle-all';

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
 * Abre o modal unificado de cadastro ou edição de Conta & Cartão.
 */
export function openUnifiedCardAccountDialog(accountOrCardId?: string): void {
  let account: BankAccount | undefined;
  let card: CreditCard | undefined;

  if (accountOrCardId) {
    account = S.accounts.find((a) => a.id === accountOrCardId);
    if (!account) {
      card = S.cards.find((c) => c.id === accountOrCardId);
      if (card && card.linkedAccountId) {
        account = S.accounts.find((a) => a.id === card?.linkedAccountId);
      }
    } else if (account.linkedCardId) {
      card = S.cards.find((c) => c.id === account?.linkedCardId);
    }
  }

  const defaultIcons = ['🏦', '🟣', '🟠', '💵', '🟢', '🔵', '🏛️', '💰'];
  const curIcon = account?.icon || '🏦';
  const iconOptions = defaultIcons
    .map(
      (ic) =>
        `<button type="button" class="btn btn-icon-choice${curIcon === ic ? ' active' : ''}" data-choose-icon="${ic}">${ic}</button>`
    )
    .join('');

  const cardMode = account?.cardMode || (card ? 'credit' : 'both');
  const hasCredit = cardMode === 'both' || cardMode === 'credit';
  const color = account?.color || card?.color || '#8b5cf6';
  const lastDigits = account?.lastDigits || card?.lastDigits || '';
  const initialBalance = account ? centsToInput(account.initialBalanceCents) : '0,00';
  const pixKey = account?.pixKey || '';
  const isDefault = account?.isDefault || false;
  const creditLimit = card?.limitCents
    ? centsToInput(card.limitCents)
    : account?.creditLimitCents
    ? centsToInput(account.creditLimitCents)
    : '1000,00';
  const closingDay = card?.closingDay || account?.closingDay || 10;
  const dueDay = card?.dueDay || account?.dueDay || 17;

  open(
    'unified_card_account',
    `<h2 id="dt2" style="margin:0 0 4px;font-size:1.2rem">${account || card ? 'Editar Banco / Cartão' : 'Novo Banco / Cartão'}</h2>
<label>Nome do Banco / Cartão<input id="uca-name" maxlength="30" placeholder="Ex.: Nubank, Inter, Itaú" required value="${esc(account?.name || card?.name || '')}" autocomplete="off"></label>
<div style="margin-top:10px">
  <span class="mut" style="font-size:.8rem;display:block;margin-bottom:6px">Ícone</span>
  <div style="display:flex;gap:6px;flex-wrap:wrap">${iconOptions}</div>
  <input type="hidden" id="uca-icon" value="${esc(curIcon)}">
</div>
<label style="margin-top:10px">Cor de Identificação<input id="uca-color" type="color" value="${esc(color)}" style="height:42px;padding:2px"></label>
<label style="margin-top:10px">Últimos 4 dígitos (opcional)<input id="uca-digits" inputmode="numeric" maxlength="4" placeholder="1234" value="${esc(lastDigits)}" autocomplete="off"></label>

<label style="margin-top:10px">Modalidade
  <select id="uca-mode" style="padding:10px 12px;margin-top:4px">
    <option value="both" ${cardMode === 'both' ? 'selected' : ''}>Débito + Crédito (Múltiplo)</option>
    <option value="debit" ${cardMode === 'debit' ? 'selected' : ''}>Só Débito / Conta</option>
    <option value="credit" ${cardMode === 'credit' ? 'selected' : ''}>Só Crédito</option>
  </select>
</label>

<div id="uca-debit-fields" style="display:${cardMode === 'credit' ? 'none' : 'block'};margin-top:10px">
  <label>Saldo Inicial em Conta / Débito (R$)<input id="uca-balance" inputmode="decimal" placeholder="0,00" value="${esc(initialBalance)}" autocomplete="off"></label>
  <label style="margin-top:10px">Chave Pix Vinculada (opcional)<input id="uca-pix" placeholder="CPF, e-mail, telefone ou chave aleatória" value="${esc(pixKey)}" autocomplete="off"></label>
</div>

<div id="uca-credit-fields" style="display:${hasCredit ? 'block' : 'none'};margin-top:10px;padding:10px;background:var(--card);border:1px solid var(--bd);border-radius:var(--r)">
  <b style="font-size:.88rem;display:block;margin-bottom:8px">💳 Função Cartão de Crédito</b>
  <label>Limite Total de Crédito (R$)<input id="uca-limit" inputmode="decimal" placeholder="5000,00" value="${esc(creditLimit)}" autocomplete="off"></label>
  <div class="form-split-row" style="margin-top:10px">
    <label>Dia Fechamento Fatura<input id="uca-close" type="number" min="1" max="31" value="${closingDay}"><small class="mut" style="font-size:.7rem;display:block;margin-top:2px">Compras até 1 dia antes entram nesta fatura</small></label>
    <label>Dia Vencimento Fatura<input id="uca-due" type="number" min="1" max="31" value="${dueDay}"></label>
  </div>
</div>

<label class="chk-row" style="margin-top:12px"><input id="uca-default" type="checkbox"${isDefault ? ' checked' : ''}><span>Conta / Cartão Principal</span></label>`,
    account?.id || card?.id
  );
}

/**
 * Abre o formulário de cadastro/edição de cartão de crédito (redireciona para o modal unificado).
 */
export function openCardDialog(cardId?: string): void {
  openUnifiedCardAccountDialog(cardId);
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
    const accId = val('#am-account') || undefined;
    const source =
      (val('#am-funding-source') as 'my_account' | 'third_party_custody' | 'external') ||
      'my_account';
    amortizeDebt(entityId, cents, false, accId, source);
    const settled = S.debts.find((d) => d.id === entityId)?.status === 'settled';
    return { ok: true, message: settled ? 'Dívida quitada! 🎉' : 'Pagamento registrado' };
  }

  if (kind === 'transfer') {
    const fromId = val('#tr-from');
    const toId = val('#tr-to');
    const cents = parseAmountInput(val('#tr-v'));
    const date = val('#tr-d');
    const desc = val('#tr-desc');
    if (!fromId || !toId || fromId === toId) {
      return { ok: false, message: 'Selecione duas contas diferentes.' };
    }
    if (!(cents > 0)) {
      return { ok: false, message: 'Informe um valor maior que zero.' };
    }
    const res = transferBetweenAccounts(fromId, toId, cents, date, desc);
    if (!res) return { ok: false, message: 'Não foi possível realizar a transferência.' };
    return { ok: true, message: 'Transferência realizada com sucesso!' };
  }

  if (kind === 'adjust_balance' && entityId) {
    const cents = parseAmountInput(val('#adj-v'));
    const ok = adjustAccountBalance(entityId, cents);
    if (!ok) return { ok: false, message: 'Conta não encontrada.' };
    return { ok: true, message: 'Saldo real ajustado com sucesso!' };
  }

  if (kind === 'unified_card_account') {
    const bankName = val('#uca-name').trim();
    if (!bankName) return { ok: false, message: 'Informe o nome do banco ou cartão.' };
    const icon = val('#uca-icon').trim() || '🏦';
    const color = val('#uca-color').trim() || '#8b5cf6';
    const lastDigits = val('#uca-digits').replace(/\D/g, '').slice(-4);
    const cardMode = (val('#uca-mode') as 'debit' | 'credit' | 'both') || 'both';
    const hasCredit = cardMode === 'both' || cardMode === 'credit';
    const initialBalanceCents = cardMode !== 'credit' ? parseAmountInput(val('#uca-balance')) : 0;
    const pixKey = val('#uca-pix').trim();
    const isDefault = Boolean($<HTMLInputElement>('#uca-default')?.checked);

    let cardLimitCents = 100000;
    let closingDay = 10;
    let dueDay = 17;

    if (hasCredit) {
      cardLimitCents = parseAmountInput(val('#uca-limit')) || 100000;
      closingDay = Math.floor(Number(val('#uca-close'))) || 10;
      dueDay = Math.floor(Number(val('#uca-due'))) || 17;
      if (!(closingDay >= 1 && closingDay <= 31) || !(dueDay >= 1 && dueDay <= 31)) {
        return { ok: false, message: 'Dias de fechamento e vencimento devem estar entre 1 e 31.' };
      }
    }

    upsertBankWithCard({
      accountId: entityId?.startsWith('acc-') ? entityId : undefined,
      cardId: entityId?.startsWith('card-') ? entityId : undefined,
      bankName,
      icon,
      color,
      lastDigits,
      cardMode,
      hasCredit,
      initialBalanceCents,
      pixKey,
      isDefault,
      cardLimitCents,
      closingDay,
      dueDay
    });

    return { ok: true, message: 'Banco/Cartão salvo com sucesso! 🎉' };
  }

  if (kind === 'profile_media_adjust') {
    const avatarZoom = Number(val('#pma-zoom')) || 100;
    const avatarY = Number(val('#pma-avy')) || 0;
    const bannerY = Number(val('#pma-bany')) || 0;
    S.profileMediaAdjust = { avatarZoom, avatarY, bannerY };
    return { ok: true, message: 'Enquadramento atualizado!' };
  }

  if (kind === 'account') {
    const name = val('#acc-name').trim();
    if (!name) return { ok: false, message: 'Informe o nome da conta.' };
    const icon = val('#acc-icon').trim() || '🏦';
    const color = val('#acc-color').trim() || '#8b5cf6';
    const isDefault = Boolean($<HTMLInputElement>('#acc-default')?.checked);
    if (entityId) {
      updateAccount(entityId, { name, icon, color, isDefault });
      return { ok: true, message: 'Conta atualizada com sucesso!' };
    } else {
      const initCents = parseAmountInput(val('#acc-init'));
      const acc = addAccount(name, icon, color, initCents);
      if (isDefault) updateAccount(acc.id, { isDefault: true });
      return { ok: true, message: 'Conta criada com sucesso!' };
    }
  }

  if (kind === 'pay_invoice') {
    const cardId = form.dataset.cardId || '';
    const monthYear = form.dataset.monthYear || '';
    if (!cardId || !monthYear) return { ok: false, message: 'Fatura não identificada.' };

    const totalPaidCents = parseAmountInput(val('#inv-paid-v'));
    if (!(totalPaidCents > 0)) {
      return { ok: false, message: 'Informe um valor pago maior que zero.' };
    }

    const radioMode =
      form.querySelector<HTMLInputElement>('input[name="inv-mode"]:checked')?.value ||
      'my_account';
    const isExternal = radioMode === 'external';

    const useCustodyChk = Boolean($<HTMLInputElement>('#inv-use-custody')?.checked);
    const custodyVal = useCustodyChk ? parseAmountInput(val('#inv-custody-val')) : 0;
    const paidFromAccountId = !isExternal ? val('#inv-account') : undefined;

    const res = payCardInvoice({
      cardId,
      monthYear,
      totalPaidCents,
      useThirdPartyCustodyCents: custodyVal,
      paidFromAccountId,
      isExternalThirdParty: isExternal
    });

    if (!res) return { ok: false, message: 'Não foi possível registrar o pagamento da fatura.' };
    return { ok: true, message: 'Fatura paga com sucesso! 🎉' };
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

  if (kind === 'customize_home') {
    return { ok: true, message: 'Personalização salva' };
  }

  if (kind === 'whatsapp_config') {
    const tpl = val('#wac-template').trim();
    const pix = val('#wac-default-pix').trim();
    if (!tpl) {
      return { ok: false, message: 'O modelo de texto não pode ficar vazio.' };
    }
    S.whatsappTemplate = tpl;
    S.defaultPixKey = pix;
    save();
    return { ok: true, message: 'Modelo de cobrança salvo com sucesso!' };
  }

  return { ok: false, message: 'Formulário inválido.' };
}

/**
 * Abre o modal para personalizar e reordenar os blocos da tela inicial.
 */
export const openCustomizeHomeDialog = (): void => {
  const widgetsHtml = S.homeWidgets
    .map(
      (w, i) => `
      <div class="customize-widget-row" style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border:1px solid var(--bd);border-radius:var(--r);margin-bottom:8px;background:var(--card)">
        <label class="chk-row" style="margin:0;cursor:pointer">
          <input type="checkbox" data-toggle-widget="${esc(w.id)}"${w.visible ? ' checked' : ''}>
          <span style="font-weight:600;font-size:.9rem">${esc(w.label)}</span>
        </label>
        <div style="display:flex;gap:6px">
          <button type="button" class="btn btn-sm" data-move-widget="${esc(w.id)}" data-dir="up"${i === 0 ? ' disabled' : ''} title="Subir" style="padding:4px 8px">↑</button>
          <button type="button" class="btn btn-sm" data-move-widget="${esc(w.id)}" data-dir="down"${i === S.homeWidgets.length - 1 ? ' disabled' : ''} title="Descer" style="padding:4px 8px">↓</button>
        </div>
      </div>
    `
    )
    .join('');

  open(
    'customize_home',
    `<h2 id="d2t" style="margin:0 0 4px;font-size:1.15rem">🎛 Personalizar Tela Inicial</h2>
    <p class="mut" style="font-size:.82rem;margin:0 0 14px">Marque os blocos que deseja exibir na tela inicial e use as setas para ajustar a ordem.</p>
    <div class="customize-widgets-list">${widgetsHtml}</div>
    <div style="display:flex;gap:10px;margin-top:16px">
      <button type="button" class="btn p" id="d2x" style="flex:1">Pronto</button>
    </div>`
  );
};
