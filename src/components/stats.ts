/* ==========================================================================
   stats.ts — Painel Analítico: Storyline Financeiro, Abas Dinâmicas de Gráficos,
              Fluxo de Caixa, Ranking de Categorias, Cartões, Burn Rate e Fixos
   ========================================================================== */

import { S, getPendingReimbursements } from '../state';
import { getCategoryIcon } from '../types/finance';
import { brl, esc } from '../utils/currency';
import { cur, dfmt, prevM, ym } from '../utils/date';

export type StatsChartTab =
  | 'cashflow'
  | 'category'
  | 'cards'
  | 'burn_rate'
  | 'fixed_streaming';

export let statsChartTab: StatsChartTab = 'cashflow';

export const setStatsChartTab = (t: StatsChartTab): void => {
  statsChartTab = t;
};

export interface StatsFilters {
  period: 'cur' | 'prev' | 'sem' | 'year';
  source: string;
  category: string;
  tag: string;
}

export const statsFilters: StatsFilters = {
  period: 'sem',
  source: 'all',
  category: 'all',
  tag: 'all'
};

export function setStatsFilter<K extends keyof StatsFilters>(
  key: K,
  value: StatsFilters[K]
): void {
  statsFilters[key] = value;
}

const formatShortMonth = (monthYear: string): string => {
  const [y, m] = monthYear.split('-').map(Number);
  const d = new Date(y, (m || 1) - 1, 1);
  return d
    .toLocaleDateString('pt-BR', { month: 'short' })
    .replace('.', '')
    .replace(/^./, (c) => c.toUpperCase());
};

const getMonthsForPeriod = (period: StatsFilters['period']): string[] => {
  const count = period === 'cur' ? 1 : period === 'prev' ? 2 : period === 'sem' ? 6 : 12;
  const list: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    list.push(prevM(cur, i));
  }
  return list;
};

export function stats(): string {
  const months = getMonthsForPeriod(statsFilters.period);
  const monthSet = new Set(months);

  // Filtro de transações
  const filteredTxs = S.tx.filter((t) => {
    if (!monthSet.has(ym(t.d))) return false;
    if (statsFilters.category !== 'all' && t.c !== statsFilters.category) return false;
    if (statsFilters.tag !== 'all' && (!t.tags || !t.tags.includes(statsFilters.tag))) return false;
    if (statsFilters.source !== 'all') {
      if (t.accountId !== statsFilters.source && t.cardId !== statsFilters.source) return false;
    }
    return true;
  });

  const totalIncome = filteredTxs
    .filter((t) => t.type === 'in')
    .reduce((acc, t) => acc + t.v, 0);

  const totalPersonalExpense = filteredTxs
    .filter((t) => t.type === 'out' && !t.thirdParty?.isThirdParty)
    .reduce((acc, t) => acc + t.v, 0);

  const netSavings = totalIncome - totalPersonalExpense;
  const savingsPct =
    totalIncome > 0 ? Math.round((netSavings / totalIncome) * 100) : 0;

  const pendingReimbursements = getPendingReimbursements();
  const totalPendingThirdParty = pendingReimbursements.reduce((acc, t) => acc + t.v, 0);

  const outTxs = filteredTxs.filter((t) => t.type === 'out' && !t.thirdParty?.isThirdParty);

  // --------------------------------------------------------------------------
  // Categorias e Compromissos
  // --------------------------------------------------------------------------
  let subCents = 0;
  let fixedCents = 0;
  let variableCents = 0;
  const subscriptionItems: typeof outTxs = [];

  const outByCat: Record<string, number> = {};
  for (const t of outTxs) {
    outByCat[t.c] = (outByCat[t.c] || 0) + t.v;

    const isSub =
      Boolean(t.subscriptionMeta) ||
      Boolean(t.recurring) ||
      t.c.includes('Streaming') ||
      Boolean(t.tags && (t.tags.includes('streaming') || t.tags.includes('recorrente')));

    const isFixed =
      Boolean(t.tags && t.tags.includes('essencial')) ||
      t.c.includes('Moradia') ||
      t.c.includes('Educação') ||
      t.c.includes('Saúde');

    if (isSub) {
      subCents += t.v;
      subscriptionItems.push(t);
    } else if (isFixed) {
      fixedCents += t.v;
    } else {
      variableCents += t.v;
    }
  }

  const topCategories = Object.entries(outByCat)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const topCatName = topCategories[0]?.[0] || 'Geral';
  const topCatAmount = topCategories[0]?.[1] || 0;
  const topCatPct = totalPersonalExpense > 0 ? Math.round((topCatAmount / totalPersonalExpense) * 100) : 0;

  // --------------------------------------------------------------------------
  // Fontes de Pagamento
  // --------------------------------------------------------------------------
  const paymentSources: Record<string, { label: string; color: string; amount: number; isCredit: boolean }> = {};
  let creditTotalCents = 0;
  let debitTotalCents = 0;
  let pixMoneyTotalCents = 0;

  for (const t of outTxs) {
    let key = 'other';
    let label = 'Outro / Dinheiro';
    let color = '#9e9e9e';
    let isCredit = false;

    if (t.cardId) {
      const card = S.cards.find((c) => c.id === t.cardId);
      key = `card-${t.cardId}`;
      label = card ? `Cartão ${card.name}` : 'Cartão de Crédito';
      color = card?.color || '#8b5cf6';
      isCredit = true;
      creditTotalCents += t.v;
    } else if (t.accountId) {
      const acc = S.accounts.find((a) => a.id === t.accountId);
      key = `acc-${t.accountId}`;
      label = acc ? `Conta ${acc.name}` : 'Conta Bancária';
      color = acc?.color || '#00d26a';
      if (t.pay === 'pix' || t.pay === 'money') {
        pixMoneyTotalCents += t.v;
      } else {
        debitTotalCents += t.v;
      }
    } else {
      pixMoneyTotalCents += t.v;
    }

    if (!paymentSources[key]) {
      paymentSources[key] = { label, color, amount: 0, isCredit };
    }
    paymentSources[key].amount += t.v;
  }

  const sortedSources = Object.values(paymentSources).sort((a, b) => b.amount - a.amount);
  const topSourceName = sortedSources[0]?.label || 'Contas';
  const topSourcePct = totalPersonalExpense > 0 ? Math.round(((sortedSources[0]?.amount || 0) / totalPersonalExpense) * 100) : 0;

  // --------------------------------------------------------------------------
  // Ritmo e Projeção Diária
  // --------------------------------------------------------------------------
  const activeMonth = statsFilters.period === 'prev' ? prevM(cur, 1) : cur;
  const [actY, actM] = activeMonth.split('-').map(Number);
  const daysInActMonth = new Date(actY, actM, 0).getDate();
  const todayDate = new Date();
  const currentDayLimit =
    activeMonth === cur
      ? Math.max(1, Math.min(todayDate.getDate(), daysInActMonth))
      : daysInActMonth;

  const dailyAmounts: number[] = new Array(daysInActMonth + 1).fill(0);
  for (const t of outTxs) {
    if (ym(t.d) === activeMonth) {
      const day = Number(t.d.split('-')[2]);
      if (day >= 1 && day <= daysInActMonth) {
        dailyAmounts[day] += t.v;
      }
    }
  }

  let runningCumulative = 0;
  let zeroSpendDaysCount = 0;
  const cumulativeDays: Array<{ day: number; cumulative: number }> = [];

  for (let d = 1; d <= currentDayLimit; d++) {
    runningCumulative += dailyAmounts[d];
    if (dailyAmounts[d] === 0) zeroSpendDaysCount++;
    cumulativeDays.push({ day: d, cumulative: runningCumulative });
  }

  const actMonthTotalSpent = runningCumulative;
  const dailyAverageCents = currentDayLimit > 0 ? Math.round(actMonthTotalSpent / currentDayLimit) : 0;

  // Comparação com mês anterior
  const prevMonthYm = prevM(activeMonth, 1);
  const prevMonthExpense = S.tx
    .filter((t) => t.type === 'out' && !t.thirdParty?.isThirdParty && ym(t.d) === prevMonthYm)
    .reduce((acc, t) => acc + t.v, 0);

  const prevMonthDailyAvg = Math.round(prevMonthExpense / 30);
  const paceDiffPct =
    prevMonthDailyAvg > 0
      ? Math.round(((dailyAverageCents - prevMonthDailyAvg) / prevMonthDailyAvg) * 100)
      : 0;

  // --------------------------------------------------------------------------
  // STORYLINE DO PERÍODO (Insights Narrativos Conectados)
  // --------------------------------------------------------------------------
  const storylineHtml = `
    <section class="card wide storyline-card" style="padding:1rem;background:linear-gradient(135deg, var(--card) 0%, rgba(139,92,246,0.06) 100%);border:1px solid var(--bd)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem">
        <b style="font-size:.95rem">✨ Storyline do Período</b>
        <span class="pill" style="font-size:.7rem">${statsFilters.period === 'cur' ? 'Este Mês' : statsFilters.period === 'prev' ? 'Mês Anterior' : statsFilters.period === 'sem' ? 'Último Semestre' : 'Último Ano'}</span>
      </div>

      <div class="storyline-steps" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:.75rem">
        <div class="storyline-step" style="padding:.65rem;border-radius:8px;background:var(--bg);border:1px solid var(--bd)">
          <div style="font-size:.75rem;font-weight:600;margin-bottom:3px" class="pos">1. Entrada & Fôlego</div>
          <div style="font-size:.82rem;line-height:1.4">
            Entraram <b>${brl(totalIncome)}</b>. Sobrou líquido <b>${brl(netSavings)}</b> (${savingsPct >= 0 ? `${savingsPct}% da renda` : 'déficit'}).
          </div>
        </div>

        <div class="storyline-step" style="padding:.65rem;border-radius:8px;background:var(--bg);border:1px solid var(--bd)">
          <div style="font-size:.75rem;font-weight:600;margin-bottom:3px" class="neg">2. Onde Mais Pesou</div>
          <div style="font-size:.82rem;line-height:1.4">
            <b>${esc(topCatName)}</b> concentrou <b>${topCatPct}%</b> dos gastos. Maior meio: <b>${esc(topSourceName)}</b> (${topSourcePct}%).
          </div>
        </div>

        <div class="storyline-step" style="padding:.65rem;border-radius:8px;background:var(--bg);border:1px solid var(--bd)">
          <div style="font-size:.75rem;font-weight:600;margin-bottom:3px" style="color:var(--ac)">3. Fixos & Assinaturas</div>
          <div style="font-size:.82rem;line-height:1.4">
            <b>${brl(fixedCents + subCents)}</b> já nasceram comprometidos (${totalPersonalExpense > 0 ? Math.round(((fixedCents + subCents) / totalPersonalExpense) * 100) : 0}%). Livres: <b>${brl(variableCents)}</b>.
          </div>
        </div>

        <div class="storyline-step" style="padding:.65rem;border-radius:8px;background:var(--bg);border:1px solid var(--bd)">
          <div style="font-size:.75rem;font-weight:600;margin-bottom:3px" class="mut">4. Ritmo & Projeção</div>
          <div style="font-size:.82rem;line-height:1.4">
            Média de <b>${brl(dailyAverageCents)}/dia</b> com <b>${zeroSpendDaysCount}</b> dias sem gastar. ${paceDiffPct > 0 ? `Ritmo <b>+${paceDiffPct}%</b> vs mês anterior.` : paceDiffPct < 0 ? `Ritmo <b>${paceDiffPct}%</b> vs mês anterior.` : 'Ritmo estável.'}
          </div>
        </div>
      </div>
    </section>
  `;

  // --------------------------------------------------------------------------
  // ABA 1: FLUXO DE CAIXA MENSAL COMPARATIVO
  // --------------------------------------------------------------------------
  const monthlyStats = months.map((m) => {
    const mIn = filteredTxs
      .filter((t) => ym(t.d) === m && t.type === 'in')
      .reduce((acc, t) => acc + t.v, 0);
    const mOut = filteredTxs
      .filter((t) => ym(t.d) === m && t.type === 'out' && !t.thirdParty?.isThirdParty)
      .reduce((acc, t) => acc + t.v, 0);
    return {
      monthYear: m,
      label: formatShortMonth(m),
      income: mIn,
      expense: mOut,
      net: mIn - mOut
    };
  });

  const maxValG1 = Math.max(1, ...monthlyStats.map((ms) => Math.max(ms.income, ms.expense)));
  const g1W = 540;
  const g1H = 200;
  const g1BaseY = 150;
  const g1MaxBarH = 110;
  const g1ColW = g1W / monthlyStats.length;

  const g1Bars = monthlyStats
    .map((ms, idx) => {
      const cx = idx * g1ColW + g1ColW / 2;
      const inH = Math.max(2, Math.round((ms.income / maxValG1) * g1MaxBarH));
      const outH = Math.max(2, Math.round((ms.expense / maxValG1) * g1MaxBarH));
      const inY = g1BaseY - inH;
      const outY = g1BaseY - outH;
      const barW = Math.min(20, Math.max(8, g1ColW * 0.28));

      return `<g class="chart-group">
        <rect x="${(cx - barW - 2).toFixed(1)}" y="${inY}" width="${barW}" height="${inH}" rx="3" fill="var(--pos)" opacity="0.85">
          <title>${esc(ms.label)} - Receitas: ${brl(ms.income)}</title>
        </rect>
        <rect x="${(cx + 2).toFixed(1)}" y="${outY}" width="${barW}" height="${outH}" rx="3" fill="var(--neg)" opacity="0.85">
          <title>${esc(ms.label)} - Despesas: ${brl(ms.expense)}</title>
        </rect>
        <text x="${cx.toFixed(1)}" y="174" text-anchor="middle" fill="var(--mut)" font-size="11" font-weight="600">${esc(ms.label)}</text>
      </g>`;
    })
    .join('');

  const netMin = Math.min(0, ...monthlyStats.map((ms) => ms.net));
  const netMax = Math.max(1, ...monthlyStats.map((ms) => ms.net));
  const netRange = Math.max(1, netMax - netMin);

  const g1LinePoints = monthlyStats
    .map((ms, idx) => {
      const cx = idx * g1ColW + g1ColW / 2;
      const normY = g1BaseY - Math.round(((ms.net - netMin) / netRange) * (g1MaxBarH * 0.7));
      return `${cx.toFixed(1)},${normY}`;
    })
    .join(' ');

  const g1LineDots = monthlyStats
    .map((ms, idx) => {
      const cx = idx * g1ColW + g1ColW / 2;
      const normY = g1BaseY - Math.round(((ms.net - netMin) / netRange) * (g1MaxBarH * 0.7));
      const dotColor = ms.net >= 0 ? 'var(--ac)' : 'var(--neg)';
      return `<circle cx="${cx.toFixed(1)}" cy="${normY}" r="4" fill="${dotColor}" stroke="var(--card)" stroke-width="2">
        <title>${esc(ms.label)} - Saldo Líquido: ${brl(ms.net)}</title>
      </circle>`;
    })
    .join('');

  const cashflowTabContent = `
    <section class="card wide">
      <div class="ch">
        <span>Fluxo de Caixa Mensal Comparativo</span>
        <span class="chart-legend"><span class="pos">● Receitas</span> <span class="neg">● Despesas</span> <span style="color:var(--ac)">━ Poupança</span></span>
      </div>
      <div class="cb">
        <div class="kpi-grid" style="margin-bottom:1rem">
          <div class="kpi-box"><span class="mut">Total Receitas</span><b class="num pos">${brl(totalIncome)}</b></div>
          <div class="kpi-box"><span class="mut">Gastos Pessoais</span><b class="num neg">${brl(totalPersonalExpense)}</b></div>
          <div class="kpi-box"><span class="mut">Poupança Líquida</span><b class="num ${netSavings >= 0 ? 'pos' : 'neg'}">${brl(netSavings)}</b></div>
          <div class="kpi-box"><span class="mut">Taxa de Poupança</span><b class="num ${savingsPct >= 0 ? 'pos' : 'neg'}">${savingsPct}%</b></div>
        </div>

        <svg class="stats-svg" viewBox="0 0 ${g1W} ${g1H}" role="img" aria-label="Fluxo de Caixa Mensal Comparativo" style="width:100%;max-height:220px;display:block">
          <line x1="16" y1="${g1BaseY}" x2="${g1W - 16}" y2="${g1BaseY}" stroke="var(--bd)" stroke-width="1" />
          ${g1Bars}
          <polyline fill="none" stroke="var(--ac)" stroke-width="2.5" stroke-linecap="round" points="${g1LinePoints}" />
          ${g1LineDots}
        </svg>
      </div>
    </section>
  `;

  // --------------------------------------------------------------------------
  // ABA 2: POR CATEGORIA (RANKING + DONUT/BARRAS)
  // --------------------------------------------------------------------------
  const topCategoriesHtml = topCategories.length
    ? topCategories
        .map(([catName, amount], idx) => {
          const share = totalPersonalExpense > 0 ? (amount / totalPersonalExpense) * 100 : 0;
          const icon = getCategoryIcon(S.cats, 'out', catName);
          return `<div class="rank-item">
            <div class="rank-head">
              <span class="cat-info">
                <span class="rank-pos">${idx + 1}º</span>
                <span class="cat-ico" aria-hidden="true">${esc(icon)}</span>
                <b>${esc(catName)}</b>
              </span>
              <span class="num"><b>${brl(amount)}</b> <small class="mut">(${share.toFixed(0)}%)</small></span>
            </div>
            <div class="prog-track"><div class="prog-fill" style="width:${share.toFixed(0)}%"></div></div>
          </div>`;
        })
        .join('')
    : `<div class="empty">Nenhuma despesa para o filtro selecionado.</div>`;

  const categoryTabContent = `
    <section class="card wide">
      <div class="ch">
        <span>Ranking Detalhado de Categorias</span>
        <span class="pill">${topCategories.length} categorias</span>
      </div>
      <div class="cb">
        <div class="rank-list">${topCategoriesHtml}</div>
      </div>
    </section>
  `;

  // --------------------------------------------------------------------------
  // ABA 3: POR CARTÃO & PAGAMENTO
  // --------------------------------------------------------------------------
  const totalSourceExpense = sortedSources.reduce((acc, s) => acc + s.amount, 0);
  let curX = 0;
  const barSvgSegments: string[] = [];
  const legendItems: string[] = [];

  for (const s of sortedSources) {
    const pct = totalSourceExpense > 0 ? (s.amount / totalSourceExpense) * 100 : 0;
    const segW = (pct * 500) / 100;
    if (segW > 0) {
      barSvgSegments.push(
        `<rect x="${curX.toFixed(1)}" y="4" width="${segW.toFixed(1)}" height="28" fill="${esc(s.color)}" opacity="0.9">
          <title>${esc(s.label)}: ${brl(s.amount)} (${pct.toFixed(1)}%)</title>
        </rect>`
      );
      curX += segW;
    }
    legendItems.push(
      `<div class="stats-source-legend-item">
        <span class="source-dot" style="background:${esc(s.color)}"></span>
        <span class="source-label">${esc(s.label)}</span>
        <b class="num">${brl(s.amount)}</b>
        <small class="mut">(${pct.toFixed(0)}%)</small>
      </div>`
    );
  }

  const cardsTabContent = `
    <section class="card wide">
      <div class="ch">
        <span>Distribuição por Cartão & Conta Bancária</span>
        <span class="pill">${brl(totalSourceExpense)}</span>
      </div>
      <div class="cb">
        <div class="kpi-grid" style="margin-bottom:1rem">
          <div class="kpi-box"><span class="mut">Cartões de Crédito</span><b class="num">${brl(creditTotalCents)}</b></div>
          <div class="kpi-box"><span class="mut">Débito em Conta</span><b class="num">${brl(debitTotalCents)}</b></div>
          <div class="kpi-box"><span class="mut">Pix / Dinheiro</span><b class="num">${brl(pixMoneyTotalCents)}</b></div>
        </div>

        <svg viewBox="0 0 500 36" style="width:100%;border-radius:6px;overflow:hidden;background:var(--mut);background-opacity:0.1;margin-bottom:.75rem">
          ${barSvgSegments.join('')}
        </svg>

        <div class="stats-source-legend" style="display:flex;flex-wrap:wrap;gap:.75rem;margin-top:.5rem">
          ${legendItems.join('')}
        </div>
      </div>
    </section>
  `;

  // --------------------------------------------------------------------------
  // ABA 4: RITMO DIÁRIO (BURN RATE)
  // --------------------------------------------------------------------------
  const totalBudgetLimits = Object.values(S.budgets).reduce((acc, b) => acc + (b.limitCents || 0), 0);
  const expectedMonthlyBudget = totalBudgetLimits > 0 ? totalBudgetLimits : actMonthTotalSpent * 1.2 || 100000;
  const maxBurnVal = Math.max(expectedMonthlyBudget, actMonthTotalSpent, 1);

  const burnW = 500;
  const burnH = 160;
  const burnPadL = 30;
  const burnPadR = 20;
  const burnPadT = 20;
  const burnPadB = 30;
  const burnPlotW = burnW - burnPadL - burnPadR;
  const burnPlotH = burnH - burnPadT - burnPadB;

  const getBurnX = (day: number) => burnPadL + ((day - 1) / (daysInActMonth - 1)) * burnPlotW;
  const getBurnY = (val: number) => burnPadT + burnPlotH - (val / maxBurnVal) * burnPlotH;

  const expectedLineSvg = `<line x1="${getBurnX(1).toFixed(1)}" y1="${getBurnY(0).toFixed(1)}" x2="${getBurnX(daysInActMonth).toFixed(1)}" y2="${getBurnY(expectedMonthlyBudget).toFixed(1)}" stroke="var(--mut)" stroke-dasharray="4,4" stroke-width="1.5" opacity="0.6"><title>Ritmo de Gasto Orçado / Médio</title></line>`;

  const realPoints = cumulativeDays
    .map((cd) => `${getBurnX(cd.day).toFixed(1)},${getBurnY(cd.cumulative).toFixed(1)}`)
    .join(' ');

  const burnPointsDots = cumulativeDays
    .filter((cd) => cd.day === 1 || cd.day === currentDayLimit || cd.day % 5 === 0)
    .map(
      (cd) =>
        `<circle cx="${getBurnX(cd.day).toFixed(1)}" cy="${getBurnY(cd.cumulative).toFixed(1)}" r="3.5" fill="var(--neg)" stroke="var(--card)" stroke-width="1.5"><title>Dia ${cd.day}: ${brl(cd.cumulative)} acumulados</title></circle>`
    )
    .join('');

  const burnRateTabContent = `
    <section class="card wide">
      <div class="ch">
        <span>Curva de Burn Rate Diário (${formatShortMonth(activeMonth)})</span>
        <span class="mut" style="font-size:.78rem">Gasto acumulado</span>
      </div>
      <div class="cb">
        <div class="kpi-grid" style="margin-bottom:1rem">
          <div class="kpi-box"><span class="mut">Total Acumulado</span><b class="num neg">${brl(actMonthTotalSpent)}</b></div>
          <div class="kpi-box"><span class="mut">Média Diária</span><b class="num">${brl(dailyAverageCents)} / dia</b></div>
          <div class="kpi-box"><span class="mut">Dias Sem Gastar</span><b class="num pos">${zeroSpendDaysCount} dias</b></div>
          <div class="kpi-box"><span class="mut">Orçamento Base</span><b class="num">${brl(expectedMonthlyBudget)}</b></div>
        </div>

        <svg viewBox="0 0 ${burnW} ${burnH}" style="width:100%;max-height:200px;display:block">
          <line x1="${burnPadL}" y1="${burnPadT + burnPlotH}" x2="${burnW - burnPadR}" y2="${burnPadT + burnPlotH}" stroke="var(--bd)" stroke-width="1" />
          ${expectedLineSvg}
          <polyline fill="none" stroke="var(--neg)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="${realPoints}" />
          ${burnPointsDots}
        </svg>
      </div>
    </section>
  `;

  // --------------------------------------------------------------------------
  // ABA 5: FIXOS & STREAMING + VALORES A COBRAR
  // --------------------------------------------------------------------------
  const totalCommitments = subCents + fixedCents + variableCents;
  const subPct = totalCommitments > 0 ? (subCents / totalCommitments) * 100 : 0;
  const fixedPct = totalCommitments > 0 ? (fixedCents / totalCommitments) * 100 : 0;
  const varPct = totalCommitments > 0 ? (variableCents / totalCommitments) * 100 : 0;

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
                `<div class="tp-tx-row">
                  <span><b>${esc(t.n)}</b> <small class="mut">(${dfmt(t.d)})</small></span>
                  <span class="tp-tx-right">
                    <b class="num">${brl(t.v)}</b>
                    <button type="button" class="pill-sub tp-badge tp-pending" data-toggle-tp="${esc(t.id)}" aria-label="Marcar ${esc(t.n)} como pago">Marcar pago</button>
                  </span>
                </div>`
            )
            .join('');
          return `<div class="debtor-card">
            <div class="debtor-head">
              <span>👤 <b>${esc(person)}</b> <small class="mut">(${group.items.length} ${group.items.length === 1 ? 'item' : 'itens'})</small></span>
              <b class="num pos">${brl(group.totalCents)}</b>
            </div>
            <div class="debtor-items">${itemsList}</div>
          </div>`;
        })
        .join('')
    : `<div class="empty">Nenhum valor pendente a cobrar no momento.</div>`;

  const fixedStreamingTabContent = `
    <section class="card wide">
      <div class="ch"><span>Fatiador de Compromissos Fixos & Streaming</span></div>
      <div class="cb">
        <div style="margin-bottom:1rem">
          <div style="display:flex;justify-content:space-between;font-size:.78rem;margin-bottom:6px" class="mut">
            <span>Fixos/Essenciais (${fixedPct.toFixed(0)}%)</span>
            <span>Assinaturas (${subPct.toFixed(0)}%)</span>
            <span>Variáveis (${varPct.toFixed(0)}%)</span>
          </div>
          <div style="display:flex;height:14px;border-radius:6px;overflow:hidden;background:var(--bd)">
            <div style="width:${fixedPct.toFixed(1)}%;background:#3b82f6" title="Fixos/Essenciais: ${brl(fixedCents)}"></div>
            <div style="width:${subPct.toFixed(1)}%;background:#8b5cf6" title="Assinaturas: ${brl(subCents)}"></div>
            <div style="width:${varPct.toFixed(1)}%;background:#f59e0b" title="Variáveis: ${brl(variableCents)}"></div>
          </div>
        </div>

        <div class="kpi-grid" style="margin-bottom:1rem">
          <div class="kpi-box"><span class="mut">Compromissos Fixos</span><b class="num">${brl(fixedCents)}</b></div>
          <div class="kpi-box"><span class="mut">Assinaturas/Streaming</span><b class="num">${brl(subCents)}</b></div>
          <div class="kpi-box"><span class="mut">Gastos Livres/Variáveis</span><b class="num">${brl(variableCents)}</b></div>
        </div>
      </div>
    </section>

    <section class="card wide">
      <div class="ch">
        <span>Valores a Cobrar / Cartão Emprestado</span>
        <span class="pill">${brl(totalPendingThirdParty)}</span>
      </div>
      <div class="cb">
        <div class="debtor-list">${debtorsHtml}</div>
      </div>
    </section>
  `;

  // --------------------------------------------------------------------------
  // Opções para filtros
  // --------------------------------------------------------------------------
  const sourceOptions = [
    `<option value="all" ${statsFilters.source === 'all' ? 'selected' : ''}>Todas as Contas e Cartões</option>`,
    ...S.accounts.map(
      (a) => `<option value="${esc(a.id)}" ${statsFilters.source === a.id ? 'selected' : ''}>Conta: ${esc(a.name)}</option>`
    ),
    ...S.cards.map(
      (c) => `<option value="${esc(c.id)}" ${statsFilters.source === c.id ? 'selected' : ''}>Cartão: ${esc(c.name)}</option>`
    )
  ].join('');

  const categoryOptions = [
    `<option value="all" ${statsFilters.category === 'all' ? 'selected' : ''}>Todas as Categorias</option>`,
    ...S.cats.out.map(
      (cat) => `<option value="${esc(cat.name)}" ${statsFilters.category === cat.name ? 'selected' : ''}>${esc(cat.name)}</option>`
    )
  ].join('');

  const tagOptions = [
    `<option value="all" ${statsFilters.tag === 'all' ? 'selected' : ''}>Todas as Tags</option>`,
    ...S.customTags.map(
      (tag) => `<option value="${esc(tag)}" ${statsFilters.tag === tag ? 'selected' : ''}>#${esc(tag)}</option>`
    )
  ].join('');

  let activeTabHtml = cashflowTabContent;
  if (statsChartTab === 'category') activeTabHtml = categoryTabContent;
  else if (statsChartTab === 'cards') activeTabHtml = cardsTabContent;
  else if (statsChartTab === 'burn_rate') activeTabHtml = burnRateTabContent;
  else if (statsChartTab === 'fixed_streaming') activeTabHtml = fixedStreamingTabContent;

  return `
    <header class="wide">
      <h1>
        <b>Estatísticas & Análises</b>
        <div class="mut" style="font-size:.8rem;font-weight:500">Storyline narrativo e inteligência financeira</div>
      </h1>
    </header>

    <!-- STORYLINE FINANCEIRO DO PERÍODO -->
    ${storylineHtml}

    <!-- BARRA DE FILTROS ANALÍTICOS -->
    <section class="card wide" style="padding:.75rem;margin-top:14px">
      <div class="stats-filters-bar" style="display:flex;flex-wrap:wrap;gap:.5rem;align-items:center">
        <div style="flex:1;min-width:140px">
          <label class="mut" style="font-size:.7rem;display:block;margin-bottom:2px">Período</label>
          <select class="input-select" data-stats-filter="period" style="width:100%;font-size:.85rem;padding:6px">
            <option value="cur" ${statsFilters.period === 'cur' ? 'selected' : ''}>Este Mês</option>
            <option value="prev" ${statsFilters.period === 'prev' ? 'selected' : ''}>Mês Anterior</option>
            <option value="sem" ${statsFilters.period === 'sem' ? 'selected' : ''}>Últimos 6 Meses</option>
            <option value="year" ${statsFilters.period === 'year' ? 'selected' : ''}>Últimos 12 Meses</option>
          </select>
        </div>
        <div style="flex:1;min-width:160px">
          <label class="mut" style="font-size:.7rem;display:block;margin-bottom:2px">Fonte / Conta / Cartão</label>
          <select class="input-select" data-stats-filter="source" style="width:100%;font-size:.85rem;padding:6px">
            ${sourceOptions}
          </select>
        </div>
        <div style="flex:1;min-width:150px">
          <label class="mut" style="font-size:.7rem;display:block;margin-bottom:2px">Categoria</label>
          <select class="input-select" data-stats-filter="category" style="width:100%;font-size:.85rem;padding:6px">
            ${categoryOptions}
          </select>
        </div>
        <div style="flex:1;min-width:130px">
          <label class="mut" style="font-size:.7rem;display:block;margin-bottom:2px">Tag</label>
          <select class="input-select" data-stats-filter="tag" style="width:100%;font-size:.85rem;padding:6px">
            ${tagOptions}
          </select>
        </div>
      </div>
    </section>

    <!-- NAVEGAÇÃO DINÂMICA POR ABAS DE GRÁFICOS -->
    <div class="wide" style="margin-top:14px;overflow-x:auto">
      <div class="seg" style="display:inline-flex;min-width:100%">
        <button type="button" data-stats-tab="cashflow" aria-pressed="${statsChartTab === 'cashflow'}">📊 Fluxo de Caixa</button>
        <button type="button" data-stats-tab="category" aria-pressed="${statsChartTab === 'category'}">🏷 Por Categoria</button>
        <button type="button" data-stats-tab="cards" aria-pressed="${statsChartTab === 'cards'}">💳 Por Cartão & Conta</button>
        <button type="button" data-stats-tab="burn_rate" aria-pressed="${statsChartTab === 'burn_rate'}">📈 Ritmo Diário</button>
        <button type="button" data-stats-tab="fixed_streaming" aria-pressed="${statsChartTab === 'fixed_streaming'}">📺 Fixos & Streaming</button>
      </div>
    </div>

    <!-- CONTEÚDO DA ABA ATIVA -->
    ${activeTabHtml}
  `;
}
