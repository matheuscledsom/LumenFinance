/* ==========================================================================
   types/finance.ts — Contratos de Domínio Financeiro, Categorias, Orçamentos e Calendário
   ========================================================================== */

export type Theme = 'oled' | 'white' | 'grey' | 'xp';

export type TransactionType = 'in' | 'out';

export type TransactionStatus = 'confirmed' | 'pending';

export type RecurringFrequency = 'monthly';

export type InstallmentInput = {
  totalInstallments: number;
  totalAmountCents: number;
};

export interface InstallmentInfo {
  current: number;
  total: number;
  groupId: string;
}

export interface RecurringInfo {
  groupId: string;
  frequency: RecurringFrequency;
  isTemplate?: boolean;
}

export interface ThirdPartyInfo {
  isThirdParty: boolean;
  personName: string;
  isReimbursed: boolean;
}

export interface MonthSummary {
  monthYear: string;
  totalIncomeCents: number;
  totalPersonalExpenseCents: number;
  totalThirdPartyExpenseCents: number;
  netSavingsCents: number;
}

export interface DaySummary {
  dateStr: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  totalExpenseCents: number;
  totalIncomeCents: number;
  hasPendingBills: boolean;
  isNoSpendDay: boolean;
  transactions: Transaction[];
}

export interface UpcomingBill {
  tx: Transaction;
  daysUntilDue: number;
  isOverdue: boolean;
}

export interface CategoryItem {
  id: string;
  name: string;
  icon: string;
  isDefault?: boolean;
}

export interface CategoriesState {
  in: CategoryItem[];
  out: CategoryItem[];
}

export interface CategoryBudget {
  limitCents: number;
}

export interface BudgetProgress {
  categoryId: string;
  categoryName: string;
  spentCents: number;
  limitCents: number;
  percentage: number;
  isOverBudget: boolean;
}

export const DEFAULT_CATEGORIES: CategoriesState = {
  out: [
    { id: 'out-alimentacao', name: 'Alimentação', icon: '🍽', isDefault: true },
    { id: 'out-transporte', name: 'Transporte', icon: '🚗', isDefault: true },
    { id: 'out-moradia', name: 'Moradia', icon: '🏠', isDefault: true },
    { id: 'out-saude', name: 'Saúde', icon: '💊', isDefault: true },
    { id: 'out-lazer', name: 'Lazer', icon: '🎉', isDefault: true },
    { id: 'out-educacao', name: 'Educação', icon: '📚', isDefault: true },
    { id: 'out-outros', name: 'Outros', icon: '📦', isDefault: true }
  ],
  in: [
    { id: 'in-salario', name: 'Salário', icon: '💼', isDefault: true },
    { id: 'in-freelance', name: 'Freelance', icon: '💻', isDefault: true },
    { id: 'in-vendas', name: 'Vendas', icon: '🛒', isDefault: true },
    { id: 'in-rendimentos', name: 'Rendimentos', icon: '📈', isDefault: true },
    { id: 'in-outros', name: 'Outros', icon: '📦', isDefault: true }
  ]
};

export const cloneDefaultCategories = (): CategoriesState => ({
  out: DEFAULT_CATEGORIES.out.map((c) => ({ ...c })),
  in: DEFAULT_CATEGORIES.in.map((c) => ({ ...c }))
});

export const getCategoryIcon = (
  cats: CategoriesState,
  type: TransactionType,
  categoryName: string
): string => {
  const list = cats[type] || [];
  const found = list.find(
    (c) => c.name.toLowerCase() === categoryName.toLowerCase() || c.id === categoryName
  );
  return found?.icon || '📦';
};

export type OutCategory =
  | 'Alimentação'
  | 'Transporte'
  | 'Moradia'
  | 'Saúde'
  | 'Lazer'
  | 'Educação'
  | 'Outros';

export type InCategory =
  | 'Salário'
  | 'Freelance'
  | 'Vendas'
  | 'Rendimentos'
  | 'Outros';

export type Category = OutCategory | InCategory | (string & {});

export type ViewName = 'home' | 'stats' | 'cal' | 'profile' | 'history';

export type PaymentMethod = 'money' | 'pix' | 'debit' | 'credit' | 'bank_slip';

export interface PaymentOption {
  id: PaymentMethod;
  label: string;
  icon?: string;
}

export const PAYMENT_METHODS: PaymentOption[] = [
  { id: 'money', label: 'Dinheiro', icon: '💵' },
  { id: 'pix', label: 'Pix', icon: '❖' },
  { id: 'debit', label: 'Débito', icon: '💳' },
  { id: 'credit', label: 'Crédito', icon: '💳' },
  { id: 'bank_slip', label: 'Boleto', icon: '📄' }
];

export const isValidPaymentMethod = (val: unknown): val is PaymentMethod =>
  typeof val === 'string' && PAYMENT_METHODS.some((p) => p.id === val);

export const getPaymentLabel = (pay: PaymentMethod): string =>
  PAYMENT_METHODS.find((p) => p.id === pay)?.label ?? 'Dinheiro';

export interface Transaction {
  id: string;
  type: TransactionType;
  v: number;
  n: string;
  notes?: string;
  c: Category;
  d: string;
  pay: PaymentMethod;
  tags: string[];
  installments?: InstallmentInfo;
  recurring?: RecurringInfo;
  thirdParty?: ThirdPartyInfo;
  status: TransactionStatus;
}

export interface TransactionFilters {
  query: string;
  type?: 'all' | 'in' | 'out';
  categoryId?: string;
  paymentMethod?: PaymentMethod | 'all';
  tag?: string;
  startDate?: string;
  endDate?: string;
  onlyPending?: boolean;
  onlyThirdParty?: boolean;
}

export interface FilteredTransactionsResult {
  items: Transaction[];
  totalCount: number;
  totalExpenseCents: number;
  totalIncomeCents: number;
  balanceCents: number;
}

export interface AppState {
  name: string;
  theme: Theme;
  accent: string;
  hide: boolean;
  per: number;
  tx: Transaction[];
  cats: CategoriesState;
  budgets: Record<string, CategoryBudget>;
  goalCents: number;
}
