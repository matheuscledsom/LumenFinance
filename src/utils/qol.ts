/* ==========================================================================
   qol.ts — Micro-utilitários puros: Calculadora de Valores, Leitura de Clipboard
            e Cofrinho de Arredondamento (Round-up)
   ========================================================================== */

/**
 * Converte um token numérico textual (ex.: "45,50", "12.50", "1.250,90", "1.250") em reais (float).
 * Ponto único seguido de 1–2 dígitos é tratado como decimal; grupos de 3 dígitos como milhar.
 * Retorna NaN quando não houver número interpretável.
 */
export const parseDecimalToken = (raw: string): number => {
  const cleaned = raw.replace(/[^\d.,-]/g, '');
  if (!cleaned) return NaN;
  let normalized: string;
  if (cleaned.includes(',')) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    normalized = cleaned.replace(/\./g, '');
  } else {
    normalized = cleaned;
  }
  return parseFloat(normalized);
};

/**
 * Indica se o texto parece uma expressão matemática (e não apenas um número simples).
 */
export const looksLikeExpression = (raw: string): boolean =>
  /[+*/×÷x()]/i.test(raw) || /\d\s*-\s*\d/.test(raw);

type Token = { kind: 'num'; value: number } | { kind: 'op'; value: string };

const tokenize = (input: string): Token[] | null => {
  const src = input.replace(/×|x/gi, '*').replace(/÷/g, '/').replace(/\s+/g, '');
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/[\d.,]/.test(ch)) {
      let j = i;
      while (j < src.length && /[\d.,]/.test(src[j])) j++;
      const value = parseDecimalToken(src.slice(i, j));
      if (!Number.isFinite(value)) return null;
      tokens.push({ kind: 'num', value });
      i = j;
    } else if ('+-*/()'.includes(ch)) {
      tokens.push({ kind: 'op', value: ch });
      i++;
    } else {
      return null;
    }
  }
  return tokens;
};

/**
 * Avalia expressões aritméticas básicas (+ − × ÷ e parênteses) sem usar eval().
 * Retorna o resultado em reais ou null se a expressão for inválida.
 */
export const evaluateExpression = (input: string): number | null => {
  const tokens = tokenize(input);
  if (!tokens || tokens.length === 0) return null;
  let pos = 0;
  let failed = false;

  const peek = (): Token | undefined => tokens[pos];

  const parseFactor = (): number => {
    const t = peek();
    if (!t) {
      failed = true;
      return NaN;
    }
    if (t.kind === 'op' && t.value === '-') {
      pos++;
      return -parseFactor();
    }
    if (t.kind === 'op' && t.value === '+') {
      pos++;
      return parseFactor();
    }
    if (t.kind === 'op' && t.value === '(') {
      pos++;
      const v = parseExpr();
      const close = peek();
      if (!close || close.kind !== 'op' || close.value !== ')') {
        failed = true;
        return NaN;
      }
      pos++;
      return v;
    }
    if (t.kind === 'num') {
      pos++;
      return t.value;
    }
    failed = true;
    return NaN;
  };

  const parseTerm = (): number => {
    let acc = parseFactor();
    for (;;) {
      const t = peek();
      if (!t || t.kind !== 'op' || (t.value !== '*' && t.value !== '/')) break;
      pos++;
      const rhs = parseFactor();
      if (t.value === '/') {
        if (rhs === 0) {
          failed = true;
          return NaN;
        }
        acc /= rhs;
      } else {
        acc *= rhs;
      }
    }
    return acc;
  };

  function parseExpr(): number {
    let acc = parseTerm();
    for (;;) {
      const t = peek();
      if (!t || t.kind !== 'op' || (t.value !== '+' && t.value !== '-')) break;
      pos++;
      const rhs = parseTerm();
      acc = t.value === '+' ? acc + rhs : acc - rhs;
    }
    return acc;
  }

  const result = parseExpr();
  if (failed || pos !== tokens.length || !Number.isFinite(result)) return null;
  return result;
};

/**
 * Converte o texto digitado em um campo de valor (número simples ou expressão) em centavos.
 * Retorna NaN quando o texto for inválido.
 */
export const parseAmountInput = (raw: string | null | undefined): number => {
  const text = String(raw ?? '').trim();
  if (!text) return NaN;
  if (looksLikeExpression(text)) {
    const result = evaluateExpression(text);
    return result === null ? NaN : Math.round(result * 100);
  }
  return Math.round(parseDecimalToken(text) * 100);
};

/**
 * Formata centavos como texto editável de campo (ex.: 4590 -> "45,90").
 */
export const centsToInput = (cents: number): string =>
  (cents / 100).toFixed(2).replace('.', ',');

/**
 * Tenta extrair um valor monetário (em centavos) de um texto colado do clipboard,
 * ex.: "R$ 45,90", "45.90", "Pix enviado: R$ 1.234,56".
 */
export const extractMoneyFromText = (text: string): number | null => {
  const withSymbol = text.match(/R\$\s*(\d[\d.]*(?:,\d{1,2})?)/i);
  if (withSymbol) {
    const v = parseDecimalToken(withSymbol[1]);
    if (Number.isFinite(v) && v > 0) return Math.round(v * 100);
  }
  if (/^\s*[\d.,]+\s*$/.test(text)) {
    const v = parseDecimalToken(text);
    if (Number.isFinite(v) && v > 0) return Math.round(v * 100);
  }
  const decimal = text.match(/\d+[.,]\d{2}(?!\d)/);
  if (decimal) {
    const v = parseDecimalToken(decimal[0]);
    if (Number.isFinite(v) && v > 0) return Math.round(v * 100);
  }
  return null;
};

/**
 * Calcula os centavos que faltam para a próxima dezena de reais (cofrinho virtual).
 * Ex.: R$ 12,50 -> R$ 7,50 (750); R$ 20,00 -> 0.
 */
export const calculateRoundUp = (amountCents: number): number => {
  if (!(amountCents > 0)) return 0;
  const step = 1000;
  const rest = Math.round(amountCents) % step;
  return rest === 0 ? 0 : step - rest;
};
