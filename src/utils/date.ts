/* ==========================================================================
   date.ts — Manipulação, Matrizes de Calendário e Formatação de Datas ISO
   ========================================================================== */

export const now: Date = new Date();
export const cur: string = now.toISOString().slice(0, 7);

/**
 * Converte um objeto Date para string ISO 'YYYY-MM-DD' no fuso local.
 */
export const toIsoDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;

/**
 * Extrai o ano-mês (YYYY-MM) de uma string de data ISO.
 */
export const ym = (d: string): string => d.slice(0, 7);

/**
 * Retorna o ano-mês (YYYY-MM) retrocedendo n meses a partir de m.
 */
export const prevM = (m: string, n: number): string => {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 1 - n, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
};

/**
 * Adiciona monthsToAdd meses a uma data ISO (YYYY-MM-DD), ajustando para o último dia
 * do mês caso o mês subsequente seja mais curto (ex.: 31/01 -> 28/02).
 */
export const addMonthsClamped = (dateIso: string, monthsToAdd: number): string => {
  const parts = dateIso.split('-').map(Number);
  const y = parts[0] || now.getFullYear();
  const m = parts[1] || now.getMonth() + 1;
  const day = parts[2] || 1;

  const firstOfTarget = new Date(y, m - 1 + monthsToAdd, 1);
  const targetYear = firstOfTarget.getFullYear();
  const targetMonthIndex = firstOfTarget.getMonth();
  const maxDayInMonth = new Date(targetYear, targetMonthIndex + 1, 0).getDate();
  const clampedDay = Math.min(day, maxDayInMonth);

  return (
    String(targetYear) +
    '-' +
    String(targetMonthIndex + 1).padStart(2, '0') +
    '-' +
    String(clampedDay).padStart(2, '0')
  );
};

/**
 * Constrói uma data ISO (YYYY-MM-DD) no ano-mês targetYm preservando o dia original (com clamp).
 */
export const dateInMonthClamped = (originalDateIso: string, targetYm: string): string => {
  const origDay = Number(originalDateIso.split('-')[2]) || 1;
  const [ty, tm] = targetYm.split('-').map(Number);
  const maxDay = new Date(ty, tm, 0).getDate();
  const clampedDay = Math.min(origDay, maxDay);
  return `${targetYm}-${String(clampedDay).padStart(2, '0')}`;
};

/**
 * Retorna a matriz de 35 ou 42 objetos Date para exibir o mês completo (month 1..12)
 * alinhado de domingo (0) a sábado (6).
 */
export const getMonthCalendarMatrix = (year: number, month: number): Date[] => {
  const firstDay = new Date(year, month - 1, 1, 12, 0, 0);
  const startDayOfWeek = firstDay.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const totalCells = startDayOfWeek + daysInMonth > 35 ? 42 : 35;

  const matrix: Date[] = [];
  for (let i = 0; i < totalCells; i++) {
    matrix.push(new Date(year, month - 1, 1 - startDayOfWeek + i, 12, 0, 0));
  }
  return matrix;
};

/**
 * Formata uma data YYYY-MM-DD como 'Hoje', 'Ontem' ou 'DD de mmm.'.
 */
export const dfmt = (d: string): string => {
  const t = new Date(d + 'T12:00:00');
  const today = new Date(now.toISOString().slice(0, 10) + 'T12:00:00');
  const diff = Math.round((today.getTime() - t.getTime()) / 864e5);
  return diff === 0
    ? 'Hoje'
    : diff === 1
    ? 'Ontem'
    : t.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
};
