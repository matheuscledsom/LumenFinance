/* ==========================================================================
   currency.js — Formatação Monetária, Sanitização, Luminância e Contraste
   ========================================================================== */

import { S } from '../state.js';

/**
 * Sanitiza strings para interpolação segura em HTML.
 */
export const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
  }[c]));

/**
 * Formata centavos (inteiro) para moeda BRL ou máscara oculta.
 */
export const brl = (c) =>
  S.hide
    ? 'R$ ••••'
    : (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Converte string de valor monetário (ex: "45,50") para centavos (inteiro).
 */
export const parseCents = (input) => {
  const raw = String(input || '')
    .trim()
    .replace(/\./g, '')
    .replace(',', '.');
  return Math.round(parseFloat(raw) * 100);
};

/**
 * Retorna o valor com sinal de acordo com o tipo da movimentação.
 */
export const sgn = (t) => (t.type === 'in' ? t.v : -t.v);

/**
 * Soma o saldo líquido de uma lista de movimentações.
 */
export const sum = (l) => l.reduce((a, t) => a + sgn(t), 0);

/**
 * Calcula a luminância relativa WCAG de uma cor hexadecimal (#RRGGBB).
 */
export const lum = (h) => {
  const v = [1, 3, 5].map((i) => {
    const x = parseInt(h.substr(i, 2), 16) / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};

/**
 * Calcula a razão de contraste WCAG entre duas cores hexadecimais.
 */
export const con = (a, b) => {
  const x = lum(a);
  const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
