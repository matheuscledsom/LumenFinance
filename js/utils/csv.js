/* ==========================================================================
   csv.js — Exportação e Importação de Planilhas CSV
   ========================================================================== */

/**
 * Converte uma lista de movimentações para texto CSV.
 */
export const toCSV = (txList = []) => {
  const header = 'id,tipo,valor_centavos,descricao,categoria,data';
  const rows = txList.map((t) => {
    const safeDesc = `"${String(t.n || '').replace(/"/g, '""')}"`;
    const safeCat = `"${String(t.c || '').replace(/"/g, '""')}"`;
    return [t.id, t.type, t.v, safeDesc, safeCat, t.d].join(',');
  });
  return [header, ...rows].join('\n');
};

/**
 * Faz o parse de uma string CSV para uma lista de objetos de movimentação.
 */
export const parseCSV = (csvText = '') => {
  const lines = csvText
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  if (lines.length <= 1) return [];

  return lines
    .slice(1)
    .map((line, idx) => {
      const cols =
        line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g)?.map((c) =>
          c.replace(/^"|"$/g, '').replace(/""/g, '"')
        ) || [];
      const [id, type, v, n, c, d] = cols;
      const cents = parseInt(v, 10);
      if (!type || !(cents > 0) || !d) return null;
      return {
        id: id || crypto.randomUUID(),
        type: type === 'in' ? 'in' : 'out',
        v: cents,
        n: (n || 'Movimentação').slice(0, 60),
        c: c || 'Outros',
        d
      };
    })
    .filter(Boolean);
};
