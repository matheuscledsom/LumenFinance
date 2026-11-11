/* ==========================================================================
   calendar.ts — Agenda Financeira: Resumo Mensal, Faturas, Salário e Inspector Diário
   ========================================================================== */

import {
  S,
  getCalendarDays,
  getUpcomingBills,
  normalizePay,
  normalizeTags
} from '../state';
import { getCategoryIcon, getPaymentLabel } from '../types/finance';
import { brl, esc } from '../utils/currency';
import { dfmt, now, toIsoDate } from '../utils/date';

const WEEKDAYS: readonly string[] = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export type CalFilter = 'all' | 'out' | 'in' | 'cards' | 'pending';
export let calFilter: CalFilter = 'all';

export const setCalFilter = (f: CalFilter): void => {
  calFilter = f;
};

export let calYear: number = now.getFullYear();
export let calMonth: number = now.getMonth() + 1;
export let selectedDateStr: string = toIsoDate(now);

const compactBrl = (cents: number): string => {
  const val = Math.round(cents / 100);
  if (Math.abs(val) >= 1000) {
    return `${(val / 1000).toFixed(1).replace('.0', '')}k`;
  }
  return `${val}`;
};

/**
 * Avança ou retrocede o mês exibido no calendário em delta meses.
 */
export const stepCalMonth = (delta: number): void => {
  const next = new Date(calYear, calMonth - 1 + delta, 1, 12, 0, 0);
  calYear = next.getFullYear();
  calMonth = next.getMonth() + 1;

  const todayIso = toIsoDate(now);
  const targetYm = `${calYear}-${String(calMonth).padStart(2, '0')}`;
  selectedDateStr = todayIso.startsWith(targetYm) ? todayIso : `${targetYm}-01`;
};

/**
 * Posiciona o calendário de volta ao mês e dia atuais ("Hoje").
 */
export const goCalToday = (): void => {
  calYear = now.getFullYear();
  calMonth = now.getMonth() + 1;
  selectedDateStr = toIsoDate(now);
};

/**
 * Seleciona uma data específica na grade do calendário.
 */
export const selectCalDate = (dateStr: string): void => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return;
  selectedDateStr = dateStr;
  const [y, m] = dateStr.split('-').map(Number);
  if (y && m) {
    calYear = y;
    calMonth = m;
  }
};

export function calendar(): string {
  const days = getCalendarDays(calYear, calMonth);
  const upcoming = getUpcomingBills(7);

  const monthDate = new Date(calYear, calMonth - 1, 1, 12, 0, 0);
  const monthLabel = monthDate
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    .replace(/^./, (c) => c.toUpperCase());

  // Métricas do mês corrente
  const curMonthDays = days.filter((d) => d.isCurrentMonth);
  const totalIncomeMonth = curMonthDays.reduce((a, d) => a + d.totalIncomeCents, 0);
  const totalExpenseMonth = curMonthDays.reduce((a, d) => a + d.totalExpenseCents, 0);
  const noSpendCount = curMonthDays.filter((d) => d.isNoSpendDay).length;

  const alertsBannerHtml = upcoming.length
    ? `<section class="card wide cal-alerts">${upcoming
        .map((bill) => {
          const absDays = Math.abs(bill.daysUntilDue);
          const dueText = bill.isOverdue
            ? `venceu há ${absDays} ${absDays === 1 ? 'dia' : 'dias'}`
            : bill.daysUntilDue === 0
            ? 'vence hoje'
            : `vence em ${bill.daysUntilDue} ${bill.daysUntilDue === 1 ? 'dia' : 'dias'}`;
          return `<div class="cal-alert-row"><span>⚠️ <b>${esc(bill.tx.n)}</b> ${dueText} · <b class="num ${bill.isOverdue ? 'neg' : ''}">${brl(bill.tx.v)}</b></span><button type="button" class="btn p cal-pay-btn" data-confirm-tx="${esc(bill.tx.id)}" aria-label="Marcar ${esc(bill.tx.n)} como pago">✓ Pago</button></div>`;
        })
        .join('')}</section>`
    : '';

  const weekdayHeadersHtml = WEEKDAYS.map(
    (w) => `<div class="cal-weekday" aria-hidden="true">${w}</div>`
  ).join('');

  const gridCellsHtml = days
    .map((d) => {
      const isSelected = d.dateStr === selectedDateStr;
      const classes = [
        'cal-day',
        d.isCurrentMonth ? '' : 'cal-outside',
        d.isToday ? 'cal-today' : '',
        isSelected ? 'cal-selected' : '',
        d.isNoSpendDay ? 'cal-no-spend' : ''
      ]
        .filter(Boolean)
        .join(' ');

      // Badges de evento limpas
      const salaryBadge = d.isSalaryDay
        ? `<span class="cal-event-icon" title="💰 Dia de Salário">💰</span>`
        : '';

      const cardBadges = (d.cardEvents || [])
        .map((ev) => {
          if (ev.kind === 'closing') {
            return `<span class="cal-event-icon" title="🔒 Fecha fatura (${esc(ev.cardName)})">🔒</span>`;
          }
          if (ev.kind === 'best_day') {
            return `<span class="cal-event-icon" title="★ Melhor compra (${esc(ev.cardName)})">★</span>`;
          }
          return `<span class="cal-event-icon" title="💳 Vence fatura (${esc(ev.cardName)}: ${brl(ev.invoiceTotalCents)})">💳</span>`;
        })
        .join('');

      // Mini-Resumo dentro da célula conforme o calFilter
      let pillText = '';
      let pillClass = '';

      if (calFilter === 'out' && d.totalExpenseCents > 0) {
        pillText = `-${compactBrl(d.totalExpenseCents)}`;
        pillClass = 'neg';
      } else if (calFilter === 'in' && d.totalIncomeCents > 0) {
        pillText = `+${compactBrl(d.totalIncomeCents)}`;
        pillClass = 'pos';
      } else if (calFilter === 'pending' && d.hasPendingBills) {
        pillText = 'Pend.';
        pillClass = 'warning';
      } else if (calFilter === 'cards') {
        if (d.isSalaryDay) {
          pillText = 'Salário';
          pillClass = 'pos';
        } else if (d.cardEvents?.length) {
          pillText = d.cardEvents[0].kind === 'due' ? 'Fatura' : 'Cartão';
          pillClass = 'mut';
        }
      } else if (calFilter === 'all') {
        const net = d.totalIncomeCents - d.totalExpenseCents;
        if (d.totalIncomeCents > 0 || d.totalExpenseCents > 0) {
          pillText = net >= 0 ? `+${compactBrl(net)}` : `-${compactBrl(Math.abs(net))}`;
          pillClass = net >= 0 ? 'pos' : 'neg';
        }
      }

      const miniPillHtml = pillText
        ? `<span class="cal-mini-pill ${pillClass}">${pillText}</span>`
        : '';

      return `<button type="button" class="${classes}" data-cal-date="${d.dateStr}" aria-pressed="${isSelected}" aria-label="Dia ${d.dayNumber}">
        <span class="cal-day-top">
          <span class="cal-num">${d.dayNumber}</span>
          <span class="cal-top-badges">${salaryBadge}${cardBadges}</span>
        </span>
        <div style="margin-top:auto;text-align:center">${miniPillHtml}</div>
      </button>`;
    })
    .join('');

  const selectedDay =
    days.find((d) => d.dateStr === selectedDateStr) ||
    days.find((d) => d.isToday) ||
    days[0];

  const selectedFormatted = new Date(selectedDay.dateStr + 'T12:00:00').toLocaleDateString(
    'pt-BR',
    {
      weekday: 'long',
      day: '2-digit',
      month: 'long'
    }
  );

  const dayBalance = selectedDay.totalIncomeCents - selectedDay.totalExpenseCents;

  // Banners de eventos do dia (Salário e Cartões com botão de ação)
  let dayEventsBannerHtml = '';
  if (selectedDay.isSalaryDay) {
    dayEventsBannerHtml += `
      <div class="cal-day-event-banner salary" style="padding:8px 12px;border-radius:var(--r);background:rgba(34,197,94,0.12);border:1px solid var(--pos);margin-bottom:8px;font-size:.84rem">
        💰 <b>Dia de Recebimento de Salário</b> ${S.salaryRule.amountCents ? `· Previsto: <b>${brl(S.salaryRule.amountCents)}</b>` : ''}
      </div>`;
  }
  if (selectedDay.cardEvents && selectedDay.cardEvents.length > 0) {
    for (const ev of selectedDay.cardEvents) {
      if (ev.kind === 'closing') {
        dayEventsBannerHtml += `
          <div class="cal-day-event-banner card-close" style="padding:8px 12px;border-radius:var(--r);background:rgba(234,179,8,0.12);border:1px solid #eab308;margin-bottom:8px;font-size:.84rem">
            🔒 <b>Fechamento da Fatura · ${esc(ev.cardName)}</b> (Fatura: <b>${brl(ev.invoiceTotalCents)}</b>)
          </div>`;
      } else if (ev.kind === 'best_day') {
        dayEventsBannerHtml += `
          <div class="cal-day-event-banner card-best" style="padding:8px 12px;border-radius:var(--r);background:rgba(139,92,246,0.12);border:1px solid var(--ac);margin-bottom:8px;font-size:.84rem">
            ★ <b>Melhor Dia de Compra · ${esc(ev.cardName)}</b> (Até 40 dias para pagar)
          </div>`;
      } else if (ev.kind === 'due') {
        const ymPart = selectedDay.dateStr.slice(0, 7);
        dayEventsBannerHtml += `
          <div class="cal-day-event-banner card-due" style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-radius:var(--r);background:rgba(239,68,68,0.12);border:1px solid var(--neg);margin-bottom:8px;font-size:.84rem">
            <span>💳 <b>Vencimento da Fatura · ${esc(ev.cardName)}</b> (${brl(ev.invoiceTotalCents)})</span>
            <button type="button" class="btn btn-sm p" data-pay-invoice="${esc(ev.cardId)}" data-invoice-ym="${esc(ymPart)}" style="padding:3px 8px;font-size:.75rem">⚡ Pagar Fatura</button>
          </div>`;
      }
    }
  }

  // Transações do dia (filtradas se calFilter)
  const filteredDayTxs = selectedDay.transactions.filter((t) => {
    if (calFilter === 'out') return t.type === 'out';
    if (calFilter === 'in') return t.type === 'in';
    if (calFilter === 'pending') return t.status === 'pending';
    return true;
  });

  const dayTxHtml = filteredDayTxs.length
    ? filteredDayTxs
        .map((t) => {
          const icon = getCategoryIcon(S.cats, t.type, t.c);
          const payLabel = getPaymentLabel(normalizePay(t.pay));
          const tags = normalizeTags(t.tags);
          const tagsHtml = tags.map((tag) => `<span class="pill-tag">#${esc(tag)}</span>`).join('');
          const instBadge =
            t.installments && t.installments.total > 1
              ? `<span class="pill-sub">💳 ${t.installments.current}/${t.installments.total}</span>`
              : '';
          const recBadge = t.recurring ? `<span class="pill-sub">🔁 Fixa</span>` : '';
          const pendingBadge =
            t.status === 'pending'
              ? `<span class="pill-sub pending" data-confirm-tx="${esc(t.id)}" role="button" tabindex="0">⏳ Pendente</span>`
              : '';
          const tpBadge = t.thirdParty?.isThirdParty
            ? `<span class="pill-sub tp-badge ${t.thirdParty.isReimbursed ? 'pos' : 'tp-pending'}">👤 ${esc(t.thirdParty.personName)}</span>`
            : '';
          const subBadges = tpBadge + instBadge + recBadge + pendingBadge;
          const hasChips = Boolean(subBadges || tagsHtml);
          const payAndTags = `<span class="tx-meta"><span class="mut">${esc(payLabel)}${hasChips ? ' · ' : ''}</span>${subBadges}${tagsHtml}</span>`;
          return `<button class="tx ${t.type}${t.status === 'pending' ? ' pending-tx' : ''}" data-id="${esc(t.id)}" aria-label="Editar ${esc(t.n)}"><span class="av">${esc(icon)}</span><span class="m"><b>${esc(t.n)}</b><span class="mut">${esc(t.c)}</span>${payAndTags}</span><b class="num ${t.type === 'in' ? 'pos' : 'neg'}">${t.type === 'in' ? '+' : '−'} ${brl(t.v)}</b></button>`;
        })
        .join('')
    : `<div class="empty" style="padding:10px">Nenhum lançamento com o filtro atual neste dia.<br><button type="button" class="btn p btn-sm" data-add="out" data-default-date="${esc(selectedDay.dateStr)}" style="margin-top:6px">+ Registrar neste dia</button></div>`;

  return `
    <header class="wide">
      <h1>
        <b>Agenda & Calendário</b>
        <div class="mut" style="font-size:.8rem;font-weight:500">Fluxo diário, faturas de cartão e dia do salário</div>
      </h1>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <span class="pill pos" title="Total recebido no mês">↑ ${brl(totalIncomeMonth)}</span>
        <span class="pill neg" title="Total gasto no mês">↓ ${brl(totalExpenseMonth)}</span>
        <span class="pill" title="Dias sem nenhum gasto pessoal">✨ ${noSpendCount} dias zero</span>
      </div>
    </header>

    ${alertsBannerHtml}

    <section class="card wide">
      <div class="cal-header">
        <div class="cal-nav-group">
          <button type="button" class="ib" id="cal-prev" aria-label="Mês anterior">&lt;</button>
          <b class="cal-title">${esc(monthLabel)}</b>
          <button type="button" class="ib" id="cal-next" aria-label="Próximo mês">&gt;</button>
        </div>
        <button type="button" class="btn cal-today-btn" id="cal-today">Hoje</button>
      </div>

      <!-- CHIPS DE FILTRO DE VISUALIZAÇÃO -->
      <div class="cal-filter-bar" style="display:flex;gap:6px;overflow-x:auto;padding:6px 0;margin-bottom:8px">
        <button type="button" class="btn btn-sm ${calFilter === 'all' ? 'p' : ''}" data-cal-filter="all">Tudo</button>
        <button type="button" class="btn btn-sm ${calFilter === 'out' ? 'p' : ''}" data-cal-filter="out">Só Gastos</button>
        <button type="button" class="btn btn-sm ${calFilter === 'in' ? 'p' : ''}" data-cal-filter="in">Só Ganhos</button>
        <button type="button" class="btn btn-sm ${calFilter === 'cards' ? 'p' : ''}" data-cal-filter="cards">Faturas & Salário</button>
        <button type="button" class="btn btn-sm ${calFilter === 'pending' ? 'p' : ''}" data-cal-filter="pending">Pendentes</button>
      </div>

      <div class="cb" style="padding-top:4px">
        <div class="cal-grid" role="grid" aria-label="Calendário de ${esc(monthLabel)}">
          ${weekdayHeadersHtml}
          ${gridCellsHtml}
        </div>
      </div>
    </section>

    <!-- INSPECTOR DIÁRIO INTEGRADO -->
    <section class="card wide cal-inspector">
      <div class="ch" style="display:flex;justify-content:space-between;align-items:center">
        <span><b>${esc(selectedFormatted)}</b></span>
        <div style="display:flex;gap:8px;align-items:center">
          <span class="pill ${dayBalance >= 0 ? 'pos' : 'neg'}">Saldo do dia: ${dayBalance >= 0 ? '+' : ''}${brl(dayBalance)}</span>
          <button type="button" class="btn btn-sm p" data-add="out" data-default-date="${esc(selectedDay.dateStr)}">+ Lançar</button>
        </div>
      </div>
      <div class="cb">
        ${dayEventsBannerHtml}
        ${dayTxHtml}
      </div>
    </section>
  `;
}
