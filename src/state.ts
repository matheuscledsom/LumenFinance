/* ==========================================================================
   state.ts — Estado Central (S), Persistência, Categorias, Orçamentos, Parcelas e Calendário
   ========================================================================== */

import {
  DEFAULT_CATEGORIES,
  cloneDefaultCategories,
  isValidPaymentMethod,
  type AppState,
  type BudgetProgress,
  type CategoriesState,
  type Category,
  type CategoryBudget,
  type CategoryItem,
  type DaySummary,
  type InstallmentInfo,
  type MonthSummary,
  type PaymentMethod,
  type RecurringInfo,
  type Theme,
  type ThirdPartyInfo,
  type Transaction,
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
  goalCents: 0
};

export let view: ViewName = 'home';

export const setView = (v: ViewName): void => {
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
      goalCents: 0
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

  const result: Partial<AppState> = { tx, cats, budgets, goalCents };
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
 * Remove uma movimentação pelo id de S.tx e persiste.
 */
export const deleteTx = (id: string): void => {
  S.tx = S.tx.filter((t) => String(t.id) !== String(id));
  save();
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
  save();
};

// Hidrata o estado imediatamente na carga do módulo
get();
