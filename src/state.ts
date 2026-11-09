/* ==========================================================================
   state.ts — Estado Central (S), Persistência, Categorias, Orçamentos, Parcelas e Calendário
   ========================================================================== */

import {
  DEFAULT_CATEGORIES,
  DEFAULT_ACCOUNTS,
  cloneDefaultCategories,
  isValidPaymentMethod,
  type AppState,
  type BankAccount,
  type BillSplitInfo,
  type BudgetProgress,
  type CardInvoice,
  type CategoriesState,
  type Category,
  type CategoryBudget,
  type CategoryItem,
  type CreditCard,
  type DaySummary,
  type DebtPayment,
  type DebtRecord,
  type DebtType,
  type FilteredTransactionsResult,
  type InstallmentInfo,
  type MonthSummary,
  type PaymentMethod,
  type QuickShortcut,
  type RecurringInfo,
  type SplitParticipant,
  type Theme,
  type ThirdPartyInfo,
  type Transaction,
  type TransactionFilters,
  type TransactionStatus,
  type TransactionType,
  type UpcomingBill,
  type ViewName
} from './types/finance';
import {
  addMonthsClamped,
  cur,
  dateInMonthClamped,
  getMonthCalendarMatrix,
  now,
  prevM,
  toIsoDate,
  ym
} from './utils/date';
import { calculateRoundUp } from './utils/qol';

export const K = 'lumen.v1';

export const ACC: [string, string][] = [
  ['Roxo', '#8b5cf6'],
  ['Azul', '#3b82f6'],
  ['Ciano', '#06b6d4'],
  ['Verde', '#22c55e'],
  ['Vermelho', '#ef4444'],
  ['Laranja', '#f97316'],
  ['Rosa', '#ec4899'],
  ['Amarelo', '#eab308']
];

export const THEMES: [Theme, string][] = [
  ['oled', 'OLED'],
  ['white', 'Branco'],
  ['grey', 'Cinza escuro'],
  ['xp', 'Windows XP']
];

export const CAT: Record<TransactionType, Category[]> = {
  get out() {
    return S.cats.out.map((c) => c.name);
  },
  get in() {
    return S.cats.in.map((c) => c.name);
  }
};

/**
 * Normaliza e valida uma forma de pagamento, adotando 'money' como fallback seguro.
 */
export const normalizePay = (pay: unknown): PaymentMethod =>
  isValidPaymentMethod(pay) ? pay : 'money';

/**
 * Normaliza uma tag individual (trim, lowercase, remoção de caracteres inválidos).
 */
export const normalizeTag = (raw: string): string =>
  raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_-]+/gu, '');

/**
 * Valida e normaliza uma coleção de tags sem duplicatas.
 */
export const normalizeTags = (tags: unknown): string[] => {
  if (!Array.isArray(tags)) return [];
  const unique: string[] = [];
  for (const item of tags) {
    if (typeof item === 'string') {
      const cleaned = normalizeTag(item);
      if (cleaned && !unique.includes(cleaned)) {
        unique.push(cleaned);
      }
    }
  }
  return unique;
};

/**
 * Normaliza o status de uma movimentação, adotando 'confirmed' como padrão para registros legados.
 */
export const normalizeStatus = (status: unknown): TransactionStatus =>
  status === 'pending' ? 'pending' : 'confirmed';

/**
 * Normaliza metadados de parcelamento se válidos.
 */
export const normalizeInstallments = (raw: unknown): InstallmentInfo | undefined => {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  const current = Number(obj.current);
  const total = Number(obj.total);
  const groupId = typeof obj.groupId === 'string' ? obj.groupId.trim() : '';
  if (current >= 1 && total >= 2 && groupId) {
    return {
      current: Math.floor(current),
      total: Math.floor(total),
      groupId
    };
  }
  return undefined;
};

/**
 * Normaliza metadados de recorrência mensal se válidos.
 */
export const normalizeRecurring = (raw: unknown): RecurringInfo | undefined => {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  const groupId = typeof obj.groupId === 'string' ? obj.groupId.trim() : '';
  if (!groupId) return undefined;
  return {
    groupId,
    frequency: 'monthly',
    isTemplate: Boolean(obj.isTemplate)
  };
};

/**
 * Normaliza metadados de compras para terceiros (cartão emprestado) se válidos.
 */
export const normalizeThirdParty = (raw: unknown): ThirdPartyInfo | undefined => {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  if (!obj.isThirdParty) return undefined;
  const personName = typeof obj.personName === 'string' ? obj.personName.trim() : '';
  if (!personName) return undefined;
  return {
    isThirdParty: true,
    personName,
    isReimbursed: Boolean(obj.isReimbursed)
  };
};

/**
 * Normaliza uma lista de CategoryItem ou restaura os defaults do tipo correspondente.
 */
const normalizeCategoryList = (rawList: unknown, fallback: CategoryItem[]): CategoryItem[] => {
  if (!Array.isArray(rawList) || rawList.length === 0) {
    return fallback.map((c) => ({ ...c }));
  }
  const normalized: CategoryItem[] = [];
  for (const item of rawList) {
    if (item && typeof item === 'object') {
      const rec = item as Record<string, unknown>;
      const name = typeof rec.name === 'string' ? rec.name.trim() : '';
      if (!name) continue;
      if (normalized.some((c) => c.name.toLowerCase() === name.toLowerCase())) continue;
      normalized.push({
        id: typeof rec.id === 'string' && rec.id ? rec.id : crypto.randomUUID(),
        name,
        icon: typeof rec.icon === 'string' && rec.icon.trim() ? rec.icon.trim() : '📦',
        isDefault: Boolean(rec.isDefault)
      });
    }
  }
  return normalized.length > 0 ? normalized : fallback.map((c) => ({ ...c }));
};

/**
 * Normaliza a estrutura completa CategoriesState garantindo DEFAULT_CATEGORIES como fallback.
 */
export const normalizeCategoriesState = (rawCats: unknown): CategoriesState => {
  if (!rawCats || typeof rawCats !== 'object') {
    return cloneDefaultCategories();
  }
  const obj = rawCats as Record<string, unknown>;
  return {
    out: normalizeCategoryList(obj.out, DEFAULT_CATEGORIES.out),
    in: normalizeCategoryList(obj.in, DEFAULT_CATEGORIES.in)
  };
};

/**
 * Normaliza o mapa de orçamentos por categoria garantindo valores inteiros positivos em centavos.
 */
export const normalizeBudgets = (
  rawBudgets: unknown
): Record<string, CategoryBudget> => {
  if (!rawBudgets || typeof rawBudgets !== 'object' || Array.isArray(rawBudgets)) {
    return {};
  }
  const out: Record<string, CategoryBudget> = {};
  for (const [key, val] of Object.entries(rawBudgets as Record<string, unknown>)) {
    if (!key) continue;
    if (val && typeof val === 'object') {
      const rec = val as Record<string, unknown>;
      const limit =
        typeof rec.limitCents === 'number'
          ? Math.round(rec.limitCents)
          : Number(rec.limitCents) || 0;
      if (limit > 0) {
        out[key] = { limitCents: limit };
      }
    } else if (typeof val === 'number' && val > 0) {
      out[key] = { limitCents: Math.round(val) };
    }
  }
  return out;
};

const asString = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const asPositiveInt = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};
const clampDay = (v: unknown, fallback: number): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= 31 ? n : fallback;
};

/**
 * Normaliza a lista de cartões de crédito persistida.
 */
export const normalizeCards = (raw: unknown): CreditCard[] => {
  if (!Array.isArray(raw)) return [];
  const out: CreditCard[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const name = asString(r.name);
    if (!name) continue;
    const card: CreditCard = {
      id: asString(r.id) || crypto.randomUUID(),
      name,
      color: /^#[0-9a-f]{6}$/i.test(asString(r.color)) ? asString(r.color) : '#8b5cf6',
      limitCents: asPositiveInt(r.limitCents),
      closingDay: clampDay(r.closingDay, 10),
      dueDay: clampDay(r.dueDay, 17)
    };
    const digits = asString(r.lastDigits).replace(/\D/g, '').slice(-4);
    if (digits) card.lastDigits = digits;
    const linkedAccountId = asString(r.linkedAccountId);
    if (linkedAccountId) card.linkedAccountId = linkedAccountId;
    out.push(card);
  }
  return out;
};

/**
 * Normaliza a lista de contas bancárias e carteiras persistidas.
 */
export const normalizeAccounts = (raw: unknown): BankAccount[] => {
  if (!Array.isArray(raw) || raw.length === 0) {
    return DEFAULT_ACCOUNTS.map((a) => ({ ...a }));
  }
  const out: BankAccount[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const name = asString(r.name);
    if (!name) continue;
    const initialBalanceCents =
      typeof r.initialBalanceCents === 'number'
        ? Math.round(r.initialBalanceCents)
        : Number(r.initialBalanceCents) || 0;
    out.push({
      id: asString(r.id) || crypto.randomUUID(),
      name,
      icon: asString(r.icon) || '🏦',
      color: /^#[0-9a-f]{6}$/i.test(asString(r.color)) ? asString(r.color) : '#8b5cf6',
      initialBalanceCents,
      isDefault: Boolean(r.isDefault)
    });
  }
  if (out.length === 0) {
    return DEFAULT_ACCOUNTS.map((a) => ({ ...a }));
  }
  if (!out.some((a) => a.isDefault)) {
    out[0].isDefault = true;
  }
  return out;
};

/**
 * Normaliza o registro de faturas de cartão pagas.
 */
export const normalizePaidInvoices = (raw: unknown): CardInvoice[] => {
  if (!Array.isArray(raw)) return [];
  const out: CardInvoice[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const cardId = asString(r.cardId);
    const monthYear = asString(r.monthYear);
    if (!cardId || !monthYear) continue;
    out.push({
      cardId,
      monthYear,
      totalAmountCents: asPositiveInt(r.totalAmountCents),
      status: r.status === 'open' || r.status === 'closed' ? r.status : 'paid',
      paidAt: asString(r.paidAt) || undefined,
      paymentTxId: asString(r.paymentTxId) || undefined
    });
  }
  return out;
};

/**
 * Normaliza os detalhes de divisão de compras (BillSplitInfo).
 */
export const normalizeSplitInfo = (raw: unknown): BillSplitInfo | undefined => {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const totalPurchaseCents = asPositiveInt(r.totalPurchaseCents);
  const serviceTipPercent =
    typeof r.serviceTipPercent === 'number'
      ? Math.max(0, Math.min(100, Math.round(r.serviceTipPercent)))
      : 0;
  if (!Array.isArray(r.participants) || r.participants.length === 0) return undefined;
  const participants: SplitParticipant[] = [];
  for (const p of r.participants) {
    if (!p || typeof p !== 'object') continue;
    const pr = p as Record<string, unknown>;
    const name = asString(pr.name);
    if (!name) continue;
    participants.push({
      id: asString(pr.id) || crypto.randomUUID(),
      name,
      amountCents: asPositiveInt(pr.amountCents),
      isMe: Boolean(pr.isMe),
      pixKey: asString(pr.pixKey) || undefined,
      debtId: asString(pr.debtId) || undefined
    });
  }
  if (participants.length === 0) return undefined;
  return {
    totalPurchaseCents:
      totalPurchaseCents || participants.reduce((a, p) => a + p.amountCents, 0),
    serviceTipPercent,
    participants
  };
};

/**
 * Normaliza a lista de nomes frequentes para autocomplete.
 */
export const normalizeFrequentPeople = (
  raw: unknown,
  debts: DebtRecord[]
): string[] => {
  const set = new Set<string>();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === 'string' && item.trim()) {
        set.add(item.trim());
      }
    }
  }
  if (set.size === 0 && Array.isArray(debts)) {
    for (const d of debts) {
      if (d.personName?.trim()) {
        set.add(d.personName.trim());
      }
    }
  }
  return [...set];
};

/**
 * Normaliza o livro de dívidas e empréstimos persistido.
 */
export const normalizeDebts = (raw: unknown): DebtRecord[] => {
  if (!Array.isArray(raw)) return [];
  const out: DebtRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const personName = asString(r.personName);
    const original = asPositiveInt(r.originalAmountCents);
    if (!personName || !original) continue;

    const payments: DebtPayment[] = [];
    if (Array.isArray(r.payments)) {
      for (const p of r.payments) {
        if (!p || typeof p !== 'object') continue;
        const pr = p as Record<string, unknown>;
        const amountCents = asPositiveInt(pr.amountCents);
        if (!amountCents) continue;
        const payment: DebtPayment = {
          id: asString(pr.id) || crypto.randomUUID(),
          amountCents,
          date: asString(pr.date) || toIsoDate(now)
        };
        const notes = asString(pr.notes);
        if (notes) payment.notes = notes;
        payments.push(payment);
      }
    }
    const paidAmountCents = payments.reduce((a, p) => a + p.amountCents, 0);
    const debt: DebtRecord = {
      id: asString(r.id) || crypto.randomUUID(),
      personName,
      type: r.type === 'to_pay' ? 'to_pay' : 'to_receive',
      originalAmountCents: original,
      paidAmountCents,
      payments,
      description: asString(r.description),
      status: paidAmountCents >= original ? 'settled' : 'active',
      createdAt: asString(r.createdAt) || toIsoDate(now)
    };
    const dueDate = asString(r.dueDate);
    if (dueDate) debt.dueDate = dueDate;
    const pixKey = asString(r.pixKey);
    if (pixKey) debt.pixKey = pixKey;
    out.push(debt);
  }
  return out;
};

/**
 * Normaliza os atalhos rápidos de 1 toque persistidos.
 */
export const normalizeShortcuts = (raw: unknown): QuickShortcut[] => {
  if (!Array.isArray(raw)) return [];
  const out: QuickShortcut[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const label = asString(r.label);
    const amountCents = asPositiveInt(r.amountCents);
    if (!label || !amountCents) continue;
    const sc: QuickShortcut = {
      id: asString(r.id) || crypto.randomUUID(),
      label,
      amountCents,
      categoryId: asString(r.categoryId),
      paymentMethod: normalizePay(r.paymentMethod)
    };
    const cardId = asString(r.cardId);
    if (cardId) sc.cardId = cardId;
    const accountId = asString(r.accountId);
    if (accountId) sc.accountId = accountId;
    out.push(sc);
  }
  return out;
};

const defaultTheme = (): Theme =>
  typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches
    ? 'white'
    : 'oled';

export const S: AppState = {
  name: 'Matheus',
  theme: defaultTheme(),
  accent: '#8b5cf6',
  hide: false,
  per: 0,
  tx: [],
  cats: cloneDefaultCategories(),
  budgets: {},
  goalCents: 0,
  cards: [],
  debts: [],
  accounts: DEFAULT_ACCOUNTS.map((a) => ({ ...a })),
  frequentPeople: [],
  quickShortcuts: [],
  hasCompletedOnboarding: false,
  roundUpEnabled: false,
  paidInvoices: []
};

export let view: ViewName = 'home';
export let prevView: ViewName = 'home';

export const setView = (v: ViewName): void => {
  if (view !== v && view !== 'history') {
    prevView = view;
  }
  view = v;
};

/**
 * Executa migrações de versão do schema mantendo compatibilidade retroativa.
 * Garante que transações antigas sem 'status' recebam 'confirmed' por padrão.
 */
export const migrate = (raw: unknown): Partial<AppState> => {
  if (!raw || typeof raw !== 'object') {
    return {
      cats: cloneDefaultCategories(),
      budgets: {},
      goalCents: 0,
      cards: [],
      debts: [],
      accounts: DEFAULT_ACCOUNTS.map((a) => ({ ...a })),
      frequentPeople: [],
      paidInvoices: [],
      quickShortcuts: [],
      roundUpEnabled: false,
      hasCompletedOnboarding: false
    };
  }
  const data = raw as Record<string, unknown>;
  const rawTx = Array.isArray(data.tx) ? data.tx : [];
  const tx: Transaction[] = rawTx
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((t) => {
      const installments = normalizeInstallments(t.installments);
      const recurring = normalizeRecurring(t.recurring);
      const thirdParty = normalizeThirdParty(t.thirdParty);
      const splitInfo = normalizeSplitInfo(t.splitInfo);
      const item: Transaction = {
        id: t.id != null ? String(t.id) : crypto.randomUUID(),
        type: t.type === 'in' ? 'in' : 'out',
        v: typeof t.v === 'number' ? t.v : Number(t.v) || 0,
        n: typeof t.n === 'string' ? t.n : String(t.n ?? ''),
        c: (typeof t.c === 'string' ? t.c : 'Outros') as Category,
        d: typeof t.d === 'string' ? t.d : new Date().toISOString().slice(0, 10),
        pay: normalizePay(t.pay),
        tags: normalizeTags(t.tags),
        status: normalizeStatus(t.status)
      };
      if (typeof t.notes === 'string' && t.notes.trim()) {
        item.notes = t.notes.trim();
      }
      if (typeof t.cardId === 'string' && t.cardId.trim()) {
        item.cardId = t.cardId.trim();
      }
      if (typeof t.accountId === 'string' && t.accountId.trim()) {
        item.accountId = t.accountId.trim();
      }
      if (splitInfo) item.splitInfo = splitInfo;
      if (installments) item.installments = installments;
      if (recurring) item.recurring = recurring;
      if (thirdParty) item.thirdParty = thirdParty;
      return item;
    });

  const cats = normalizeCategoriesState(data.cats);
  const budgets = normalizeBudgets(data.budgets);
  const goalCents =
    typeof data.goalCents === 'number' && data.goalCents > 0
      ? Math.round(data.goalCents)
      : 0;

  const debts = normalizeDebts(data.debts);
  const accounts = normalizeAccounts(data.accounts);
  const frequentPeople = Array.isArray(data.frequentPeople)
    ? normalizeFrequentPeople(data.frequentPeople, debts)
    : [];
  const paidInvoices = normalizePaidInvoices(data.paidInvoices);

  const result: Partial<AppState> = {
    tx,
    cats,
    budgets,
    goalCents,
    cards: normalizeCards(data.cards),
    debts,
    accounts,
    frequentPeople,
    paidInvoices,
    quickShortcuts: normalizeShortcuts(data.quickShortcuts),
    roundUpEnabled: data.roundUpEnabled === true,
    hasCompletedOnboarding:
      typeof data.hasCompletedOnboarding === 'boolean'
        ? data.hasCompletedOnboarding
        : tx.length > 0
  };
  if (typeof data.defaultPixKey === 'string' && data.defaultPixKey.trim()) {
    result.defaultPixKey = data.defaultPixKey.trim();
  }
  if (typeof data.name === 'string') result.name = data.name;
  if (
    data.theme === 'oled' ||
    data.theme === 'white' ||
    data.theme === 'grey' ||
    data.theme === 'xp'
  ) {
    result.theme = data.theme;
  }
  if (typeof data.accent === 'string') result.accent = data.accent;
  if (typeof data.hide === 'boolean') result.hide = data.hide;
  if (typeof data.per === 'number') result.per = data.per;

  return result;
};

/**
 * Persiste o estado S no localStorage sob a chave K ('lumen.v1').
 */
export const save = (): void => {
  try {
    localStorage.setItem(K, JSON.stringify(S));
  } catch (e) {}
};

export type InstallmentBaseTx = {
  type: TransactionType;
  v: number;
  n: string;
  c: Category;
  d: string;
  pay?: PaymentMethod;
  tags?: string[];
  thirdParty?: ThirdPartyInfo;
  cardId?: string;
  accountId?: string;
  splitInfo?: BillSplitInfo;
};

/**
 * Função pura que gera N transações parceladas (de 2 a 72x), distribuindo
 * eventuais centavos de resto na primeira parcela, replicando thirdParty (se houver)
 * e atribuindo 'confirmed' para meses passados/vigente e 'pending' para meses futuros.
 */
export const createInstallments = (
  baseTx: InstallmentBaseTx,
  totalInstallments: number,
  referenceMonth: string = cur
): Transaction[] => {
  const total = Math.min(72, Math.max(2, Math.floor(totalInstallments)));
  const totalCents = Math.max(0, Math.round(baseTx.v));
  const basePart = Math.floor(totalCents / total);
  const remainder = totalCents - basePart * total;
  const groupId = crypto.randomUUID();
  const baseName = baseTx.n.trim() || 'Parcelamento';
  const pay = normalizePay(baseTx.pay);
  const tags = normalizeTags(baseTx.tags);
  const thirdParty = normalizeThirdParty(baseTx.thirdParty);

  const generated: Transaction[] = [];
  for (let i = 0; i < total; i++) {
    const current = i + 1;
    const installmentDate = addMonthsClamped(baseTx.d, i);
    const installmentYm = ym(installmentDate);
    const status: TransactionStatus =
      installmentYm <= referenceMonth ? 'confirmed' : 'pending';

    const item: Transaction = {
      id: crypto.randomUUID(),
      type: baseTx.type,
      v: i === 0 ? basePart + remainder : basePart,
      n: `${baseName} (${current}/${total})`,
      c: baseTx.c,
      d: installmentDate,
      pay,
      tags: [...tags],
      installments: {
        current,
        total,
        groupId
      },
      status
    };

    if (thirdParty) {
      item.thirdParty = {
        isThirdParty: true,
        personName: thirdParty.personName,
        isReimbursed: false
      };
    }
    if (baseTx.cardId) {
      item.cardId = baseTx.cardId;
    }
    if (baseTx.accountId) {
      item.accountId = baseTx.accountId;
    }
    if (baseTx.splitInfo) {
      item.splitInfo = baseTx.splitInfo;
    }

    generated.push(item);
  }

  return generated;
};

/**
 * Rotina de boot que percorre lançamentos marcados como recorrentes e materializa
 * automaticamente a movimentação do mês vigente caso ainda não exista para aquele groupId.
 */
export const materializeRecurring = (targetYm: string = cur): number => {
  const groups = new Map<string, Transaction[]>();

  for (const t of S.tx) {
    const gid = t.recurring?.groupId;
    if (!gid) continue;
    const list = groups.get(gid) || [];
    list.push(t);
    groups.set(gid, list);
  }

  let createdCount = 0;
  for (const [groupId, items] of groups.entries()) {
    const hasInTargetMonth = items.some((t) => ym(t.d) === targetYm);
    if (hasInTargetMonth) continue;

    const sorted = [...items].sort((a, b) => a.d.localeCompare(b.d));
    const earliest = sorted[0];
    if (!earliest || ym(earliest.d) > targetYm) continue;

    const template = items.find((t) => t.recurring?.isTemplate) || sorted[sorted.length - 1];
    const materializedDate = dateInMonthClamped(template.d, targetYm);
    const status: TransactionStatus = targetYm <= cur ? 'confirmed' : 'pending';

    const item: Transaction = {
      id: crypto.randomUUID(),
      type: template.type,
      v: template.v,
      n: template.n,
      c: template.c,
      d: materializedDate,
      pay: normalizePay(template.pay),
      tags: normalizeTags(template.tags),
      recurring: {
        groupId,
        frequency: 'monthly',
        isTemplate: false
      },
      status
    };
    if (template.thirdParty?.isThirdParty) {
      item.thirdParty = {
        isThirdParty: true,
        personName: template.thirdParty.personName,
        isReimbursed: false
      };
    }
    if (template.cardId) {
      item.cardId = template.cardId;
    }
    if (template.accountId) {
      item.accountId = template.accountId;
    }
    if (template.splitInfo) {
      item.splitInfo = template.splitInfo;
    }
    S.tx.push(item);
    createdCount++;
  }

  if (createdCount > 0) {
    save();
  }
  return createdCount;
};

/**
 * Retorna todas as despesas de terceiros ainda não reembolsadas (isThirdParty === true e isReimbursed === false).
 */
export const getPendingReimbursements = (): Transaction[] =>
  S.tx.filter(
    (t) =>
      t.type === 'out' &&
      t.thirdParty?.isThirdParty === true &&
      t.thirdParty.isReimbursed === false
  );

/**
 * Alterna o status de reembolso (isReimbursed) de uma compra de terceiro e persiste.
 */
export const toggleReimbursement = (txId: string): void => {
  const item = S.tx.find((t) => String(t.id) === String(txId));
  if (!item || !item.thirdParty?.isThirdParty) return;
  item.thirdParty = {
    ...item.thirdParty,
    isReimbursed: !item.thirdParty.isReimbursed
  };
  save();
};

/**
 * Confirma (quita) uma transação pendente (status = 'confirmed') e persiste.
 */
export const confirmTransaction = (txId: string): boolean => {
  const item = S.tx.find((t) => String(t.id) === String(txId));
  if (!item) return false;
  item.status = 'confirmed';
  save();
  return true;
};

/**
 * Calcula o histórico consolidado dos últimos 6 meses (ordem cronológica) para o painel de Estatísticas.
 */
export const getSemesterHistory = (referenceMonth: string = cur): MonthSummary[] => {
  const summaries: MonthSummary[] = [];
  for (let i = 5; i >= 0; i--) {
    const monthYear = prevM(referenceMonth, i);
    const monthTx = S.tx.filter(
      (t) => ym(t.d) === monthYear && (t.status === 'confirmed' || ym(t.d) === monthYear)
    );

    const totalIncomeCents = monthTx
      .filter((t) => t.type === 'in')
      .reduce((acc, t) => acc + t.v, 0);

    const totalPersonalExpenseCents = monthTx
      .filter((t) => t.type === 'out' && !t.thirdParty?.isThirdParty)
      .reduce((acc, t) => acc + t.v, 0);

    const totalThirdPartyExpenseCents = monthTx
      .filter((t) => t.type === 'out' && Boolean(t.thirdParty?.isThirdParty))
      .reduce((acc, t) => acc + t.v, 0);

    summaries.push({
      monthYear,
      totalIncomeCents,
      totalPersonalExpenseCents,
      totalThirdPartyExpenseCents,
      netSavingsCents: totalIncomeCents - totalPersonalExpenseCents
    });
  }
  return summaries;
};

/**
 * Retorna os dados diários (DaySummary[]) da grade completa de um mês (35 ou 42 dias).
 * Despesas de terceiros já quitadas não contam como despesa do dia.
 * Marca isNoSpendDay apenas para dias passados até hoje do mês exibido sem despesas pessoais.
 */
export const getCalendarDays = (year: number, month: number): DaySummary[] => {
  const matrix = getMonthCalendarMatrix(year, month);
  const todayStr = toIsoDate(now);

  return matrix.map((dateObj): DaySummary => {
    const dateStr = toIsoDate(dateObj);
    const dayNumber = dateObj.getDate();
    const isCurrentMonth =
      dateObj.getFullYear() === year && dateObj.getMonth() === month - 1;
    const isToday = dateStr === todayStr;

    const transactions = S.tx.filter((t) => t.d === dateStr);

    const totalExpenseCents = transactions
      .filter(
        (t) =>
          t.type === 'out' &&
          !(t.thirdParty?.isThirdParty && t.thirdParty.isReimbursed)
      )
      .reduce((acc, t) => acc + t.v, 0);

    const personalExpenseCents = transactions
      .filter((t) => t.type === 'out' && !t.thirdParty?.isThirdParty)
      .reduce((acc, t) => acc + t.v, 0);

    const totalIncomeCents = transactions
      .filter((t) => t.type === 'in')
      .reduce((acc, t) => acc + t.v, 0);

    const hasPendingBills = transactions.some(
      (t) => t.type === 'out' && t.status === 'pending'
    );

    const isNoSpendDay =
      isCurrentMonth &&
      dateStr <= todayStr &&
      totalExpenseCents === 0 &&
      personalExpenseCents === 0;

    return {
      dateStr,
      dayNumber,
      isCurrentMonth,
      isToday,
      totalExpenseCents,
      totalIncomeCents,
      hasPendingBills,
      isNoSpendDay,
      transactions
    };
  });
};

/**
 * Retorna contas a vencer (status === 'pending') vencidas ou dentro dos próximos limitDays dias.
 */
export const getUpcomingBills = (limitDays = 7): UpcomingBill[] => {
  const todayStr = toIsoDate(now);
  const todayNoon = new Date(todayStr + 'T12:00:00').getTime();

  const bills: UpcomingBill[] = [];
  for (const tx of S.tx) {
    if (tx.type !== 'out' || tx.status !== 'pending') continue;
    const dueNoon = new Date(tx.d + 'T12:00:00').getTime();
    if (Number.isNaN(dueNoon)) continue;

    const daysUntilDue = Math.round((dueNoon - todayNoon) / 864e5);
    if (daysUntilDue <= limitDays) {
      bills.push({
        tx,
        daysUntilDue,
        isOverdue: daysUntilDue < 0
      });
    }
  }

  return bills.sort((a, b) => a.daysUntilDue - b.daysUntilDue);
};

/**
 * Remove acentos e converte string para minúsculas para busca insensível a acentos.
 */
const stripAccents = (str: string): string =>
  str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/**
 * Filtra e ordena as movimentações de S.tx conforme múltiplos critérios combinados.
 */
export const filterTransactions = (
  filters: TransactionFilters
): FilteredTransactionsResult => {
  const normQuery = stripAccents((filters.query || '').trim());
  const filterType = filters.type && filters.type !== 'all' ? filters.type : null;
  const rawCat = (filters.categoryId || '').trim();
  const filterCat = rawCat && rawCat !== 'all' ? rawCat : null;
  const matchedCatObj = filterCat
    ? [...S.cats.out, ...S.cats.in].find(
        (c) =>
          c.id === filterCat || c.name.toLowerCase() === filterCat.toLowerCase()
      )
    : undefined;

  const filterPay =
    filters.paymentMethod && filters.paymentMethod !== 'all'
      ? filters.paymentMethod
      : null;
  const rawTag = (filters.tag || '').trim();
  const filterTag = rawTag && rawTag !== 'all' ? normalizeTag(rawTag) : null;
  const rawCard = (filters.cardId || '').trim();
  const filterCard = rawCard && rawCard !== 'all' ? rawCard : null;
  const rawAccount = (filters.accountId || '').trim();
  const filterAccount = rawAccount && rawAccount !== 'all' ? rawAccount : null;
  const startDate = (filters.startDate || '').trim();
  const endDate = (filters.endDate || '').trim();
  const onlyPending = Boolean(filters.onlyPending);
  const onlyThirdParty = Boolean(filters.onlyThirdParty);

  const items = S.tx
    .filter((t) => {
      if (normQuery) {
        const inName = stripAccents(t.n || '').includes(normQuery);
        const inNotes = t.notes
          ? stripAccents(t.notes).includes(normQuery)
          : false;
        if (!inName && !inNotes) return false;
      }

      if (filterType && t.type !== filterType) {
        return false;
      }

      if (filterCat) {
        const txCatLower = (t.c || '').toLowerCase();
        const matchesDirect =
          txCatLower === filterCat.toLowerCase() || t.c === filterCat;
        const matchesResolved = matchedCatObj
          ? txCatLower === matchedCatObj.name.toLowerCase() ||
            t.c === matchedCatObj.id
          : false;
        if (!matchesDirect && !matchesResolved) return false;
      }

      if (filterPay && normalizePay(t.pay) !== filterPay) {
        return false;
      }

      if (filterCard && t.cardId !== filterCard) {
        return false;
      }

      if (filterAccount && t.accountId !== filterAccount) {
        return false;
      }

      if (filterTag) {
        const txTags = normalizeTags(t.tags);
        if (!txTags.includes(filterTag)) return false;
      }

      if (startDate && t.d < startDate) {
        return false;
      }

      if (endDate && t.d > endDate) {
        return false;
      }

      if (onlyPending && t.status !== 'pending') {
        return false;
      }

      if (onlyThirdParty && !t.thirdParty?.isThirdParty) {
        return false;
      }

      return true;
    })
    .slice()
    .reverse()
    .sort((a, b) => b.d.localeCompare(a.d));

  const totalIncomeCents = items
    .filter((t) => t.type === 'in')
    .reduce((acc, t) => acc + t.v, 0);

  const totalExpenseCents = items
    .filter((t) => t.type === 'out')
    .reduce((acc, t) => acc + t.v, 0);

  return {
    items,
    totalCount: items.length,
    totalExpenseCents,
    totalIncomeCents,
    balanceCents: totalIncomeCents - totalExpenseCents
  };
};

/**
 * Carrega o estado persistido do localStorage para o objeto S e materializa recorrências.
 */
export const get = (): AppState => {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(K) || '{}');
    Object.assign(S, migrate(raw));
    materializeRecurring();
  } catch (e) {
    S.cats = cloneDefaultCategories();
    S.budgets = {};
    S.goalCents = 0;
    S.cards = [];
    S.debts = [];
    S.accounts = DEFAULT_ACCOUNTS.map((a) => ({ ...a }));
    S.frequentPeople = [];
    S.paidInvoices = [];
    S.quickShortcuts = [];
    S.roundUpEnabled = false;
  }
  return S;
};

/**
 * Adiciona uma nova categoria personalizada ao tipo informado ('in' | 'out') e persiste.
 */
export const addCategory = (
  type: TransactionType,
  name: string,
  icon = '📦'
): boolean => {
  if (type !== 'in' && type !== 'out') return false;
  const trimmedName = name.trim();
  if (!trimmedName) return false;

  const list = S.cats[type];
  const duplicate = list.some(
    (c) => c.name.toLowerCase() === trimmedName.toLowerCase()
  );
  if (duplicate) return false;

  const cleanIcon = icon.trim() || '📦';
  list.push({
    id: crypto.randomUUID(),
    name: trimmedName,
    icon: cleanIcon,
    isDefault: false
  });
  save();
  return true;
};

/**
 * Remove uma categoria pelo id (ou nome), bloqueando exclusão se houver transações
 * atreladas ou se for a única categoria default restante. Limpa orçamentos órfãos.
 */
export const removeCategory = (type: TransactionType, id: string): boolean => {
  if (type !== 'in' && type !== 'out') return false;
  const list = S.cats[type];
  if (list.length <= 1) return false;

  const target = list.find((c) => c.id === id || c.name === id);
  if (!target) return false;

  const defaultCount = list.filter((c) => c.isDefault).length;
  if (target.isDefault && defaultCount <= 1) {
    return false;
  }

  const hasLinkedTx = S.tx.some(
    (t) =>
      t.type === type &&
      (t.c.toLowerCase() === target.name.toLowerCase() || t.c === target.id)
  );
  if (hasLinkedTx) {
    return false;
  }

  S.cats[type] = list.filter((c) => c.id !== target.id);
  delete S.budgets[target.id];
  delete S.budgets[target.name];
  delete S.budgets[target.name.toLowerCase()];
  save();
  return true;
};

/**
 * Define ou atualiza o teto de orçamento mensal (em centavos) para uma categoria.
 */
export const setCategoryBudget = (categoryId: string, limitCents: number): void => {
  const rawKey = categoryId.trim();
  if (!rawKey) return;

  const matchedCat = S.cats.out.find(
    (c) => c.id === rawKey || c.name.toLowerCase() === rawKey.toLowerCase()
  );
  const key = matchedCat ? matchedCat.id : rawKey;

  if (!(limitCents > 0)) {
    removeCategoryBudget(rawKey);
    return;
  }

  if (matchedCat) {
    delete S.budgets[matchedCat.name];
    delete S.budgets[matchedCat.name.toLowerCase()];
  }
  S.budgets[key] = { limitCents: Math.round(limitCents) };
  save();
};

/**
 * Remove o orçamento mensal configurado para uma categoria.
 */
export const removeCategoryBudget = (categoryId: string): void => {
  const rawKey = categoryId.trim();
  if (!rawKey) return;

  const matchedCat = S.cats.out.find(
    (c) => c.id === rawKey || c.name.toLowerCase() === rawKey.toLowerCase()
  );

  delete S.budgets[rawKey];
  delete S.budgets[rawKey.toLowerCase()];
  if (matchedCat) {
    delete S.budgets[matchedCat.id];
    delete S.budgets[matchedCat.name];
    delete S.budgets[matchedCat.name.toLowerCase()];
  }
  save();
};

/**
 * Define a meta mensal de economia líquida em centavos.
 */
export const setSavingsGoal = (goalCents: number): void => {
  S.goalCents = goalCents > 0 ? Math.round(goalCents) : 0;
  save();
};

/**
 * Calcula o progresso de gastos PESSOAIS acumulados por categoria orçada no mês (YYYY-MM).
 * Compras de terceiros (thirdParty.isThirdParty) não inflam o teto de orçamento pessoal.
 */
export const getCategoryBudgetsProgress = (monthYear: string): BudgetProgress[] => {
  const monthOut = S.tx.filter(
    (t) =>
      t.type === 'out' &&
      t.d.slice(0, 7) === monthYear &&
      !t.thirdParty?.isThirdParty
  );

  const progresses: BudgetProgress[] = [];
  const handledKeys = new Set<string>();

  for (const cat of S.cats.out) {
    const budget =
      S.budgets[cat.id] ||
      S.budgets[cat.name] ||
      S.budgets[cat.name.toLowerCase()];
    if (!budget || !(budget.limitCents > 0)) continue;

    handledKeys.add(cat.id);
    handledKeys.add(cat.name);
    handledKeys.add(cat.name.toLowerCase());

    const spentCents = monthOut
      .filter(
        (t) =>
          t.c.toLowerCase() === cat.name.toLowerCase() || t.c === cat.id
      )
      .reduce((acc, t) => acc + t.v, 0);

    const percentage = (spentCents / budget.limitCents) * 100;
    progresses.push({
      categoryId: cat.id,
      categoryName: cat.name,
      spentCents,
      limitCents: budget.limitCents,
      percentage,
      isOverBudget: spentCents > budget.limitCents
    });
  }

  for (const [key, budget] of Object.entries(S.budgets)) {
    if (handledKeys.has(key) || !(budget.limitCents > 0)) continue;
    const spentCents = monthOut
      .filter((t) => t.c.toLowerCase() === key.toLowerCase() || t.c === key)
      .reduce((acc, t) => acc + t.v, 0);
    const percentage = (spentCents / budget.limitCents) * 100;
    progresses.push({
      categoryId: key,
      categoryName: key,
      spentCents,
      limitCents: budget.limitCents,
      percentage,
      isOverBudget: spentCents > budget.limitCents
    });
  }

  return progresses;
};

export type CreateTxInput = Omit<Transaction, 'id' | 'pay' | 'tags' | 'status'> & {
  id?: string;
  pay?: PaymentMethod;
  tags?: string[];
  status?: TransactionStatus;
};

/**
 * Cria uma nova movimentação com UUID, valida pay/tags/status/thirdParty, adiciona a S.tx e persiste.
 */
export const addTx = (fields: CreateTxInput): Transaction => {
  const inferredStatus: TransactionStatus =
    fields.status ?? (ym(fields.d) > cur ? 'pending' : 'confirmed');
  const thirdParty = normalizeThirdParty(fields.thirdParty);
  const tx: Transaction = {
    ...fields,
    id: fields.id || crypto.randomUUID(),
    pay: normalizePay(fields.pay),
    tags: normalizeTags(fields.tags),
    thirdParty,
    status: inferredStatus
  };
  if (!thirdParty) {
    delete tx.thirdParty;
  }
  S.tx.push(tx);
  save();
  return tx;
};

/**
 * Busca uma movimentação pelo id em S.tx, atualiza seus campos validando pay/tags/status/thirdParty e persiste.
 */
export const updateTx = (id: string, data: Partial<Transaction>): void => {
  const item = S.tx.find((t) => String(t.id) === String(id));
  if (!item) return;

  const updated: Partial<Transaction> = { ...data };
  if ('pay' in data) {
    updated.pay = normalizePay(data.pay);
  }
  if ('tags' in data) {
    updated.tags = normalizeTags(data.tags);
  }
  if ('status' in data && data.status) {
    updated.status = normalizeStatus(data.status);
  }
  if ('thirdParty' in data) {
    updated.thirdParty = normalizeThirdParty(data.thirdParty);
  }

  Object.assign(item, updated, {
    id: item.id,
    pay: normalizePay(updated.pay ?? item.pay),
    tags: normalizeTags(updated.tags ?? item.tags),
    status: normalizeStatus(updated.status ?? item.status)
  });

  if ('thirdParty' in data && !updated.thirdParty) {
    delete item.thirdParty;
  }
  save();
};

/**
 * Remove dívidas vinculadas a uma divisão de despesa para evitar dívidas órfãs.
 */
export const cleanupSplitDebts = (splitInfo?: BillSplitInfo): void => {
  if (!splitInfo || !Array.isArray(splitInfo.participants)) return;
  const debtIds = splitInfo.participants
    .map((p) => p.debtId)
    .filter((id): id is string => Boolean(id));
  if (debtIds.length > 0) {
    S.debts = S.debts.filter((d) => !debtIds.includes(d.id));
  }
};

/**
 * Remove uma movimentação pelo id de S.tx e persiste.
 */
export const deleteTx = (id: string): void => {
  const item = S.tx.find((t) => String(t.id) === String(id));
  if (item?.splitInfo) {
    cleanupSplitDebts(item.splitInfo);
  }
  S.tx = S.tx.filter((t) => String(t.id) !== String(id));
  save();
};

/* ==========================================================================
   Cartões de Crédito
   ========================================================================== */

export type CardInput = Omit<CreditCard, 'id'>;

/**
 * Cadastra um cartão de crédito e persiste.
 */
export const addCard = (input: CardInput): CreditCard => {
  const [card] = normalizeCards([{ ...input, id: crypto.randomUUID() }]);
  S.cards.push(card);
  save();
  return card;
};

/**
 * Atualiza os dados de um cartão existente e persiste.
 */
export const updateCard = (id: string, input: CardInput): boolean => {
  const idx = S.cards.findIndex((c) => c.id === id);
  if (idx < 0) return false;
  const [card] = normalizeCards([{ ...input, id }]);
  if (!card) return false;
  S.cards[idx] = card;
  save();
  return true;
};

/**
 * Remove um cartão, desvinculando suas movimentações e atalhos.
 */
export const removeCard = (id: string): void => {
  S.cards = S.cards.filter((c) => c.id !== id);
  for (const t of S.tx) {
    if (t.cardId === id) delete t.cardId;
  }
  for (const sc of S.quickShortcuts) {
    if (sc.cardId === id) delete sc.cardId;
  }
  save();
};

/* ==========================================================================
   Central de Dívidas e Empréstimos
   ========================================================================== */

export type DebtInput = Omit<
  DebtRecord,
  'id' | 'paidAmountCents' | 'payments' | 'status' | 'createdAt'
>;

/**
 * Registra uma nova dívida/empréstimo (a receber ou a pagar) e persiste.
 */
export const addDebt = (debt: DebtInput): void => {
  const original = Math.round(debt.originalAmountCents);
  const personName = debt.personName.trim();
  if (!(original > 0) || !personName) return;
  const record: DebtRecord = {
    id: crypto.randomUUID(),
    personName,
    type: debt.type,
    originalAmountCents: original,
    paidAmountCents: 0,
    payments: [],
    description: debt.description.trim(),
    status: 'active',
    createdAt: toIsoDate(now)
  };
  if (debt.dueDate) record.dueDate = debt.dueDate;
  if (debt.pixKey && debt.pixKey.trim()) record.pixKey = debt.pixKey.trim();
  S.debts.push(record);
  save();
};

/**
 * Registra um pagamento (amortização) parcial ou total. Quando atingir o valor original,
 * marca a dívida como 'settled'. Se registerAsIncome e a dívida for 'to_receive',
 * lança automaticamente um ganho em S.tx, associando à conta de destino se fornecida.
 */
export const amortizeDebt = (
  debtId: string,
  amountCents: number,
  registerAsIncome = false,
  accountId?: string
): void => {
  const debt = S.debts.find((d) => d.id === debtId);
  const amount = Math.round(amountCents);
  if (!debt || debt.status === 'settled' || !(amount > 0)) return;

  const today = toIsoDate(now);
  debt.payments.push({ id: crypto.randomUUID(), amountCents: amount, date: today });
  debt.paidAmountCents += amount;
  if (debt.paidAmountCents >= debt.originalAmountCents) {
    debt.status = 'settled';
  }

  const selectedAccountId =
    accountId ||
    (typeof document !== 'undefined'
      ? document.querySelector<HTMLSelectElement>('#am-account')?.value
      : undefined);

  if (registerAsIncome && debt.type === 'to_receive') {
    const inCat = S.cats.in.find((c) => c.name === 'Outros') || S.cats.in[0];
    const incomeTx: Transaction = {
      id: crypto.randomUUID(),
      type: 'in',
      v: amount,
      n: `Recebimento: ${debt.personName}`,
      c: (inCat ? inCat.name : 'Outros') as Category,
      d: today,
      pay: 'pix',
      tags: ['divida'],
      status: 'confirmed'
    };
    if (selectedAccountId) {
      incomeTx.accountId = selectedAccountId;
    }
    S.tx.push(incomeTx);
  } else if (registerAsIncome && debt.type === 'to_pay') {
    const outCat = S.cats.out.find((c) => c.name === 'Outros') || S.cats.out[0];
    const expenseTx: Transaction = {
      id: crypto.randomUUID(),
      type: 'out',
      v: amount,
      n: `Pagamento dívida: ${debt.personName}`,
      c: (outCat ? outCat.name : 'Outros') as Category,
      d: today,
      pay: 'pix',
      tags: ['divida'],
      status: 'confirmed'
    };
    if (selectedAccountId) {
      expenseTx.accountId = selectedAccountId;
    }
    S.tx.push(expenseTx);
  }
  save();
};

/**
 * Liquida todas as dívidas ativas de uma pessoa específica, com opção de registrar movimentação no extrato.
 */
export const settleAllDebtsOfPerson = (
  personName: string,
  debtType: DebtType,
  registerInLedger = false,
  accountId?: string
): { totalSettledCents: number; settledCount: number } => {
  const target = personName.trim().toLowerCase();
  const today = toIsoDate(now);
  let totalSettledCents = 0;
  let settledCount = 0;

  for (const d of S.debts) {
    if (d.status !== 'active' || d.type !== debtType || d.personName.trim().toLowerCase() !== target) continue;
    const rem = debtRemaining(d);
    if (rem > 0) {
      d.payments.push({
        id: crypto.randomUUID(),
        amountCents: rem,
        date: today,
        notes: 'Liquidação total'
      });
      d.paidAmountCents += rem;
      d.status = 'settled';
      totalSettledCents += rem;
      settledCount++;
    }
  }

  if (registerInLedger && totalSettledCents > 0) {
    const selectedAccountId =
      accountId ||
      (typeof document !== 'undefined'
        ? document.querySelector<HTMLSelectElement>('#st-account')?.value
        : undefined);

    if (debtType === 'to_receive') {
      const inCat = S.cats.in.find((c) => c.name === 'Outros') || S.cats.in[0];
      const incomeTx: Transaction = {
        id: crypto.randomUUID(),
        type: 'in',
        v: totalSettledCents,
        n: `Recebimento total: ${personName.trim()}`,
        c: (inCat ? inCat.name : 'Outros') as Category,
        d: today,
        pay: 'pix',
        tags: ['divida'],
        status: 'confirmed'
      };
      if (selectedAccountId) incomeTx.accountId = selectedAccountId;
      S.tx.push(incomeTx);
    } else {
      const outCat = S.cats.out.find((c) => c.name === 'Outros') || S.cats.out[0];
      const expenseTx: Transaction = {
        id: crypto.randomUUID(),
        type: 'out',
        v: totalSettledCents,
        n: `Pagamento total dívida: ${personName.trim()}`,
        c: (outCat ? outCat.name : 'Outros') as Category,
        d: today,
        pay: 'pix',
        tags: ['divida'],
        status: 'confirmed'
      };
      if (selectedAccountId) expenseTx.accountId = selectedAccountId;
      S.tx.push(expenseTx);
    }
  }

  save();
  return { totalSettledCents, settledCount };
};

/**
 * Remove uma dívida do livro e persiste.
 */
export const removeDebt = (debtId: string): void => {
  S.debts = S.debts.filter((d) => d.id !== debtId);
  save();
};

/**
 * Saldo restante de uma dívida em centavos.
 */
export const debtRemaining = (debt: DebtRecord): number =>
  Math.max(0, debt.originalAmountCents - debt.paidAmountCents);

/**
 * Totais agregados das dívidas ativas: a receber vs. a pagar.
 */
export const getDebtTotals = (): { toReceiveCents: number; toPayCents: number } => {
  let toReceiveCents = 0;
  let toPayCents = 0;
  for (const d of S.debts) {
    if (d.status !== 'active') continue;
    if (d.type === 'to_receive') toReceiveCents += debtRemaining(d);
    else toPayCents += debtRemaining(d);
  }
  return { toReceiveCents, toPayCents };
};

export type { DebtType };

/* ==========================================================================
   Atalhos Rápidos, Cofrinho e Histórico por Estabelecimento
   ========================================================================== */

/**
 * Adiciona um atalho rápido de 1 toque e persiste.
 */
export const addShortcut = (input: Omit<QuickShortcut, 'id'>): void => {
  const [sc] = normalizeShortcuts([{ ...input, id: crypto.randomUUID() }]);
  if (!sc) return;
  S.quickShortcuts.push(sc);
  save();
};

/**
 * Remove um atalho rápido e persiste.
 */
export const removeShortcut = (id: string): void => {
  S.quickShortcuts = S.quickShortcuts.filter((s) => s.id !== id);
  save();
};

/**
 * Registra imediatamente o gasto de um atalho rápido. Retorna a transação criada.
 */
export const runShortcut = (id: string): Transaction | null => {
  const sc = S.quickShortcuts.find((s) => s.id === id);
  if (!sc) return null;
  const cat =
    S.cats.out.find((c) => c.id === sc.categoryId || c.name === sc.categoryId) ||
    S.cats.out[0];
  const fields: CreateTxInput = {
    type: 'out',
    v: sc.amountCents,
    n: sc.label,
    c: (cat ? cat.name : 'Outros') as Category,
    d: toIsoDate(now),
    pay: sc.paymentMethod,
    tags: []
  };
  if (sc.cardId && sc.paymentMethod === 'credit' && S.cards.some((c) => c.id === sc.cardId)) {
    fields.cardId = sc.cardId;
  }
  return addTx(fields);
};

/**
 * Total acumulado no cofrinho de arredondamento para as despesas pessoais confirmadas do mês.
 */
export const getRoundUpTotal = (monthYear: string = cur): number =>
  S.tx
    .filter(
      (t) =>
        t.type === 'out' &&
        !t.thirdParty?.isThirdParty &&
        t.status === 'confirmed' &&
        ym(t.d) === monthYear
    )
    .reduce((acc, t) => acc + calculateRoundUp(t.v), 0);

/**
 * Localiza o último lançamento de despesa cujo nome corresponde (sem acentos/caixa) ao informado.
 */
export const findLastByName = (name: string, excludeId?: string): Transaction | null => {
  const q = stripAccents(name.trim());
  if (q.length < 2) return null;
  let exact: Transaction | null = null;
  let prefix: Transaction | null = null;
  for (const t of S.tx) {
    if (t.type !== 'out' || (excludeId && String(t.id) === String(excludeId))) continue;
    const n = stripAccents(t.n.replace(/\s*\(\d+\/\d+\)\s*$/, ''));
    if (n === q) {
      if (!exact || t.d >= exact.d) exact = t;
    } else if (n.startsWith(q)) {
      if (!prefix || t.d >= prefix.d) prefix = t;
    }
  }
  return exact || prefix;
};

/* ==========================================================================
   Contas Bancárias e Carteiras
   ========================================================================== */

/**
 * Cadastra uma nova conta bancária ou carteira e persiste.
 */
export const addAccount = (
  name: string,
  icon: string,
  color: string,
  initialBalanceCents: number
): BankAccount => {
  const account: BankAccount = {
    id: crypto.randomUUID(),
    name: name.trim(),
    icon: icon.trim() || '🏦',
    color: /^#[0-9a-f]{6}$/i.test(color) ? color : '#8b5cf6',
    initialBalanceCents: Math.round(initialBalanceCents) || 0,
    isDefault: S.accounts.length === 0
  };
  S.accounts.push(account);
  save();
  return account;
};

/**
 * Remove uma conta bancária se houver mais de uma cadastrada, desvinculando movimentações e cartões.
 */
export const removeAccount = (id: string): boolean => {
  if (S.accounts.length <= 1) return false;
  const target = S.accounts.find((a) => a.id === id);
  if (!target) return false;
  S.accounts = S.accounts.filter((a) => a.id !== id);
  if (target.isDefault && S.accounts.length > 0) {
    S.accounts[0].isDefault = true;
  }
  for (const t of S.tx) {
    if (t.accountId === id) delete t.accountId;
  }
  for (const c of S.cards) {
    if (c.linkedAccountId === id) delete c.linkedAccountId;
  }
  for (const sc of S.quickShortcuts) {
    if (sc.accountId === id) delete sc.accountId;
  }
  save();
  return true;
};

/**
 * Retorna uma conta bancária pelo seu identificador.
 */
export const getAccountById = (id?: string): BankAccount | undefined => {
  if (!id) return undefined;
  return S.accounts.find((a) => a.id === id);
};

/**
 * Calcula o saldo consolidado atual de cada conta bancária cadastrada:
 * saldo inicial + ganhos confirmados - despesas confirmadas (exceto compras no crédito não pagas).
 */
export const getAccountBalances = (): Array<{
  account: BankAccount;
  currentBalanceCents: number;
}> => {
  return S.accounts.map((account) => {
    let balance = account.initialBalanceCents;
    for (const t of S.tx) {
      if (t.accountId !== account.id || t.status !== 'confirmed') continue;
      if (t.type === 'in') {
        balance += t.v;
      } else if (t.type === 'out') {
        if (t.pay !== 'credit') {
          balance -= t.v;
        }
      }
    }
    return {
      account,
      currentBalanceCents: balance
    };
  });
};

/* ==========================================================================
   Rachador de Contas Integrado com Dívidas
   ========================================================================== */

/**
 * Salva uma movimentação dividida com amigos, criando dívidas automáticas para cada participante
 * e registrando apenas a cota pessoal na movimentação para não inflar o orçamento.
 */
export const saveTransactionWithSplit = (
  txData: Omit<Transaction, 'id'>,
  splitInfo: BillSplitInfo
): { myTxId: string; createdDebtIds: string[] } => {
  const meParticipant = splitInfo.participants.find((p) => p.isMe);
  const myAmountCents = meParticipant ? meParticipant.amountCents : txData.v;
  const totalPurchaseCents =
    splitInfo.totalPurchaseCents ||
    splitInfo.participants.reduce((a, p) => a + p.amountCents, 0);

  const createdDebtIds: string[] = [];
  const updatedParticipants = splitInfo.participants.map((p) => {
    if (p.isMe || !(p.amountCents > 0)) {
      return { ...p };
    }
    const debtId = crypto.randomUUID();
    const newDebt: DebtRecord = {
      id: debtId,
      personName: p.name.trim(),
      type: 'to_receive',
      originalAmountCents: p.amountCents,
      paidAmountCents: 0,
      payments: [],
      description: `${txData.n} (Divisão)`,
      status: 'active',
      createdAt: toIsoDate(now)
    };
    if (p.pixKey?.trim() || S.defaultPixKey?.trim()) {
      newDebt.pixKey = p.pixKey?.trim() || S.defaultPixKey?.trim();
    }
    S.debts.push(newDebt);
    createdDebtIds.push(debtId);

    const cleanName = p.name.trim();
    if (cleanName && !S.frequentPeople.includes(cleanName)) {
      S.frequentPeople.push(cleanName);
    }

    return { ...p, debtId };
  });

  const txId = crypto.randomUUID();
  const tx: Transaction = {
    ...txData,
    id: txId,
    v: myAmountCents,
    splitInfo: {
      ...splitInfo,
      totalPurchaseCents,
      participants: updatedParticipants
    }
  };

  S.tx.push(tx);
  save();

  return { myTxId: txId, createdDebtIds };
};

export const splitBillAndCreateDebts = saveTransactionWithSplit;

/* ==========================================================================
   Compensação Mútua de Dívidas ("Encontro de Contas")
   ========================================================================== */

/**
 * Identifica se a mesma pessoa possui valores pendentes em "Quem me deve" e "A quem devo".
 */
export const getMutualDebtCompensation = (
  personName: string
): {
  toReceiveCents: number;
  toPayCents: number;
  netDifferenceCents: number;
  canCompensate: boolean;
} => {
  const target = personName.trim().toLowerCase();
  if (!target) {
    return { toReceiveCents: 0, toPayCents: 0, netDifferenceCents: 0, canCompensate: false };
  }
  let toReceiveCents = 0;
  let toPayCents = 0;
  for (const d of S.debts) {
    if (d.status !== 'active' || d.personName.trim().toLowerCase() !== target) continue;
    const rem = debtRemaining(d);
    if (d.type === 'to_receive') toReceiveCents += rem;
    else if (d.type === 'to_pay') toPayCents += rem;
  }
  const canCompensate = toReceiveCents > 0 && toPayCents > 0;
  const netDifferenceCents = Math.abs(toReceiveCents - toPayCents);
  return { toReceiveCents, toPayCents, netDifferenceCents, canCompensate };
};

/**
 * Abate o valor menor do maior entre dívidas cruzadas com a mesma pessoa ("Encontro de Contas").
 */
export const settleMutualDebt = (personName: string): boolean => {
  const comp = getMutualDebtCompensation(personName);
  if (!comp.canCompensate) return false;

  const compAmount = Math.min(comp.toReceiveCents, comp.toPayCents);
  const target = personName.trim().toLowerCase();
  const today = toIsoDate(now);

  let leftToReceive = compAmount;
  for (const d of S.debts) {
    if (d.status !== 'active' || d.type !== 'to_receive' || d.personName.trim().toLowerCase() !== target) continue;
    if (leftToReceive <= 0) break;
    const rem = debtRemaining(d);
    const deduct = Math.min(rem, leftToReceive);
    d.payments.push({
      id: crypto.randomUUID(),
      amountCents: deduct,
      date: today,
      notes: 'Compensação mútua (Encontro de contas)'
    });
    d.paidAmountCents += deduct;
    if (d.paidAmountCents >= d.originalAmountCents) {
      d.status = 'settled';
    }
    leftToReceive -= deduct;
  }

  let leftToPay = compAmount;
  for (const d of S.debts) {
    if (d.status !== 'active' || d.type !== 'to_pay' || d.personName.trim().toLowerCase() !== target) continue;
    if (leftToPay <= 0) break;
    const rem = debtRemaining(d);
    const deduct = Math.min(rem, leftToPay);
    d.payments.push({
      id: crypto.randomUUID(),
      amountCents: deduct,
      date: today,
      notes: 'Compensação mútua (Encontro de contas)'
    });
    d.paidAmountCents += deduct;
    if (d.paidAmountCents >= d.originalAmountCents) {
      d.status = 'settled';
    }
    leftToPay -= deduct;
  }

  save();
  return true;
};

/**
 * Retorna todos os contatos que possuem dívidas mútuas ativas passíveis de compensação.
 */
export const getMutualDebtCandidates = (): Array<{
  personName: string;
  toReceiveCents: number;
  toPayCents: number;
  netDifferenceCents: number;
}> => {
  const people = new Set<string>();
  for (const d of S.debts) {
    if (d.status === 'active') people.add(d.personName.trim());
  }
  const result: Array<{
    personName: string;
    toReceiveCents: number;
    toPayCents: number;
    netDifferenceCents: number;
  }> = [];
  for (const person of people) {
    const comp = getMutualDebtCompensation(person);
    if (comp.canCompensate) {
      result.push({
        personName: person,
        toReceiveCents: comp.toReceiveCents,
        toPayCents: comp.toPayCents,
        netDifferenceCents: comp.netDifferenceCents
      });
    }
  }
  return result;
};

/**
 * Limpa todas as movimentações, restaura categorias, orçamentos e metas no localStorage.
 */
export const resetState = (): void => {
  try {
    localStorage.removeItem(K);
  } catch (x) {}
  S.tx = [];
  S.cats = cloneDefaultCategories();
  S.budgets = {};
  S.goalCents = 0;
  S.cards = [];
  S.debts = [];
  S.accounts = DEFAULT_ACCOUNTS.map((a) => ({ ...a }));
  S.frequentPeople = [];
  S.quickShortcuts = [];
  S.roundUpEnabled = false;
  S.hasCompletedOnboarding = false;
  S.paidInvoices = [];
  delete S.defaultPixKey;
  save();
};

// Hidrata o estado imediatamente na carga do módulo
get();
