/* ==========================================================================
   home.ts — Tela Inicial: Saldo, Resumo de Gastos e Últimas Movimentações
   ========================================================================== */

import { S } from '../state';
import { brl, esc, sum } from '../utils/currency';
import { now, cur, ym, prevM, dfmt } from '../utils/date';

export function home(): string {
  const A = S.tx;
  const m = prevM(cur, S.per);
  const pm = prevM(cur, S.per + 1);

  const bal = sum(A);
  const prevBal = sum(A.filter((t) => ym(t.d) <= prevM(cur, 0) && ym(t.d) < cur));
  const chg = prevBal ? ((bal - prevBal) / Math.abs(prevBal)) * 100 : null;

  const mo = A.filter((t) => ym(t.d) === m);
  const out = mo.filter((t) => t.type === 'out');
  const inc = mo.filter((t) => t.type === 'in');

  const spent = out.reduce((a, t) => a + t.v, 0);
  const earned = inc.reduce((a, t) => a + t.v, 0);
  const pspent = A.filter((t) => t.type === 'out' && ym(t.d) === pm).reduce(
    (a, t) => a + t.v,
    0
  );

  const sv = pspent ? ((spent - pspent) / pspent) * 100 : null;
  const pct = earned ? Math.min(100, (spent / earned) * 100) : 0;

  const by: Record<string, number> = {};
  out.forEach((t) => {
    by[t.c] = (by[t.c] || 0) + t.v;
  });
  const rows: [string, number][] = Object.entries(by).sort((a, b) => b[1] - a[1]);
  const top: [string, number][] = rows.slice(0, 3);
  const rest = rows.slice(3).reduce((a, r) => a + r[1], 0);
  if (rest) top.push(['Outros', rest]);

  const R = 44;
  const C = 2 * Math.PI * R;
  let off = 0;
  const arcs = top
    .map((r, i) => {
      const f = r[1] / spent;
      const s = `<circle r="${R}" cx="60" cy="60" fill="none" stroke="var(--ac)" stroke-opacity="${1 - i * 0.22}" stroke-width="14" stroke-dasharray="${f * C} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 60 60)"/>`;
      off += f * C;
      return s;
    })
    .join('');

  const last = [...A]
    .reverse()
    .sort((a, b) => b.d.localeCompare(a.d))
    .slice(0, 6);
  const ch = (t: string, r = ''): string => `<div class="ch"><span>${t}</span>${r}</div>`;

  return `<header class="wide"><h1>Olá, <b>${esc(S.name)}</b><div class="mut" style="font-size:.8rem;font-weight:500">${now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</div></h1>
<div style="display:flex;gap:8px"><button class="ib" id="eye" aria-label="${S.hide ? 'Mostrar' : 'Ocultar'} valores" aria-pressed="${S.hide}">${S.hide ? '🙈' : '👁'}</button><button class="ib" data-v="profile" aria-label="Configurações">⚙</button></div></header>
<section class="card bal wide">${ch('Saldo total')}<div class="cb"><div class="big num">${brl(bal)}</div>
<span class="pill ${chg == null ? '' : chg >= 0 ? 'pos' : 'neg'}">${chg == null ? 'Sem mês anterior para comparar' : (chg >= 0 ? '↑ +' : '↓ ') + chg.toFixed(0) + '% vs. mês passado'}</span></div></section>
<div class="acts wide"><button class="btn" data-add="out">− Registrar gasto</button><button class="btn p" data-add="in">+ Registrar ganho</button></div>
<section class="card">${ch('Seus gastos', `<select id="per" aria-label="Período"><option value="0">Este mês</option><option value="1">Mês passado</option></select>`)}<div class="cb">
${
  spent
    ? `<div class="spend"><div><div class="big num" style="font-size:1.8rem">${brl(spent)}</div><div class="mut">Total de gastos</div>${sv == null ? '' : `<div class="${sv <= 0 ? 'pos' : 'neg'}" style="margin-top:8px;font-weight:700">${sv <= 0 ? '↓' : '↑'} ${Math.abs(sv).toFixed(0)}% <span class="mut">vs. mês anterior</span></div>`}</div>
<svg width="120" height="120" viewBox="0 0 120 120" role="img" aria-label="${pct.toFixed(0)}% da renda gasta"><circle r="${R}" cx="60" cy="60" fill="none" stroke="var(--bd)" stroke-width="14"/>${arcs}<text x="60" y="60" text-anchor="middle" fill="var(--tx)" font-weight="800" font-size="18">${earned ? pct.toFixed(0) + '%' : '—'}</text><text x="60" y="76" text-anchor="middle" fill="var(--mut)" font-size="10">da renda</text></svg></div>
<div class="leg">${top.map((r, i) => `<div><i class="dot" style="background:var(--ac);opacity:${1 - i * 0.22}"></i><span>${esc(r[0])}</span><span class="num">${brl(r[1])}</span><span class="mut num">${((r[1] / spent) * 100).toFixed(0)}%</span></div>`).join('')}</div>`
    : `<div class="empty">Nenhum gasto neste período.<br><button class="btn p" data-add="out">Registrar gasto</button></div>`
}</div></section>
<section class="card">${ch('Últimas movimentações')}<div class="cb">
${
  last.length
    ? last.map((t) => `<button class="tx ${t.type}" data-id="${esc(t.id)}" aria-label="Editar ${esc(t.n)}"><span class="av">${esc(t.c[0] || '?')}</span><span class="m"><b>${esc(t.n)}</b><span class="mut">${esc(t.c)} · ${dfmt(t.d)}</span></span><b class="num ${t.type === 'in' ? 'pos' : 'neg'}">${t.type === 'in' ? '+' : '−'} ${brl(t.v)}</b></button>`).join('') + '<div class="mut" style="margin-top:8px">Toque em uma movimentação para editá-la.</div>'
    : `<div class="empty">Suas movimentações aparecerão aqui.<br><button class="btn p" data-add="in">Registrar ganho</button></div>`
}</div></section>`;
}
