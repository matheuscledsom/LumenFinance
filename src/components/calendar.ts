/* ==========================================================================
   calendar.ts — Grade Mensal Interativa, Alertas de Contas a Vencer,
                 Dias de Gasto Zero e Inspeção Diária de Lançamentos
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

export let calYear: number = now.getFullYear();
export let calMonth: number = now.getMonth() + 1;
export let selectedDateStr: string = toIsoDate(now);

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

  const noSpendCount = days.filter((d) => d.isCurrentMonth && d.isNoSpendDay).length;

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

      const incDot =
        d.totalIncomeCents > 0
          ? `<i class="cal-dot pos-dot" title="Receitas: ${brl(d.totalIncomeCents)}"></i>`
          : '';
      const expDot =
        d.totalExpenseCents > 0
          ? `<i class="cal-dot neg-dot" title="Despesas: ${brl(d.totalExpenseCents)}"></i>`
          : '';
      const pendDot = d.hasPendingBills
        ? `<i class="cal-dot warn-dot" title="Conta pendente"></i>`
        : '';

      const noSpendBadge = d.isNoSpendDay
        ? `<span class="no-spend-badge" title="Dia de gasto zero" aria-label="Dia de gasto zero">✨</span>`
        : '';

      return `<button type="button" class="${classes}" data-cal-date="${d.dateStr}" aria-pressed="${isSelected}" aria-label="Dia ${d.dayNumber} (${d.dateStr})"><span class="cal-day-top"><span class="cal-num">${d.dayNumber}</span>${noSpendBadge}</span><span class="cal-dots">${incDot}${expDot}${pendDot}</span></button>`;
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

  const dayTxHtml = selectedDay.transactions.length
    ? selectedDay.transactions
        .map((t) => {
          const icon = getCategoryIcon(S.cats, t.type, t.c);
          const payLabel = getPaymentLabel(normalizePay(t.pay));
          const tags = normalizeTags(t.tags);
          const tagsHtml = tags
            .map((tag) => `<span class="pill-tag">#${esc(tag)}</span>`)
            .join('');
          const instBadge =
            t.installments && t.installments.total > 1
              ? `<span class="pill-sub">💳 ${t.installments.current}/${t.installments.total}</span>`
              : '';
          const recBadge = t.recurring ? `<span class="pill-sub">🔁 Fixa</span>` : '';
          const pendingBadge =
            t.status === 'pending'
              ? `<span class="pill-sub pending" data-confirm-tx="${esc(t.id)}" role="button" tabindex="0" aria-label="Confirmar pagamento de ${esc(t.n)}">⏳ Pendente · Quitar</span>`
              : '';
          const tpBadge = t.thirdParty?.isThirdParty
            ? `<span class="pill-sub tp-badge ${t.thirdParty.isReimbursed ? 'pos' : 'tp-pending'}" data-toggle-tp="${esc(t.id)}" role="button" tabindex="0">👤 ${esc(t.thirdParty.personName)} · ${t.thirdParty.isReimbursed ? '✓ Pago' : 'A Cobrar'}</span>`
            : '';
          const subBadges = tpBadge + instBadge + recBadge + pendingBadge;
          const hasChips = Boolean(subBadges || tagsHtml);
          const payAndTags = `<span class="tx-meta"><span class="mut">${esc(payLabel)}${hasChips ? ' · ' : ''}</span>${subBadges}${tagsHtml}</span>`;
          return `<button class="tx ${t.type}${t.status === 'pending' ? ' pending-tx' : ''}" data-id="${esc(t.id)}" aria-label="Editar ${esc(t.n)}"><span class="av">${esc(icon)}</span><span class="m"><b>${esc(t.n)}</b><span class="mut">${esc(t.c)} · ${dfmt(t.d)}</span>${payAndTags}</span><b class="num ${t.type === 'in' ? 'pos' : 'neg'}">${t.type === 'in' ? '+' : '−'} ${brl(t.v)}</b></button>`;
        })
        .join('')
    : `<div class="empty">Nenhum lançamento neste dia.<br><button type="button" class="btn p" data-add="out">Registrar movimentação</button></div>`;

  return `<header class="wide"><h1><b>Calendário</b><div class="mut" style="font-size:.8rem;font-weight:500">Vencimentos, fluxo diário e dias de gasto zero</div></h1><span class="pill">✨ ${noSpendCount} ${noSpendCount === 1 ? 'dia' : 'dias'} de gasto zero</span></header>
${alertsBannerHtml}
<section class="card wide"><div class="cal-header"><div class="cal-nav-group"><button type="button" class="ib" id="cal-prev" aria-label="Mês anterior">&lt;</button><b class="cal-title">${esc(monthLabel)}</b><button type="button" class="ib" id="cal-next" aria-label="Próximo mês">&gt;</button></div><button type="button" class="btn cal-today-btn" id="cal-today">Hoje</button></div>
<div class="cb"><div class="cal-grid" role="grid" aria-label="Calendário de ${esc(monthLabel)}">${weekdayHeadersHtml}${gridCellsHtml}</div>
<div class="cal-legend mut"><span><i class="cal-dot pos-dot"></i> Ganho</span><span><i class="cal-dot neg-dot"></i> Gasto</span><span><i class="cal-dot warn-dot"></i> Conta pendente</span><span>✨ Gasto zero</span></div>
</div></section>
<section class="card wide"><div class="ch"><span>${esc(selectedFormatted)}</span>${selectedDay.isNoSpendDay ? '<span class="pill pos">✨ Dia de Gasto Zero</span>' : ''}</div><div class="cb">${dayTxHtml}</div></section>`;
}
