/* ==========================================================================
   form-modal.ts — Modal de Criação e Edição de Movimentações com Validações
   ========================================================================== */

import { S, CAT } from '../state';
import type { Category, TransactionType } from '../types/index';
import { esc } from '../utils/currency';
import { now } from '../utils/date';

const $ = <T extends Element = HTMLElement>(s: string): T | null =>
  document.querySelector<T>(s);

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
  const valStr = tx ? (tx.v / 100).toFixed(2).replace('.', ',') : '';
  const descStr = tx ? tx.n : '';
  const dateStr = tx ? tx.d : now.toISOString().slice(0, 10);

  f.innerHTML = `<h2 id="dt" style="margin:0 0 4px;font-size:1.2rem">${tx ? 'Editar movimentação' : 'Nova movimentação'}</h2>
<div class="seg" style="margin-top:10px"><button type="button" data-t="out" aria-pressed="${activeType === 'out'}">Gasto</button><button type="button" data-t="in" aria-pressed="${activeType === 'in'}">Ganho</button></div>
<label>Valor (R$)<input id="fv" inputmode="decimal" placeholder="0,00" value="${esc(valStr)}" required autocomplete="off"></label>
<label>Descrição<input id="fn" maxlength="60" required placeholder="Ex.: Almoço" value="${esc(descStr)}" autocomplete="off"></label>
<label>Categoria<select id="fc" style="padding:11px 12px"></select></label>
<label>Data<input id="fd" type="date" value="${esc(dateStr)}" required></label>
<div id="fe" class="neg" role="alert" style="margin-top:8px;font-size:.85rem"></div>
<div style="display:flex;gap:10px;margin-top:14px"><button type="button" class="btn" id="fx" style="flex:1">Cancelar</button>${tx ? `<button type="button" class="btn neg" id="fdel" data-del="${esc(tx.id)}" style="flex:1">Excluir</button>` : ''}<button class="btn p" style="flex:1">Salvar</button></div>`;

  f.dataset.type = activeType;
  if (tx) {
    f.dataset.txId = String(tx.id);
  } else {
    delete f.dataset.txId;
  }

  cats(tx ? tx.c : undefined);
  $<HTMLDialogElement>('#dlg')?.showModal();
  setTimeout(() => {
    const fv = $<HTMLInputElement>('#fv');
    if (fv) fv.focus();
  }, 50);
}
