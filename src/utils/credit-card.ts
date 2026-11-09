/* ==========================================================================
   credit-card.ts — Competência de Fatura, Melhor Dia de Compra, Faturas e Compromissos
   ========================================================================== */

import { S, save } from '../state';
import {
  INVOICE_WARNING_LIMIT_RATIO,
  type CardDetailedInvoice,
  type CardInvoicePayment,
  type CardLimitStatus,
  type CardLimitUsage,
  type CreditCard,
  type Transaction
} from '../types/finance';
import { now, prevM, toIsoDate, ym } from './date';

/**
 * Retorna o valor real cobrado no cartão (se houve split, o valor integral da compra).
 */
export const getTransactionCardAmount = (t: Transaction): number =>
  t.splitInfo?.totalPurchaseCents && t.splitInfo.totalPurchaseCents > 0
    ? t.splitInfo.totalPurchaseCents
    : t.v;

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
 * Indica se uma compra ainda consome limite: está pendente ou pertence a fatura não paga.
 */
const consumesLimit = (t: Transaction, card: CreditCard): boolean => {
  if (t.type !== 'out' || t.cardId !== card.id) return false;
  const invYm = calculateInvoiceMonth(t.d, card.closingDay);
  const isPaid = S.paidInvoices?.some(
    (inv) => inv.cardId === card.id && inv.monthYear === invYm && inv.status === 'paid'
  );
  if (isPaid) return false;

  if (t.status === 'pending') return true;
  const openInvoice = calculateInvoiceMonth(toIsoDate(now), card.closingDay);
  return invYm >= openInvoice;
};

/**
 * Soma compras à vista da fatura aberta e parcelas futuras pendentes de um cartão,
 * respeitando o valor integral de compras divididas (splitInfo.totalPurchaseCents).
 */
export const getCardLimitUsage = (cardId: string): CardLimitUsage => {
  const card = S.cards.find((c) => c.id === cardId);
  if (!card) return { limitCents: 0, usedCents: 0, availableCents: 0, percent: 0 };
  const usedCents = S.tx
    .filter((t) => consumesLimit(t, card))
    .reduce((a, t) => a + getTransactionCardAmount(t), 0);
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
    .reduce((a, t) => a + getTransactionCardAmount(t), 0);
};

/**
 * Obtém o detalhamento analítico da fatura de um cartão em uma competência,
 * separando compras pessoais de compras para terceiros/divididas e computando
 * os pagamentos já realizados.
 */
export const getCardDetailedInvoice = (
  cardId: string,
  monthYear: string
): CardDetailedInvoice => {
  const card = S.cards.find((c) => c.id === cardId);
  if (!card) {
    return {
      cardId,
      monthYear,
      totalCents: 0,
      personalCents: 0,
      thirdPartyCents: 0,
      paidCents: 0,
      remainingCents: 0,
      status: 'open',
      items: []
    };
  }

  const items = S.tx.filter(
    (t) =>
      t.type === 'out' &&
      t.cardId === cardId &&
      calculateInvoiceMonth(t.d, card.closingDay) === monthYear
  );

  let personalCents = 0;
  let thirdPartyCents = 0;

  for (const t of items) {
    if (t.splitInfo && t.splitInfo.participants.length > 0) {
      const totalPurchase = t.splitInfo.totalPurchaseCents || t.v;
      const mePart = t.splitInfo.participants.find((p) => p.isMe);
      const myAmount = mePart ? mePart.amountCents : t.v;
      personalCents += myAmount;
      thirdPartyCents += Math.max(0, totalPurchase - myAmount);
    } else if (t.thirdParty?.isThirdParty) {
      thirdPartyCents += t.v;
    } else {
      personalCents += t.v;
    }
  }

  const totalCents = personalCents + thirdPartyCents;

  const paidPayments = (S.paidInvoices || []).filter(
    (p) => p.cardId === cardId && p.monthYear === monthYear
  );
  const paidCents = paidPayments.reduce(
    (acc, p) => acc + (p.totalPaidCents || p.totalAmountCents || 0),
    0
  );
  const remainingCents = Math.max(0, totalCents - paidCents);

  const todayStr = toIsoDate(now);
  const openInvoiceYm = calculateInvoiceMonth(todayStr, card.closingDay);

  let status: 'open' | 'closed' | 'paid' | 'partial' = 'open';
  if (totalCents > 0 && remainingCents <= 0) {
    status = 'paid';
  } else if (paidCents > 0 && remainingCents > 0) {
    status = 'partial';
  } else if (monthYear < openInvoiceYm) {
    status = 'closed';
  } else if (monthYear === openInvoiceYm) {
    const currentDay = now.getDate();
    status = currentDay >= card.closingDay ? 'closed' : 'open';
  } else {
    status = 'open';
  }

  return {
    cardId,
    monthYear,
    totalCents,
    personalCents,
    thirdPartyCents,
    paidCents,
    remainingCents,
    status,
    items
  };
};

/**
 * Calcula o status de limite do cartão, considerando compras abertas e futuras menos pagamentos realizados.
 */
export const getCardLimitStatus = (cardId: string): CardLimitStatus => {
  const card = S.cards.find((c) => c.id === cardId);
  const limitCents = card?.limitCents || 0;
  if (!card) {
    return {
      cardId,
      limitCents: 0,
      committedCents: 0,
      availableCents: 0,
      usageRatio: 0,
      isWarning: false
    };
  }

  const cardTxs = S.tx.filter((t) => t.type === 'out' && t.cardId === cardId);
  const totalPurchasedCents = cardTxs.reduce(
    (acc, t) => acc + getTransactionCardAmount(t),
    0
  );

  const totalPaidCents = (S.paidInvoices || [])
    .filter((p) => p.cardId === cardId)
    .reduce((acc, p) => acc + (p.totalPaidCents || p.totalAmountCents || 0), 0);

  const committedCents = Math.max(0, totalPurchasedCents - totalPaidCents);
  const availableCents = Math.max(0, limitCents - committedCents);
  const usageRatio = limitCents > 0 ? committedCents / limitCents : 0;
  const isWarning = limitCents > 0 && usageRatio >= INVOICE_WARNING_LIMIT_RATIO;

  return {
    cardId,
    limitCents,
    committedCents,
    availableCents,
    usageRatio,
    isWarning
  };
};

export interface CardInvoiceStatus {
  totalCents: number;
  status: 'open' | 'closed' | 'paid';
  transactions: Transaction[];
  paidInvoice?: CardInvoicePayment;
}

/**
 * Obtém o status da fatura de um cartão em uma competência: aberta, fechada ou paga.
 */
export const getCardInvoiceStatus = (cardId: string, monthYear: string): CardInvoiceStatus => {
  const detailed = getCardDetailedInvoice(cardId, monthYear);
  const paidInvoice = S.paidInvoices?.find(
    (inv) => inv.cardId === cardId && inv.monthYear === monthYear && inv.status === 'paid'
  );

  return {
    totalCents: detailed.totalCents,
    status: detailed.status === 'partial' ? 'open' : detailed.status,
    transactions: detailed.items,
    paidInvoice
  };
};

export interface PayCardInvoiceOptions {
  cardId: string;
  monthYear: string;
  totalPaidCents: number;
  useThirdPartyCustodyCents: number;
  paidFromAccountId?: string;
  isExternalThirdParty?: boolean;
}

/**
 * Liquida a fatura de um cartão de crédito, consumindo custódia de terceiros em FIFO
 * e abatendo a parcela pessoal da conta bancária de origem.
 */
export const payCardInvoice = (options: PayCardInvoiceOptions): CardInvoicePayment | null => {
  const card = S.cards.find((c) => c.id === options.cardId);
  if (!card) return null;

  const totalPaid = Math.round(options.totalPaidCents);
  if (totalPaid <= 0) return null;

  const useCustody = Math.max(
    0,
    Math.min(totalPaid, Math.round(options.useThirdPartyCustodyCents || 0))
  );

  // Consome custódia de terceiros em ordem FIFO
  if (useCustody > 0) {
    let remCustody = useCustody;
    // 1. Prioriza a conta selecionada
    if (options.paidFromAccountId) {
      for (const inf of S.custodyInflows) {
        if (remCustody <= 0) break;
        if (inf.accountId === options.paidFromAccountId) {
          const avail = inf.amountCents - inf.usedInInvoiceCents;
          if (avail > 0) {
            const take = Math.min(avail, remCustody);
            inf.usedInInvoiceCents += take;
            remCustody -= take;
          }
        }
      }
    }
    // 2. Demais contas FIFO se ainda restar
    if (remCustody > 0) {
      for (const inf of S.custodyInflows) {
        if (remCustody <= 0) break;
        const avail = inf.amountCents - inf.usedInInvoiceCents;
        if (avail > 0) {
          const take = Math.min(avail, remCustody);
          inf.usedInInvoiceCents += take;
          remCustody -= take;
        }
      }
    }
  }

  let personalPortionCents = 0;
  let thirdPartyPortionCents = 0;
  let fundingSource: CardInvoicePayment['fundingSource'] = 'my_account';

  if (options.isExternalThirdParty) {
    thirdPartyPortionCents = totalPaid;
    personalPortionCents = 0;
    fundingSource = 'external_third_party';
  } else {
    personalPortionCents = Math.max(0, totalPaid - useCustody);
    thirdPartyPortionCents = totalPaid - personalPortionCents;
    if (useCustody > 0) {
      fundingSource = personalPortionCents > 0 ? 'mixed' : 'third_party_custody';
    } else {
      fundingSource = 'my_account';
    }
  }

  const paymentRecord: CardInvoicePayment = {
    id: crypto.randomUUID(),
    cardId: options.cardId,
    monthYear: options.monthYear,
    totalPaidCents: totalPaid,
    personalPortionCents,
    thirdPartyPortionCents,
    paidFromAccountId: options.paidFromAccountId,
    fundingSource,
    paidAt: toIsoDate(now),
    status: 'paid',
    totalAmountCents: totalPaid
  };

  if (!S.paidInvoices) {
    S.paidInvoices = [];
  }
  S.paidInvoices.push(paymentRecord);
  save();
  return paymentRecord;
};

export interface CommitmentSegment {
  id: string;
  label: string;
  amountCents: number;
  color: string;
  pct: number;
  kind: 'card' | 'debt_to_pay' | 'pending_bill';
}

export interface HomeCommitmentsBreakdown {
  segments: CommitmentSegment[];
  totalCommitmentsCents: number;
  totalCardsCents: number;
  totalDebtsToPayCents: number;
  totalDebtsToReceiveCents: number;
  cardDetails: Array<{
    card: CreditCard;
    invoiceTotalCents: number;
    status: 'open' | 'closed' | 'paid';
    closingDay: number;
    dueDay: number;
  }>;
}

/**
 * Calcula o detalhamento e segmentos de compromissos para o infográfico na Home.
 */
export const getHomeCommitmentsBreakdown = (monthYear: string): HomeCommitmentsBreakdown => {
  const segments: CommitmentSegment[] = [];
  const cardDetails: HomeCommitmentsBreakdown['cardDetails'] = [];

  let totalCardsCents = 0;
  for (const card of S.cards) {
    const inv = getCardInvoiceStatus(card.id, monthYear);
    cardDetails.push({
      card,
      invoiceTotalCents: inv.totalCents,
      status: inv.status,
      closingDay: card.closingDay,
      dueDay: card.dueDay
    });

    if (inv.status !== 'paid' && inv.totalCents > 0) {
      totalCardsCents += inv.totalCents;
      segments.push({
        id: `card-${card.id}`,
        label: card.name,
        amountCents: inv.totalCents,
        color: card.color,
        pct: 0,
        kind: 'card'
      });
    }
  }

  // Dívidas ativas a pagar
  let totalDebtsToPayCents = 0;
  for (const d of S.debts) {
    if (d.status === 'active' && d.type === 'to_pay') {
      const remaining = Math.max(0, d.originalAmountCents - d.paidAmountCents);
      totalDebtsToPayCents += remaining;
    }
  }

  if (totalDebtsToPayCents > 0) {
    segments.push({
      id: 'debts-to-pay',
      label: 'Devo a pessoas',
      amountCents: totalDebtsToPayCents,
      color: '#ef4444',
      pct: 0,
      kind: 'debt_to_pay'
    });
  }

  // Contas pendentes que não são de cartão no mês
  const pendingBills = S.tx.filter(
    (t) =>
      t.type === 'out' &&
      t.status === 'pending' &&
      ym(t.d) === monthYear &&
      t.pay !== 'credit'
  );
  const pendingBillsCents = pendingBills.reduce((a, t) => a + t.v, 0);

  if (pendingBillsCents > 0) {
    segments.push({
      id: 'pending-bills',
      label: 'Contas fixas pendentes',
      amountCents: pendingBillsCents,
      color: '#f97316',
      pct: 0,
      kind: 'pending_bill'
    });
  }

  const totalCommitmentsCents = segments.reduce((a, s) => a + s.amountCents, 0);
  for (const seg of segments) {
    seg.pct = totalCommitmentsCents > 0 ? (seg.amountCents / totalCommitmentsCents) * 100 : 0;
  }

  // Valores a receber de amigos
  let totalDebtsToReceiveCents = 0;
  for (const d of S.debts) {
    if (d.status === 'active' && d.type === 'to_receive') {
      totalDebtsToReceiveCents += Math.max(0, d.originalAmountCents - d.paidAmountCents);
    }
  }

  return {
    segments,
    totalCommitmentsCents,
    totalCardsCents,
    totalDebtsToPayCents,
    totalDebtsToReceiveCents,
    cardDetails
  };
};
