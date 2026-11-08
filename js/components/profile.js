/* ==========================================================================
   profile.js — Gerenciamento de Temas, Cores de Destaque e Conta
   ========================================================================== */

import { S, THEMES, ACC } from '../state.js';
import { esc } from '../utils/currency.js';

export function profile() {
  return `<header class="wide"><h1><b>Perfil</b></h1></header>
<section class="card wide"><div class="ch">Aparência</div><div class="cb"><div class="mut">Tema</div><div class="th">${THEMES.map((t) => `<button data-th="${t[0]}" aria-pressed="${S.theme === t[0]}">${t[1]}</button>`).join('')}</div>
<div class="mut" style="margin-top:16px">Cor de destaque</div><div class="sw">${ACC.map((a) => `<button data-ac="${a[1]}" style="background:${a[1]}" aria-label="${a[0]}" aria-pressed="${S.accent === a[1]}"></button>`).join('')}<input type="color" id="cc" value="${S.accent}" aria-label="Cor personalizada" style="width:44px;height:34px;padding:2px"></div></div></section>
<section class="card wide"><div class="ch">Conta</div><div class="cb"><label>Nome<input id="nm" value="${esc(S.name)}" maxlength="30"></label>
<div style="display:flex;gap:10px;margin-top:14px"><button class="btn" id="rst" style="flex:1">Apagar todos os dados</button></div></div></section>`;
}
