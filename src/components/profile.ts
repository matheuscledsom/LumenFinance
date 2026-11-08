/* ==========================================================================
   profile.ts — Gerenciamento de Temas, Cores, Categorias, Orçamentos, Metas e Conta
   ========================================================================== */

import { S, THEMES, ACC } from '../state';
import type { TransactionType } from '../types/finance';
import { esc } from '../utils/currency';

export let profileCatTab: TransactionType = 'out';

export const setProfileCatTab = (t: TransactionType): void => {
  profileCatTab = t;
};

export function profile(): string {
  const activeCats = S.cats[profileCatTab] || [];

  const catItemsHtml = activeCats
    .map(
      (c) =>
        `<div class="cat-item"><span class="cat-info"><span class="cat-ico" aria-hidden="true">${esc(c.icon)}</span><b>${esc(c.name)}</b></span><button type="button" class="ib cat-del" data-del-cat="${esc(c.id)}" data-cat-type="${profileCatTab}" aria-label="Excluir categoria ${esc(c.name)}">×</button></div>`
    )
    .join('');

  const budgetRowsHtml = (S.cats.out || [])
    .map((c) => {
      const b = S.budgets[c.id] || S.budgets[c.name] || S.budgets[c.name.toLowerCase()];
      const limitStr =
        b && b.limitCents > 0 ? (b.limitCents / 100).toFixed(2).replace('.', ',') : '';
      return `<div class="budget-row"><span class="cat-info"><span class="cat-ico" aria-hidden="true">${esc(c.icon)}</span><b>${esc(c.name)}</b></span><div class="budget-actions"><input class="budget-input" inputmode="decimal" data-budget-input="${esc(c.id)}" placeholder="Sem limite" value="${esc(limitStr)}" aria-label="Orçamento mensal para ${esc(c.name)}">${b && b.limitCents > 0 ? `<button type="button" class="ib cat-del" data-clear-budget="${esc(c.id)}" aria-label="Limpar orçamento de ${esc(c.name)}">×</button>` : ''}</div></div>`;
    })
    .join('');

  const goalStr =
    S.goalCents > 0 ? (S.goalCents / 100).toFixed(2).replace('.', ',') : '';

  return `<header class="wide"><h1><b>Perfil</b></h1></header>
<section class="card wide"><div class="ch">Aparência</div><div class="cb"><div class="mut">Tema</div><div class="th">${THEMES.map((t) => `<button data-th="${t[0]}" aria-pressed="${S.theme === t[0]}">${t[1]}</button>`).join('')}</div>
<div class="mut" style="margin-top:16px">Cor de destaque</div><div class="sw">${ACC.map((a) => `<button data-ac="${a[1]}" style="background:${a[1]}" aria-label="${a[0]}" aria-pressed="${S.accent === a[1]}"></button>`).join('')}<input type="color" id="cc" value="${S.accent}" aria-label="Cor personalizada" style="width:44px;height:34px;padding:2px"></div></div></section>
<section class="card wide"><div class="ch">Meta de Economia Mensal</div><div class="cb">
<div class="mut" style="margin-bottom:8px">Estipule o valor alvo de sobra líquida do mês (receitas − despesas).</div>
<div class="goal-form"><input id="fgoal" inputmode="decimal" placeholder="Ex.: 2000,00" value="${esc(goalStr)}" aria-label="Meta mensal de economia (R$)"><button type="button" class="btn p" id="fgoal-save">Salvar</button>${S.goalCents > 0 ? `<button type="button" class="btn" id="fgoal-clear">Limpar</button>` : ''}</div>
</div></section>
<section class="card wide"><div class="ch">Orçamentos por Categoria</div><div class="cb">
<div class="mut" style="margin-bottom:10px">Defina o teto mensal de gastos (R$) para cada categoria de despesa.</div>
<div class="budget-list">${budgetRowsHtml}</div>
</div></section>
<section class="card wide"><div class="ch">Gerenciar Categorias</div><div class="cb">
<div class="seg" style="margin-bottom:12px"><button type="button" data-cat-tab="out" aria-pressed="${profileCatTab === 'out'}">Despesas</button><button type="button" data-cat-tab="in" aria-pressed="${profileCatTab === 'in'}">Receitas</button></div>
<div class="cat-manage-list">${catItemsHtml}</div>
<form id="fcat" class="cat-form"><input id="fcat-icon" class="cat-icon-input" maxlength="4" placeholder="🏷" value="🏷" aria-label="Emoji da categoria"><input id="fcat-name" maxlength="30" placeholder="Nova categoria..." required aria-label="Nome da nova categoria"><button type="submit" class="btn p" id="fcat-add">Adicionar</button></form>
</div></section>
<section class="card wide"><div class="ch">Conta</div><div class="cb"><label>Nome<input id="nm" value="${esc(S.name)}" maxlength="30"></label>
<div style="display:flex;gap:10px;margin-top:14px"><button type="button" class="btn" id="rst" style="flex:1">Apagar todos os dados</button></div></div></section>`;
}
