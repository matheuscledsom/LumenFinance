/* ==========================================================================
   form-modal.ts — Modal de Criação e Edição de Movimentações com Validações
   ========================================================================== */

import { S, normalizePay, normalizeTag, normalizeTags } from '../state';
import {
  PAYMENT_METHODS,
  type Category,
  type PaymentMethod,
  type TransactionType
} from '../types/finance';
import { guessCategory } from '../utils/category-guesser';
import { esc, parseCents } from '../utils/currency';
import { now } from '../utils/date';

const $ = <T extends Element = HTMLElement>(s: string): T | null =>
  document.querySelector<T>(s);

/**
 * Estado local de tags ativas no modal de criação/edição.
 */
let currentTags: string[] = [];

/**
 * Indica se o usuário já alterou manualmente o seletor de categoria na sessão atual do modal.
 */
let categoryManuallyChanged = false;

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
      const totalCents = parseCents(fv?.value);
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

  syncThirdPartyVisibility();
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
  const isRecurring = Boolean(tx?.recurring);
  const instTotal = tx?.installments?.total && tx.installments.total > 1 ? tx.installments.total : 1;
  const isThirdParty = Boolean(tx?.thirdParty?.isThirdParty);
  const tpPersonName = tx?.thirdParty?.personName || '';

  currentTags = tx ? normalizeTags(tx.tags) : [];
  categoryManuallyChanged = Boolean(tx);

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
<div class="form-split-row"><label class="chk-row"><input id="frec" type="checkbox"${isRecurring ? ' checked' : ''}><span>Repetir mensalmente</span></label><label>Parcelas<input id="finst" type="number" min="1" max="72" value="${instTotal}"${isRecurring ? ' disabled' : ''}></label></div>
<div id="finst-prev" class="mut" style="font-size:.8rem;margin-top:4px"></div>
<div id="ftp-section" style="display:${activeType === 'out' ? 'block' : 'none'}"><label class="chk-row" style="margin-top:6px"><input id="ftp" type="checkbox"${isThirdParty ? ' checked' : ''}><span>Compra para outra pessoa (Cartão emprestado)</span></label><label id="ftp-name-wrap" style="display:${activeType === 'out' && isThirdParty ? 'grid' : 'none'};margin-top:4px">Nome da pessoa<input id="ftp-name" maxlength="40" placeholder="Ex: Irmão, Amigo" value="${esc(tpPersonName)}" autocomplete="off"></label></div>
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
  syncRecurrenceAndInstallments();
  syncThirdPartyVisibility();

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
    });
  }

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
    });
    finst.addEventListener('change', () => {
      syncRecurrenceAndInstallments();
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
