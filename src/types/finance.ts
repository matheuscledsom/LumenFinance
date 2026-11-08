/* ==========================================================================
   types/finance.ts — Contratos de Domínio Financeiro, Pagamentos e Transações
   ========================================================================== */

export type Theme = 'oled' | 'white' | 'grey' | 'xp';

export type TransactionType = 'out' | 'in';

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

export type ViewName = 'home' | 'stats' | 'cal' | 'profile';

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
  c: Category;
  d: string;
  pay: PaymentMethod;
  tags: string[];
}

export interface AppState {
  name: string;
  theme: Theme;
  accent: string;
  hide: boolean;
  per: number;
  tx: Transaction[];
}
