/* ==========================================================================
   csv.ts — Exportação e Importação de Planilhas CSV
   ========================================================================== */

import { normalizePay, normalizeStatus, normalizeTags } from '../state';
import type { Category, Transaction } from '../types/finance';

/**
 * Converte uma lista de movimentações para texto CSV.
 */
export const toCSV = (txList: Transaction[] = []): string => {
  const header = 'id,tipo,valor_centavos,descricao,categoria,data,pagamento,tags,status';
  const rows = txList.map((t) => {
    const safeDesc = `"${String(t.n || '').replace(/"/g, '""')}"`;
    const safeCat = `"${String(t.c || '').replace(/"/g, '""')}"`;
    const safeTags = `"${(t.tags || []).join(';')}"`;
    return [
      t.id,
      t.type,
      t.v,
      safeDesc,
      safeCat,
      t.d,
      t.pay || 'money',
      safeTags,
      t.status || 'confirmed'
    ].join(',');
  });
  return [header, ...rows].join('\n');
};

/**
 * Faz o parse de uma string CSV para uma lista de objetos de movimentação.
 */
export const parseCSV = (csvText = ''): Transaction[] => {
  const lines = csvText
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  if (lines.length <= 1) return [];

  return lines
    .slice(1)
    .map((line): Transaction | null => {
      const cols =
        line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g)?.map((c) =>
          c.replace(/^"|"$/g, '').replace(/""/g, '"')
        ) || [];
      const [id, type, v, n, c, d, pay, rawTags, status] = cols;
      const cents = parseInt(v, 10);
      if (!type || !(cents > 0) || !d) return null;
      return {
        id: id || crypto.randomUUID(),
        type: type === 'in' ? 'in' : 'out',
        v: cents,
        n: (n || 'Movimentação').slice(0, 60),
        c: (c || 'Outros') as Category,
        d,
        pay: normalizePay(pay),
        tags: normalizeTags(rawTags ? rawTags.split(/[;,]/) : []),
        status: normalizeStatus(status)
      };
    })
    .filter((item): item is Transaction => item !== null);
};
