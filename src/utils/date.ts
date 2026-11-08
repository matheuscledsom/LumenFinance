/* ==========================================================================
   date.ts — Manipulação e Formatação de Datas ISO
   ========================================================================== */

export const now: Date = new Date();
export const cur: string = now.toISOString().slice(0, 7);

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
