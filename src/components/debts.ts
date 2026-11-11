/* ==========================================================================
   debts.ts — Central de Dívidas e Empréstimos: Quem me deve / A quem devo,
              amortizações parciais com seleção de conta, liquidação agrupada
              e cobrança via WhatsApp + Pix
   ========================================================================== */

import {
  DEFAULT_WHATSAPP_TEMPLATE,
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
 * Formata a mensagem de cobrança substituindo tags {nome}, {valor}, {descricao}, {pix}.
 */
export function formatWhatsAppMessage(
  debt: DebtRecord,
  template?: string,
  pixKey?: string
): string {
  const tpl = template || S.whatsappTemplate || DEFAULT_WHATSAPP_TEMPLATE;
  const remaining = brlPlain(debtRemaining(debt));
  const effectivePix = pixKey !== undefined ? pixKey : (debt.pixKey || S.defaultPixKey || '');
  const desc = debt.description ? debt.description : 'valor combinado';

  return tpl
    .replace(/\{nome\}/gi, debt.personName)
    .replace(/\{valor\}/gi, remaining)
    .replace(/\{descricao\}/gi, desc)
    .replace(/\{pix\}/gi, effectivePix);
}

/**
 * Monta a mensagem amigável de cobrança com a chave Pix e o saldo restante.
 */
export const buildCollectionMessage = (debt: DebtRecord): string => {
  return formatWhatsAppMessage(debt);
};

/**
 * Gera o link wa.me com o texto de cobrança já codificado.
 */
export const buildWhatsAppLink = (debt: DebtRecord): string =>
  `https://wa.me/?text=${encodeURIComponent(formatWhatsAppMessage(debt))}`;

/**
 * Abre o modal de configuração global do modelo de cobrança de WhatsApp.
 */
export function openWhatsAppConfigDialog(): void {
  const f = document.querySelector<HTMLFormElement>('#f2');
  if (!f) return;
  f.dataset.kind = 'whatsapp_config';
  delete f.dataset.entityId;

  const currentTemplate = S.whatsappTemplate || DEFAULT_WHATSAPP_TEMPLATE;
  const defaultPix = S.defaultPixKey || '';

  const previewExample = (tpl: string, pix: string): string => {
    return tpl
      .replace(/\{nome\}/gi, 'Carlos Silva')
      .replace(/\{valor\}/gi, 'R$ 75,00')
      .replace(/\{descricao\}/gi, 'Almoço de sexta')
      .replace(/\{pix\}/gi, pix || 'sua-chave@pix.com');
  };

  f.innerHTML = `
    <h2 id="dt2" style="margin:0 0 4px;font-size:1.2rem">💬 Personalizar Mensagem de Cobrança</h2>
    <div class="mut" style="font-size:.82rem;margin-bottom:12px">Configure o modelo de texto usado ao cobrar devedores no WhatsApp.</div>

    <label style="margin-bottom:10px">
      Chave Pix Padrão (opcional)
      <input id="wac-default-pix" value="${esc(defaultPix)}" placeholder="Ex.: seu@email.com ou celular" style="margin-top:4px">
    </label>

    <div style="margin-bottom:6px;font-size:.82rem;font-weight:600">Tags rápidas (clique para inserir):</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">
      <button type="button" class="btn btn-sm" data-insert-wac-tag="{nome}">+ {nome}</button>
      <button type="button" class="btn btn-sm" data-insert-wac-tag="{valor}">+ {valor}</button>
      <button type="button" class="btn btn-sm" data-insert-wac-tag="{descricao}">+ {descricao}</button>
      <button type="button" class="btn btn-sm" data-insert-wac-tag="{pix}">+ {pix}</button>
    </div>

    <label style="margin-bottom:10px">
      Modelo do Texto
      <textarea id="wac-template" rows="4" style="width:100%;resize:vertical;padding:10px;font-size:.88rem;border:1px solid var(--bd);border-radius:var(--r);background:var(--card);color:var(--tx);margin-top:4px;box-sizing:border-box" required>${esc(currentTemplate)}</textarea>
    </label>

    <div style="margin-top:10px;padding:10px 12px;background:var(--card);border:1px dashed var(--bd);border-radius:var(--r)">
      <div class="mut" style="font-size:.75rem;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;font-weight:700">👀 Pré-visualização com dados simulados</div>
      <div id="wac-preview" style="font-size:.84rem;line-height:1.45;white-space:pre-wrap;color:var(--tx)">${esc(previewExample(currentTemplate, defaultPix))}</div>
    </div>

    <div id="f2e" class="neg" role="alert" style="margin-top:8px;font-size:.85rem"></div>
    <div style="display:flex;gap:10px;margin-top:14px">
      <button type="button" class="btn" data-close-dlg2 style="flex:1">Cancelar</button>
      <button type="submit" class="btn p" style="flex:1">Salvar Template</button>
    </div>
  `;

  const dlg2 = document.querySelector<HTMLDialogElement>('#dlg2');
  dlg2?.showModal();
}

/**
 * Abre o diálogo de disparo pré-envio com revisão de dados e mensagem no WhatsApp.
 */
export function openSendWhatsAppDialog(debtId: string): void {
  const debt = S.debts.find((d) => d.id === debtId);
  if (!debt) return;

  const remaining = debtRemaining(debt);
  const pixKey = debt.pixKey || S.defaultPixKey || '';
  const messageText = formatWhatsAppMessage(debt, S.whatsappTemplate, pixKey);

  const f = document.querySelector<HTMLFormElement>('#f2');
  if (!f) return;
  f.dataset.kind = 'send_whatsapp';
  f.dataset.entityId = debtId;

  f.innerHTML = `
    <h2 id="dt2" style="margin:0 0 4px;font-size:1.2rem">💬 Cobrar no WhatsApp</h2>
    <div class="mut" style="font-size:.85rem;margin-bottom:12px">Revise os dados e o texto antes de enviar para <b>${esc(debt.personName)}</b>.</div>

    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:var(--card);border:1px solid var(--bd);border-radius:var(--r);margin-bottom:12px">
      <div>
        <div class="mut" style="font-size:.75rem;text-transform:uppercase;letter-spacing:.04em">Valor restante</div>
        <b class="num pos" style="font-size:1.2rem">${brlPlain(remaining)}</b>
      </div>
      <div style="text-align:right">
        <div class="mut" style="font-size:.75rem">Referência</div>
        <div style="font-size:.88rem;font-weight:600">${esc(debt.description || 'Sem descrição')}</div>
      </div>
    </div>

    <label style="margin-bottom:10px">
      Chave Pix para esta cobrança
      <div style="display:flex;gap:6px;margin-top:4px">
        <input id="wa-send-pix" value="${esc(pixKey)}" placeholder="Ex.: sua chave Pix" style="flex:1">
        <button type="button" class="btn btn-sm" data-copy-send-pix title="Copiar Chave Pix" style="padding:0 12px">📋 Copiar</button>
      </div>
    </label>

    <label style="margin-bottom:10px">
      Mensagem a ser enviada
      <textarea id="wa-send-text" rows="4" style="width:100%;resize:vertical;padding:10px;font-size:.88rem;border:1px solid var(--bd);border-radius:var(--r);background:var(--card);color:var(--tx);margin-top:4px;box-sizing:border-box" required>${esc(messageText)}</textarea>
    </label>

    <div style="font-size:.78rem;color:var(--mut);line-height:1.4;margin-bottom:10px">
      💡 Ao confirmar, o WhatsApp abrirá diretamente com o texto acima.
    </div>

    <div id="f2e" class="neg" role="alert" style="margin-top:8px;font-size:.85rem"></div>
    <div style="display:flex;gap:10px;margin-top:14px">
      <button type="button" class="btn" data-close-dlg2 style="flex:1">Cancelar</button>
      <button type="button" class="btn p" data-send-wa-confirm style="flex:1;background:#25d366;border-color:#25d366;color:#fff;font-weight:700">Enviar no WhatsApp 🚀</button>
    </div>
  `;

  const dlg2 = document.querySelector<HTMLDialogElement>('#dlg2');
  dlg2?.showModal();
}

/**
 * Abre o formulário de amortização / quitação de dívida com liquidação consciente de custódia e contas.
 */
export function openAmortizeWithAccount(debtId: string): void {
  const debt = S.debts.find((d) => d.id === debtId);
  if (!debt) return;
  const remaining = debtRemaining(debt);
  const isToReceive = debt.type === 'to_receive';

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

  const contentHtml = isToReceive
    ? `<label class="mut" style="font-size:.78rem;margin:10px 0 4px">Em qual conta o dinheiro caiu?
        <select id="am-account" style="padding:10px 12px;margin-top:4px">${accOptions}</select>
      </label>
      <div style="margin-top:10px;padding:8px 10px;background:var(--card);border:1px solid var(--bd);border-radius:var(--r);font-size:.78rem;line-height:1.4">
        💡 <b>Custódia de Terceiros:</b> O valor entrará nesta conta como dinheiro guardado de amigos, permitindo abater faturas futuras sem inflar seus Ganhos Pessoais do mês.
      </div>`
    : `<label class="mut" style="font-size:.78rem;margin:10px 0 4px">Origem dos recursos:
        <select id="am-funding-source" style="padding:10px 12px;margin-top:4px">
          <option value="my_account">Minha Conta Bancária</option>
          <option value="third_party_custody">Abater da Custódia de Terceiros</option>
          <option value="external">Paguei por fora (Dinheiro externo)</option>
        </select>
      </label>
      <div id="am-acc-wrap" style="margin-top:8px">
        <label class="mut" style="font-size:.78rem;margin:0 0 4px">De qual conta o dinheiro saiu?
          <select id="am-account" style="padding:10px 12px;margin-top:4px">${accOptions}</select>
        </label>
      </div>`;

  f.innerHTML = `<h2 id="dt2" style="margin:0 0 4px;font-size:1.2rem">${isToReceive ? 'Receber valor' : 'Pagar valor'}</h2>
<div class="mut" style="font-size:.88rem">${esc(debt.personName)} · restam <b>${brlPlain(remaining)}</b> de ${brlPlain(debt.originalAmountCents)}</div>
<label style="margin-top:10px">Valor (R$)<input id="am-v" inputmode="decimal" placeholder="${esc(centsToInput(remaining))}" value="${esc(centsToInput(remaining))}" required autocomplete="off"></label>
<button type="button" class="link-btn" id="am-fill-max" data-fill-remaining="${esc(centsToInput(remaining))}" style="margin-top:8px;justify-self:start">Quitar tudo (${brlPlain(remaining)})</button>
${contentHtml}
<div id="f2e" class="neg" role="alert" style="margin-top:8px;font-size:.85rem"></div>
<div style="display:flex;gap:10px;margin-top:14px"><button type="button" class="btn" data-close-dlg2 style="flex:1">Cancelar</button><button class="btn p" style="flex:1">Salvar</button></div>`;

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

  const contentHtml = isToReceive
    ? `<label class="mut" style="font-size:.78rem;margin:10px 0 4px">Em qual conta o dinheiro entrou?
        <select id="st-account" style="padding:10px 12px;margin-top:4px">${accOptions}</select>
      </label>
      <div style="margin-top:10px;padding:8px 10px;background:var(--card);border:1px solid var(--bd);border-radius:var(--r);font-size:.78rem;line-height:1.4">
        💡 <b>Custódia de Terceiros:</b> O valor total entrará nesta conta como dinheiro guardado de amigos, permitindo abater faturas futuras sem inflar seus Ganhos Pessoais do mês.
      </div>`
    : `<label class="mut" style="font-size:.78rem;margin:10px 0 4px">Origem dos recursos:
        <select id="st-funding-source" style="padding:10px 12px;margin-top:4px">
          <option value="my_account">Minha Conta Bancária</option>
          <option value="third_party_custody">Abater da Custódia de Terceiros</option>
          <option value="external">Paguei por fora (Dinheiro externo)</option>
        </select>
      </label>
      <div id="st-acc-wrap" style="margin-top:8px">
        <label class="mut" style="font-size:.78rem;margin:0 0 4px">De qual conta o dinheiro saiu?
          <select id="st-account" style="padding:10px 12px;margin-top:4px">${accOptions}</select>
        </label>
      </div>`;

  f.innerHTML = `<h2 id="dt2" style="margin:0 0 4px;font-size:1.2rem">Liquidar tudo de ${esc(personName)}</h2>
<div class="mut" style="font-size:.88rem">${activeDebts.length} ${activeDebts.length === 1 ? 'conta pendente' : 'contas pendentes'} · Total: <b class="${isToReceive ? 'pos' : 'neg'}">${brl(totalRemaining)}</b></div>
<div style="font-size:.82rem;margin-top:10px;line-height:1.4">Esta ação quitará simultaneamente todas as contas ativas deste contato no valor total de <b>${brl(totalRemaining)}</b>.</div>
${contentHtml}
<div id="f2e" class="neg" role="alert" style="margin-top:8px;font-size:.85rem"></div>
<div style="display:flex;gap:10px;margin-top:14px"><button type="button" class="btn" data-close-dlg2 style="flex:1">Cancelar</button><button class="btn p" style="flex:1">Confirmar Liquidação</button></div>`;

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

  return `<header class="wide"><h1><b>Dívidas</b><div class="mut" style="font-size:.8rem;font-weight:500">Empréstimos, cobranças e amortizações</div></h1><div style="display:flex;gap:8px"><button type="button" class="btn btn-sm" data-debt-msg-config title="Personalizar mensagem de cobrança do WhatsApp">💬 Personalizar Mensagem</button><button type="button" class="btn p" data-debt-add>+ Nova</button></div></header>
<section class="card wide"><div class="cb debt-summary"><div class="kpi-box"><span class="mut">Total a receber</span><b class="num pos">${brl(totals.toReceiveCents)}</b></div><div class="kpi-box"><span class="mut">Total a pagar</span><b class="num neg">${brl(totals.toPayCents)}</b></div></div></section>
<section class="card wide"><div class="cb"><div class="seg" style="margin-bottom:12px"><button type="button" data-debt-tab="to_receive" aria-pressed="${debtsTab === 'to_receive'}">Quem me deve</button><button type="button" data-debt-tab="to_pay" aria-pressed="${debtsTab === 'to_pay'}">A quem devo</button></div>${groupedSectionHtml}<div class="debt-list" style="margin-top:12px">${body}</div></div></section>`;
}
