/* ==========================================================================
   form-modal.js — Modal de Criação de Movimentações e Validações
   ========================================================================== */

import { CAT } from '../state.js';
import { now } from '../utils/date.js';

const $ = (s) => document.querySelector(s);

/**
 * Atualiza as opções de categoria e estado dos botões de tipo (Gasto/Ganho).
 */
export function cats() {
  const f = $('#f');
  if (!f) return;
  const t = f.dataset.type;
  const fc = $('#fc');
  if (fc && CAT[t]) {
    fc.innerHTML = CAT[t].map((c) => `<option>${c}</option>`).join('');
  }
  f.querySelectorAll('[data-t]').forEach((b) =>
    b.setAttribute('aria-pressed', b.dataset.t === t)
  );
}

/**
 * Abre o modal de nova movimentação configurado para o tipo ('out' | 'in').
 */
export function openForm(type) {
  const f = $('#f');
  if (!f) return;
  f.innerHTML = `<h2 id="dt" style="margin:0 0 4px;font-size:1.2rem">Nova movimentação</h2>
<div class="seg" style="margin-top:10px"><button type="button" data-t="out" aria-pressed="${type === 'out'}">Gasto</button><button type="button" data-t="in" aria-pressed="${type === 'in'}">Ganho</button></div>
<label>Valor (R$)<input id="fv" inputmode="decimal" placeholder="0,00" required autocomplete="off"></label>
<label>Descrição<input id="fn" maxlength="60" required placeholder="Ex.: Almoço" autocomplete="off"></label>
<label>Categoria<select id="fc" style="padding:11px 12px"></select></label>
<label>Data<input id="fd" type="date" value="${now.toISOString().slice(0, 10)}" required></label>
<div id="fe" class="neg" role="alert" style="margin-top:8px;font-size:.85rem"></div>
<div style="display:flex;gap:10px;margin-top:14px"><button type="button" class="btn" id="fx" style="flex:1">Cancelar</button><button class="btn p" style="flex:1">Salvar</button></div>`;
  f.dataset.type = type;
  cats();
  $('#dlg').showModal();
  setTimeout(() => {
    const fv = $('#fv');
    if (fv) fv.focus();
  }, 50);
}
