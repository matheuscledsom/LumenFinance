/* ==========================================================================
   state.ts — Estado Central (S), Persistência (save/get) e Migrações
   ========================================================================== */

import {
  isValidPaymentMethod,
  type AppState,
  type Category,
  type PaymentMethod,
  type Theme,
  type Transaction,
  type TransactionType,
  type ViewName
} from './types/finance';

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
      d: typeof t.d === 'string' ? t.d : new Date().toISOString().slice(0, 10),
      pay: normalizePay(t.pay),
      tags: normalizeTags(t.tags)
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

export type CreateTxInput = Omit<Transaction, 'id' | 'pay' | 'tags'> & {
  id?: string;
  pay?: PaymentMethod;
  tags?: string[];
};

/**
 * Cria uma nova movimentação com UUID, valida pay e tags, adiciona a S.tx e persiste.
 */
export const addTx = (fields: CreateTxInput): Transaction => {
  const tx: Transaction = {
    ...fields,
    id: fields.id || crypto.randomUUID(),
    pay: normalizePay(fields.pay),
    tags: normalizeTags(fields.tags)
  };
  S.tx.push(tx);
  save();
  return tx;
};

/**
 * Busca uma movimentação pelo id em S.tx, atualiza seus campos validando pay/tags e persiste.
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

  Object.assign(item, updated, {
    id: item.id,
    pay: normalizePay(updated.pay ?? item.pay),
    tags: normalizeTags(updated.tags ?? item.tags)
  });
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
