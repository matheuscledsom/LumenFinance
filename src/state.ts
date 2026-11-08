/* ==========================================================================
   state.ts — Estado Central (S), Persistência (save/get), Categorias e Migrações
   ========================================================================== */

import {
  DEFAULT_CATEGORIES,
  cloneDefaultCategories,
  isValidPaymentMethod,
  type AppState,
  type CategoriesState,
  type Category,
  type CategoryItem,
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
  cats: cloneDefaultCategories()
};

export let view: ViewName = 'home';

export const setView = (v: ViewName): void => {
  view = v;
};

/**
 * Executa migrações de versão do schema mantendo compatibilidade retroativa.
 */
export const migrate = (raw: unknown): Partial<AppState> => {
  if (!raw || typeof raw !== 'object') return { cats: cloneDefaultCategories() };
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

  const cats = normalizeCategoriesState(data.cats);

  const result: Partial<AppState> = { tx, cats };
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
  } catch (e) {
    S.cats = cloneDefaultCategories();
  }
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
 * atreladas ou se for a única categoria default restante.
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
  save();
  return true;
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
 * Limpa todas as movimentações, restaura categorias padrão e persiste no localStorage.
 */
export const resetState = (): void => {
  try {
    localStorage.removeItem(K);
  } catch (x) {}
  S.tx = [];
  S.cats = cloneDefaultCategories();
  save();
};

// Hidrata o estado imediatamente na carga do módulo
get();
