/* ==========================================================================
   stats.ts — Painel Analítico: Resumo Semestral, Média Diária, Evolução SVG,
              Top 5 Categorias e Valores a Cobrar (Cartão Emprestado)
   ========================================================================== */

import { S, getPendingReimbursements, getSemesterHistory } from '../state';
import { getCategoryIcon } from '../types/finance';
import { brl, esc } from '../utils/currency';
import { cur, dfmt, now, prevM, ym } from '../utils/date';

const formatShortMonth = (monthYear: string): string => {
  const [y, m] = monthYear.split('-').map(Number);
  const d = new Date(y, (m || 1) - 1, 1);
  return d
    .toLocaleDateString('pt-BR', { month: 'short' })
    .replace('.', '')
    .replace(/^./, (c) => c.toUpperCase());
};

export function stats(): string {
  const history = getSemesterHistory(cur);
  const semesterMonths = new Set(history.map((h) => h.monthYear));

  // Card 1: Resumo do Semestre
  const semIncome = history.reduce((acc, h) => acc + h.totalIncomeCents, 0);
  const semPersonalExpense = history.reduce(
    (acc, h) => acc + h.totalPersonalExpenseCents,
    0
  );
  const semSaved = semIncome - semPersonalExpense;

  const pendingReimbursements = getPendingReimbursements();
  const totalPendingThirdParty = pendingReimbursements.reduce(
    (acc, t) => acc + t.v,
    0
  );

  // Card 2: Média Diária de Gastos do mês selecionado
  const selectedMonth = prevM(cur, S.per);
  const [selY, selM] = selectedMonth.split('-').map(Number);
  const daysInSelectedMonth = new Date(selY, selM, 0).getDate();
  const daysElapsed =
    selectedMonth === cur
      ? Math.max(1, Math.min(now.getDate(), daysInSelectedMonth))
      : daysInSelectedMonth;

  const selectedMonthSummary = history.find((h) => h.monthYear === selectedMonth);
  const selectedMonthPersonalSpent = selectedMonthSummary
    ? selectedMonthSummary.totalPersonalExpenseCents
    : S.tx
        .filter(
          (t) =>
            t.type === 'out' &&
            !t.thirdParty?.isThirdParty &&
            ym(t.d) === selectedMonth
        )
        .reduce((acc, t) => acc + t.v, 0);

  const dailyAverageCents = Math.round(selectedMonthPersonalSpent / daysElapsed);

  // Card 3: Gráfico SVG de Evolução (Últimos 6 meses)
  const maxVal = Math.max(
    1,
    ...history.map((h) => Math.max(h.totalIncomeCents, h.totalPersonalExpenseCents))
  );
  const chartW = 540;
  const chartH = 190;
  const baseLineY = 152;
  const maxBarH = 122;
  const colW = chartW / history.length;

  const barsAndLabelsSvg = history
    .map((h, idx) => {
      const cx = idx * colW + colW / 2;
      const incH = Math.round((h.totalIncomeCents / maxVal) * maxBarH);
      const expH = Math.round((h.totalPersonalExpenseCents / maxVal) * maxBarH);
      const incY = baseLineY - incH;
      const expY = baseLineY - expH;
      const label = formatShortMonth(h.monthYear);

      return `<g>
        <rect x="${(cx - 18).toFixed(1)}" y="${incY}" width="15" height="${Math.max(2, incH)}" rx="4" fill="var(--pos)" />
        <rect x="${(cx + 3).toFixed(1)}" y="${expY}" width="15" height="${Math.max(2, expH)}" rx="4" fill="var(--neg)" />
        <text x="${cx.toFixed(1)}" y="176" text-anchor="middle" fill="var(--mut)" font-size="11" font-weight="600">${esc(label)}</text>
      </g>`;
    })
    .join('');

  const trendPoints = history
    .map((h, idx) => {
      const cx = idx * colW + colW / 2;
      const expH = Math.round((h.totalPersonalExpenseCents / maxVal) * maxBarH);
      const y = baseLineY - expH;
      return `${cx.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  // Card 4: Ranking Top 5 Categorias mais caras do semestre
  const semOutByCat: Record<string, number> = {};
  for (const t of S.tx) {
    if (
      t.type === 'out' &&
      !t.thirdParty?.isThirdParty &&
      semesterMonths.has(ym(t.d)) &&
      (t.status === 'confirmed' || ym(t.d) <= cur)
    ) {
      semOutByCat[t.c] = (semOutByCat[t.c] || 0) + t.v;
    }
  }
  const top5Categories = Object.entries(semOutByCat)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const top5Html = top5Categories.length
    ? top5Categories
        .map(([catName, amount], idx) => {
          const share =
            semPersonalExpense > 0
              ? Math.min(100, (amount / semPersonalExpense) * 100)
              : 0;
          const icon = getCategoryIcon(S.cats, 'out', catName);
          return `<div class="rank-item"><div class="rank-head"><span class="cat-info"><span class="rank-pos">${idx + 1}º</span><span class="cat-ico" aria-hidden="true">${esc(icon)}</span><b>${esc(catName)}</b></span><span class="num"><b>${brl(amount)}</b> <small class="mut">(${share.toFixed(0)}%)</small></span></div><div class="prog-track"><div class="prog-fill" style="width:${share.toFixed(0)}%"></div></div></div>`;
        })
        .join('')
    : `<div class="empty">Nenhuma despesa pessoal registrada no semestre.</div>`;

  // Card 5: Valores a Cobrar / Cartão Emprestado
  const debtorsMap = new Map<string, { totalCents: number; items: typeof pendingReimbursements }>();
  for (const t of pendingReimbursements) {
    const person = t.thirdParty?.personName || 'Terceiro';
    const current = debtorsMap.get(person) || { totalCents: 0, items: [] };
    current.totalCents += t.v;
    current.items.push(t);
    debtorsMap.set(person, current);
  }

  const debtorsHtml = debtorsMap.size
    ? Array.from(debtorsMap.entries())
        .sort((a, b) => b[1].totalCents - a[1].totalCents)
        .map(([person, group]) => {
          const itemsList = group.items
            .map(
              (t) =>
                `<div class="tp-tx-row"><span><b>${esc(t.n)}</b> <small class="mut">(${dfmt(t.d)})</small></span><span class="tp-tx-right"><b class="num">${brl(t.v)}</b><button type="button" class="pill-sub tp-badge tp-pending" data-toggle-tp="${esc(t.id)}" aria-label="Marcar ${esc(t.n)} de ${esc(person)} como pago">Marcar pago</button></span></div>`
            )
            .join('');
          return `<div class="debtor-card"><div class="debtor-head"><span>👤 <b>${esc(person)}</b> <small class="mut">(${group.items.length} ${group.items.length === 1 ? 'item' : 'itens'})</small></span><b class="num pos">${brl(group.totalCents)}</b></div><div class="debtor-items">${itemsList}</div></div>`;
        })
        .join('')
    : `<div class="empty">Nenhum valor pendente a cobrar no momento.</div>`;

  const ch = (t: string, r = ''): string => `<div class="ch"><span>${t}</span>${r}</div>`;

  return `<header class="wide"><h1><b>Estatísticas</b><div class="mut" style="font-size:.8rem;font-weight:500">Visão consolidada dos últimos 6 meses</div></h1></header>
<section class="card wide">${ch('Resumo do Semestre')}<div class="cb"><div class="kpi-grid">
<div class="kpi-box"><span class="mut">Total Ganho</span><b class="num pos">${brl(semIncome)}</b></div>
<div class="kpi-box"><span class="mut">Gasto Pessoal</span><b class="num neg">${brl(semPersonalExpense)}</b></div>
<div class="kpi-box"><span class="mut">Economizado</span><b class="num ${semSaved >= 0 ? 'pos' : 'neg'}">${brl(semSaved)}</b></div>
<div class="kpi-box"><span class="mut">A Receber (Terceiros)</span><b class="num">${brl(totalPendingThirdParty)}</b></div>
</div></div></section>
<section class="card">${ch('Média Diária de Gastos', `<select id="per" aria-label="Período"><option value="0">Este mês</option><option value="1">Mês passado</option></select>`)}<div class="cb">
<div class="big num" style="font-size:1.9rem">${brl(dailyAverageCents)} <small>/ dia</small></div>
<div class="mut">Baseado em <b>${brl(selectedMonthPersonalSpent)}</b> de gastos pessoais em <b>${daysElapsed}</b> ${daysElapsed === 1 ? 'dia transcorrido' : 'dias Considerados'.toLowerCase()}.</div>
</div></section>
<section class="card">${ch('Top 5 Categorias do Semestre')}<div class="cb"><div class="rank-list">${top5Html}</div></div></section>
<section class="card wide">${ch('Evolução (Últimos 6 meses)', `<span class="chart-legend"><span class="pos">● Receitas</span><span class="neg">● Despesas Pessoais</span></span>`)}<div class="cb">
<svg class="stats-svg" viewBox="0 0 ${chartW} ${chartH}" role="img" aria-label="Gráfico de evolução de receitas e despesas pessoais nos últimos 6 meses">
  <line x1="16" y1="${baseLineY}" x2="${chartW - 16}" y2="${baseLineY}" stroke="var(--bd)" stroke-width="1" />
  <polyline fill="none" stroke="var(--ac)" stroke-opacity="0.45" stroke-width="2" points="${trendPoints}" />
  ${barsAndLabelsSvg}
</svg>
</div></section>
<section class="card wide">${ch('Valores a Cobrar / Cartão Emprestado', `<span class="pill">${brl(totalPendingThirdParty)}</span>`)}<div class="cb"><div class="debtor-list">${debtorsHtml}</div></div></section>`;
}
