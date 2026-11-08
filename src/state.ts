/* ==========================================================================
   state.ts — Estado Central (S), Persistência (save/get) e Migrações
   ========================================================================== */

import type {
  AppState,
  Category,
  Theme,
  Transaction,
  TransactionType,
  ViewName
} from './types/index';

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
  out: ['Alimentação', 'Transporte', 'Moradia', 'Saúde', 'Lazer', 'Educação', 'Outros'],
  in: ['Salário', 'Freelance', 'Vendas', 'Rendimentos', 'Outros']
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
  tx: []
};

export let view: ViewName = 'home';

export const setView = (v: ViewName): void => {
  view = v;
};

/**
 * Executa migrações de versão do schema mantendo compatibilidade retroativa.
 */
export const migrate = (raw: unknown): Partial<AppState> => {
  if (!raw || typeof raw !== 'object') return {};
  const data = raw as Record<string, unknown>;
  const rawTx = Array.isArray(data.tx) ? data.tx : [];
  const tx: Transaction[] = rawTx
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((t) => ({
      id: t.id != null ? String(t.id) : crypto.randomUUID(),
      type: t.type === 'in' ? 'in' : 'out',
      v: typeof t.v === 'number' ? t.v : Number(t.v) || 0,
      n: typeof t.n === 'string' ? t.n : String(t.n ?? ''),
      c: (typeof t.c === 'string' ? t.c : 'Outros') as Category,
      d: typeof t.d === 'string' ? t.d : new Date().toISOString().slice(0, 10)
    }));

  const result: Partial<AppState> = { tx };
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
 * Carrega o estado persistido do localStorage para o objeto S.
 */
export const get = (): AppState => {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(K) || '{}');
    Object.assign(S, migrate(raw));
  } catch (e) {}
  return S;
};

/**
 * Persiste o estado S no localStorage sob a chave K ('lumen.v1').
 */
export const save = (): void => {
  try {
    localStorage.setItem(K, JSON.stringify(S));
  } catch (e) {}
};

/**
 * Cria uma nova movimentação com UUID, adiciona a S.tx e persiste.
 */
export const addTx = (fields: Omit<Transaction, 'id'> & { id?: string }): Transaction => {
  const tx: Transaction = {
    ...fields,
    id: fields.id || crypto.randomUUID()
  };
  S.tx.push(tx);
  save();
  return tx;
};

/**
 * Busca uma movimentação pelo id em S.tx, atualiza seus campos e persiste.
 */
export const updateTx = (
  id: string,
  updatedFields: Partial<Omit<Transaction, 'id'>>
): Transaction | null => {
  const item = S.tx.find((t) => String(t.id) === String(id));
  if (!item) return null;
  Object.assign(item, updatedFields, { id: item.id });
  save();
  return item;
};

/**
 * Remove uma movimentação pelo id de S.tx e persiste.
 */
export const deleteTx = (id: string): void => {
  S.tx = S.tx.filter((t) => String(t.id) !== String(id));
  save();
};

/**
 * Limpa todas as movimentações e restaura no armazenamento local.
 */
export const resetState = (): void => {
  try {
    localStorage.removeItem(K);
  } catch (x) {}
  S.tx = [];
  save();
};

// Hidrata o estado imediatamente na carga do módulo
get();
