/* ==========================================================================
   types/index.ts — Contratos e Tipagens Centrais do Lumen Finance
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

export interface Transaction {
  id: string;
  type: TransactionType;
  v: number;
  n: string;
  c: Category;
  d: string;
}

export interface AppState {
  name: string;
  theme: Theme;
  accent: string;
  hide: boolean;
  per: number;
  tx: Transaction[];
}
