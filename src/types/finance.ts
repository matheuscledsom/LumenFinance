/* ==========================================================================
   types/finance.ts — Contratos de Domínio Financeiro, Categorias, Orçamentos e Calendário
   ========================================================================== */

export type Theme = 'oled' | 'white' | 'grey' | 'xp' | 'emerald' | 'ocean' | 'sunset';

export type TransactionType = 'in' | 'out';

export type TransactionStatus = 'confirmed' | 'pending';

export type RecurringFrequency = 'monthly';

export const BUDGET_WARNING_THRESHOLD_RATIO = 0.8;
export const NEAR_ZERO_THRESHOLD_RATIO = 0.1;
export const INVOICE_WARNING_LIMIT_RATIO = 0.85;

export type SalaryRuleType = 'none' | 'fixed_day' | 'fifth_business_day';

export interface SalaryRule {
  type: SalaryRuleType;
  day?: number;
  amountCents: number;
  accountId?: string;
}

export interface BankAccount {
  id: string;
  name: string;
  icon: string;
  color: string;
  initialBalanceCents: number;
  kind?: 'bank' | 'cash';
  cardMode?: 'debit' | 'credit' | 'both';
  isDefault?: boolean;
  pixKey?: string;
  hasCredit?: boolean;
  creditLimitCents?: number;
  closingDay?: number;
  dueDay?: number;
  lastDigits?: string;
  linkedCardId?: string;
}

export const DEFAULT_ACCOUNTS: BankAccount[] = [
  { id: 'acc-nubank', name: 'Nubank', icon: '🟣', color: '#820ad1', initialBalanceCents: 0, kind: 'bank', cardMode: 'both', isDefault: true },
  { id: 'acc-inter', name: 'Banco Inter', icon: '🟠', color: '#ff7a00', initialBalanceCents: 0, kind: 'bank', cardMode: 'both' },
  { id: 'acc-carteira', name: 'Dinheiro Físico', icon: '💵', color: '#16a34a', initialBalanceCents: 0, kind: 'cash', cardMode: 'debit', isDefault: false }
];

export interface AccountTransfer {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amountCents: number;
  date: string;
  description?: string;
  createdAt: string;
}

export interface ThirdPartyCustodyInflow {
  id: string;
  accountId: string;
  personName: string;
  amountCents: number;
  usedInInvoiceCents: number;
  sourceDebtId?: string;
  sourceTxId?: string;
  date: string;
}

export interface CardInvoicePayment {
  id: string;
  cardId: string;
  monthYear: string;
  totalPaidCents: number;
  personalPortionCents: number;
  thirdPartyPortionCents: number;
  paidFromAccountId?: string;
  fundingSource: 'my_account' | 'third_party_custody' | 'mixed' | 'external_third_party';
  paidAt: string;
  status?: 'open' | 'closed' | 'paid';
  totalAmountCents?: number;
  paymentTxId?: string;
}

export interface AccountBalanceDetail {
  account: BankAccount;
  totalBankBalanceCents: number;
  personalBalanceCents: number;
  thirdPartyCustodyCents: number;
  isNearZero: boolean;
  currentBalanceCents: number;
}

export interface CardDetailedInvoice {
  cardId: string;
  monthYear: string;
  totalCents: number;
  personalCents: number;
  thirdPartyCents: number;
  paidCents: number;
  remainingCents: number;
  status: 'open' | 'closed' | 'paid' | 'partial';
  items: Transaction[];
}

export interface CardLimitStatus {
  cardId: string;
  limitCents: number;
  committedCents: number;
  availableCents: number;
  usageRatio: number;
  isWarning: boolean;
}

export interface SplitParticipant {
  id: string;
  name: string;
  amountCents: number;
  isMe: boolean;
  pixKey?: string;
  debtId?: string;
}

export interface BillSplitInfo {
  totalPurchaseCents: number;
  serviceTipPercent: number;
  participants: SplitParticipant[];
}

export interface CardInvoice {
  cardId: string;
  monthYear: string;
  totalAmountCents: number;
  status: 'open' | 'closed' | 'paid';
  paidAt?: string;
  paymentTxId?: string;
}

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

export interface DayCardEvent {
  cardId: string;
  cardName: string;
  cardColor: string;
  kind: 'closing' | 'best_day' | 'due';
  invoiceTotalCents: number;
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
  isSalaryDay?: boolean;
  cardEvents?: DayCardEvent[];
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
    { id: 'out-supermercado', name: 'Supermercado', icon: '🛒', isDefault: true },
    { id: 'out-transporte', name: 'Transporte', icon: '🚗', isDefault: true },
    { id: 'out-moradia', name: 'Moradia & Contas', icon: '🏠', isDefault: true },
    { id: 'out-streaming', name: 'Streaming & Assinaturas', icon: '📺', isDefault: true },
    { id: 'out-academia', name: 'Academia & Bem-estar', icon: '🏋️', isDefault: true },
    { id: 'out-saude', name: 'Saúde & Médico', icon: '💊', isDefault: true },
    { id: 'out-lazer', name: 'Lazer & Restaurantes', icon: '🎉', isDefault: true },
    { id: 'out-educacao', name: 'Educação & Cursos', icon: '📚', isDefault: true },
    { id: 'out-compras', name: 'Compras & Vestuário', icon: '🛍', isDefault: true },
    { id: 'out-pets', name: 'Pets', icon: '🐾', isDefault: true },
    { id: 'out-outros', name: 'Outros', icon: '📦', isDefault: true }
  ],
  in: [
    { id: 'in-salario', name: 'Salário', icon: '💼', isDefault: true },
    { id: 'in-freelance', name: 'Freelance & Projetos', icon: '💻', isDefault: true },
    { id: 'in-rendimentos', name: 'Rendimentos & Dividendos', icon: '📈', isDefault: true },
    { id: 'in-vendas', name: 'Vendas & Comissões', icon: '🛒', isDefault: true },
    { id: 'in-bonus', name: 'Bônus, 13º & PLR', icon: '🎁', isDefault: true },
    { id: 'in-reembolsos', name: 'Reembolsos & Cashback', icon: '🔄', isDefault: true },
    { id: 'in-outros', name: 'Outros', icon: '📦', isDefault: true }
  ]
};

export const DEFAULT_TAGS: readonly string[] = [
  'essencial',
  'recorrente',
  'streaming',
  'academia',
  'medico',
  'viagem',
  'casal',
  'reembolsavel',
  'lazer',
  'imprevisto',
  'trabalho',
  'familia'
];

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
  | 'Supermercado'
  | 'Transporte'
  | 'Moradia & Contas'
  | 'Streaming & Assinaturas'
  | 'Academia & Bem-estar'
  | 'Saúde & Médico'
  | 'Lazer & Restaurantes'
  | 'Educação & Cursos'
  | 'Compras & Vestuário'
  | 'Pets'
  | 'Outros'
  | (string & {});

export type InCategory =
  | 'Salário'
  | 'Freelance & Projetos'
  | 'Rendimentos & Dividendos'
  | 'Vendas & Comissões'
  | 'Bônus, 13º & PLR'
  | 'Reembolsos & Cashback'
  | 'Outros'
  | (string & {});

export type Category = OutCategory | InCategory | (string & {});

export type ViewName = 'home' | 'cards' | 'stats' | 'cal' | 'debts' | 'profile' | 'history';

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

export interface SubscriptionMeta {
  ownership: 'mine' | 'shared_mine' | 'third_party_card';
  ownerName?: string;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  v: number;
  n: string;
  notes?: string;
  accountId?: string;
  cardId?: string;
  splitInfo?: BillSplitInfo;
  subscriptionMeta?: SubscriptionMeta;
  paidBy?: 'me' | 'partner';
  isCoupleExpense?: boolean;
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
  cardId?: string;
  accountId?: string;
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

export interface CreditCard {
  id: string;
  name: string;
  lastDigits?: string;
  color: string;
  limitCents: number;
  closingDay: number;
  dueDay: number;
  linkedAccountId?: string;
  cardType?: 'credit' | 'both';
}

export type HomeWidgetId =
  | 'indicators'
  | 'accounts'
  | 'shortcuts'
  | 'commitments'
  | 'statement_bills'
  | 'goal'
  | 'couple'
  | 'spending_chart'
  | 'recent_tx';

export interface HomeWidgetConfig {
  id: HomeWidgetId;
  label: string;
  visible: boolean;
}

export const DEFAULT_HOME_WIDGETS: readonly HomeWidgetConfig[] = [
  { id: 'indicators', label: 'Indicadores de Saldo', visible: true },
  { id: 'accounts', label: 'Contas & Cartões', visible: true },
  { id: 'shortcuts', label: 'Atalhos & Cofrinho', visible: true },
  { id: 'statement_bills', label: 'Extrato & Faturas a Vencer', visible: true },
  { id: 'commitments', label: 'Compromissos & Faturas', visible: true },
  { id: 'couple', label: 'Modo Casal', visible: true },
  { id: 'goal', label: 'Meta Mensal', visible: true },
  { id: 'spending_chart', label: 'Gastos por Categoria', visible: true },
  { id: 'recent_tx', label: 'Últimas Movimentações', visible: true }
];

export interface CoupleConfig {
  enabled: boolean;
  partnerName: string;
  myIncomeCents: number;
  partnerIncomeCents: number;
  splitRule: '50_50' | 'proportional';
  monthlyBudgetCents: number;
}

export interface UserSuggestion {
  id: string;
  category: 'idea' | 'ui' | 'bug' | 'couple';
  message: string;
  createdAt: string;
}

export interface DebtPayment {
  id: string;
  amountCents: number;
  date: string;
  notes?: string;
  accountId?: string;
  fundingSource?: 'my_account' | 'third_party_custody' | 'external';
}

export type DebtType = 'to_receive' | 'to_pay';

export interface DebtRecord {
  id: string;
  personName: string;
  type: DebtType;
  originalAmountCents: number;
  paidAmountCents: number;
  payments: DebtPayment[];
  description: string;
  dueDate?: string;
  status: 'active' | 'settled';
  pixKey?: string;
  createdAt: string;
}

export interface QuickShortcut {
  id: string;
  label: string;
  amountCents: number;
  categoryId: string;
  paymentMethod: PaymentMethod;
  cardId?: string;
  accountId?: string;
}

export interface CardLimitUsage {
  limitCents: number;
  usedCents: number;
  availableCents: number;
  percent: number;
}

export interface AppState {
  name: string;
  age?: number;
  salaryRule: SalaryRule;
  theme: Theme;
  accent: string;
  hide: boolean;
  per: number;
  tx: Transaction[];
  cats: CategoriesState;
  budgets: Record<string, CategoryBudget>;
  goalCents: number;
  cards: CreditCard[];
  debts: DebtRecord[];
  accounts: BankAccount[];
  frequentPeople: string[];
  quickShortcuts: QuickShortcut[];
  hasCompletedOnboarding: boolean;
  hasCompletedTour: boolean;
  customTags: string[];
  homeWidgets: HomeWidgetConfig[];
  couple: CoupleConfig;
  suggestions: UserSuggestion[];
  avatarId?: string;
  bannerId?: string;
  avatarDataUrl?: string;
  bannerDataUrl?: string;
  profileMediaAdjust?: {
    avatarZoom?: number;
    avatarY?: number;
    bannerY?: number;
  };
  roundUpEnabled: boolean;
  paidInvoices: CardInvoicePayment[];
  transfers: AccountTransfer[];
  custodyInflows: ThirdPartyCustodyInflow[];
  defaultPixKey?: string;
  whatsappTemplate?: string;
}
