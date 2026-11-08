/* ==========================================================================
   form-modal.ts — Modal de Criação e Edição de Movimentações com Validações
   ========================================================================== */

import { S, CAT, normalizePay, normalizeTag, normalizeTags } from '../state';
import {
  PAYMENT_METHODS,
  type Category,
  type PaymentMethod,
  type TransactionType
} from '../types/finance';
import { esc } from '../utils/currency';
import { now } from '../utils/date';

const $ = <T extends Element = HTMLElement>(s: string): T | null =>
  document.querySelector<T>(s);

/**
 * Estado local de tags ativas no modal de criação/edição.
 */
let currentTags: string[] = [];

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
 * Atualiza as opções de categoria e estado dos botões de tipo (Gasto/Ganho).
 */
export function cats(selectedCat?: Category): void {
  const f = $<HTMLFormElement>('#f');
  if (!f) return;
  const t = (f.dataset.type === 'in' ? 'in' : 'out') as TransactionType;
  const fc = $<HTMLSelectElement>('#fc');
  if (fc && CAT[t]) {
    const current = selectedCat ?? fc.value;
    fc.innerHTML = CAT[t]
      .map(
        (c) => `<option value="${esc(c)}"${c === current ? ' selected' : ''}>${esc(c)}</option>`
      )
      .join('');
  }
  f.querySelectorAll<HTMLButtonElement>('[data-t]').forEach((b) =>
    b.setAttribute('aria-pressed', String(b.dataset.t === t))
  );
}

/**
 * Abre o modal de movimentação para criação (txId = null) ou edição (txId fornecido).
 */
export function openForm(type: TransactionType, txId: string | null = null): void {
  const f = $<HTMLFormElement>('#f');
  if (!f) return;

  const tx = txId != null ? S.tx.find((x) => String(x.id) === String(txId)) : null;
  const activeType: TransactionType = tx ? tx.type : type;
  const activePay: PaymentMethod = tx ? normalizePay(tx.pay) : 'money';
  const valStr = tx ? (tx.v / 100).toFixed(2).replace('.', ',') : '';
  const descStr = tx ? tx.n : '';
  const dateStr = tx ? tx.d : now.toISOString().slice(0, 10);

  currentTags = tx ? normalizeTags(tx.tags) : [];

  const payOptions = PAYMENT_METHODS.map(
    (p) =>
      `<option value="${esc(p.id)}"${p.id === activePay ? ' selected' : ''}>${esc(p.label)}</option>`
  ).join('');

  f.innerHTML = `<h2 id="dt" style="margin:0 0 4px;font-size:1.2rem">${tx ? 'Editar movimentação' : 'Nova movimentação'}</h2>
<div class="seg" style="margin-top:10px"><button type="button" data-t="out" aria-pressed="${activeType === 'out'}">Gasto</button><button type="button" data-t="in" aria-pressed="${activeType === 'in'}">Ganho</button></div>
<label>Valor (R$)<input id="fv" inputmode="decimal" placeholder="0,00" value="${esc(valStr)}" required autocomplete="off"></label>
<label>Descrição<input id="fn" maxlength="60" required placeholder="Ex.: Almoço" value="${esc(descStr)}" autocomplete="off"></label>
<label>Categoria<select id="fc" style="padding:11px 12px"></select></label>
<label>Forma de pagamento<select id="fpay" style="padding:11px 12px">${payOptions}</select></label>
<label>Data<input id="fd" type="date" value="${esc(dateStr)}" required></label>
<label>Tags<input id="ftag" placeholder="Adicionar tag (Enter ou vírgula)" autocomplete="off"></label>
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
    const fv = $<HTMLInputElement>('#fv');
    if (fv) fv.focus();
  }, 50);
}
