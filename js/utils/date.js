/* ==========================================================================
   date.js — Manipulação e Formatação de Datas ISO
   ========================================================================== */

export const now = new Date();
export const cur = now.toISOString().slice(0, 7);

/**
 * Extrai o ano-mês (YYYY-MM) de uma string de data ISO.
 */
export const ym = (d) => d.slice(0, 7);

/**
 * Retorna o ano-mês (YYYY-MM) retrocedendo n meses a partir de m.
 */
export const prevM = (m, n) => {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 1 - n, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
};

/**
 * Formata uma data YYYY-MM-DD como 'Hoje', 'Ontem' ou 'DD de mmm.'.
 */
export const dfmt = (d) => {
  const t = new Date(d + 'T12:00:00');
  const h = new Date(cur + '-01');
  const diff = Math.round(
    (new Date(now.toISOString().slice(0, 10) + 'T12:00:00') - t) / 864e5
  );
  return diff === 0
    ? 'Hoje'
    : diff === 1
    ? 'Ontem'
    : t.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
};
