/* ==========================================================================
   credit-card.ts — Competência de Fatura, Melhor Dia de Compra e Uso de Limite
   ========================================================================== */

import { S } from '../state';
import type { CardLimitUsage, CreditCard, Transaction } from '../types/finance';
import { now, prevM, toIsoDate, ym } from './date';

/**
 * Retorna a competência (YYYY-MM) da fatura em que uma compra entra.
 * Compras no dia de fechamento (ou depois) vão para a fatura do mês seguinte.
 */
export const calculateInvoiceMonth = (purchaseDate: string, closingDay: number): string => {
  const [y, m, d] = purchaseDate.split('-').map(Number);
  if (!y || !m || !d) return ym(purchaseDate);
  const base = `${y}-${String(m).padStart(2, '0')}`;
  return d >= closingDay ? prevM(base, -1) : base;
};

/**
 * Dia ideal de compra: o dia seguinte ao fechamento da fatura.
 */
export const getBestPurchaseDay = (closingDay: number): number =>
  closingDay >= 31 ? 1 : closingDay + 1;

/**
 * Formata uma competência YYYY-MM como "Novembro/2026".
 */
export const formatInvoiceLabel = (invoiceYm: string): string => {
  const [y, m] = invoiceYm.split('-').map(Number);
  if (!y || !m) return invoiceYm;
  const name = new Date(y, m - 1, 1, 12).toLocaleDateString('pt-BR', { month: 'long' });
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}/${y}`;
};

/**
 * Indica se uma compra ainda consome limite: está pendente ou pertence à fatura aberta/futura.
 */
const consumesLimit = (t: Transaction, card: CreditCard): boolean => {
  if (t.type !== 'out' || t.cardId !== card.id) return false;
  if (t.status === 'pending') return true;
  const openInvoice = calculateInvoiceMonth(toIsoDate(now), card.closingDay);
  return calculateInvoiceMonth(t.d, card.closingDay) >= openInvoice;
};

/**
 * Soma compras à vista da fatura aberta e parcelas futuras pendentes de um cartão.
 */
export const getCardLimitUsage = (cardId: string): CardLimitUsage => {
  const card = S.cards.find((c) => c.id === cardId);
  if (!card) return { limitCents: 0, usedCents: 0, availableCents: 0, percent: 0 };
  const usedCents = S.tx.filter((t) => consumesLimit(t, card)).reduce((a, t) => a + t.v, 0);
  const availableCents = card.limitCents - usedCents;
  const percent = card.limitCents > 0 ? (usedCents / card.limitCents) * 100 : 0;
  return { limitCents: card.limitCents, usedCents, availableCents, percent };
};

/**
 * Total da fatura de uma competência específica para o cartão.
 */
export const getInvoiceTotal = (cardId: string, invoiceYm: string): number => {
  const card = S.cards.find((c) => c.id === cardId);
  if (!card) return 0;
  return S.tx
    .filter(
      (t) =>
        t.type === 'out' &&
        t.cardId === cardId &&
        calculateInvoiceMonth(t.d, card.closingDay) === invoiceYm
    )
    .reduce((a, t) => a + t.v, 0);
};
