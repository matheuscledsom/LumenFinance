/* ==========================================================================
   state.js — Estado Central (S), Persistência (save/get) e Migrações
   ========================================================================== */

export const K = 'lumen.v1';

export const ACC = [
  ['Roxo', '#8b5cf6'],
  ['Azul', '#3b82f6'],
  ['Ciano', '#06b6d4'],
  ['Verde', '#22c55e'],
  ['Vermelho', '#ef4444'],
  ['Laranja', '#f97316'],
  ['Rosa', '#ec4899'],
  ['Amarelo', '#eab308']
];

export const THEMES = [
  ['oled', 'OLED'],
  ['white', 'Branco'],
  ['grey', 'Cinza escuro'],
  ['xp', 'Windows XP']
];

export const CAT = {
  out: ['Alimentação', 'Transporte', 'Moradia', 'Saúde', 'Lazer', 'Educação', 'Outros'],
  in: ['Salário', 'Freelance', 'Vendas', 'Rendimentos', 'Outros']
};

const defaultTheme = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches
    ? 'white'
    : 'oled';

export const S = {
  name: 'Matheus',
  theme: defaultTheme(),
  accent: '#8b5cf6',
  hide: false,
  per: 0,
  tx: []
};

export let view = 'home';

export const setView = (v) => {
  view = v;
};

/**
 * Executa migrações de versão do schema mantendo compatibilidade retroativa.
 */
export const migrate = (raw) => {
  if (!raw || typeof raw !== 'object') return {};
  if (!Array.isArray(raw.tx)) raw.tx = [];
  return raw;
};

/**
 * Carrega o estado persistido do localStorage para o objeto S.
 */
export const get = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(K) || '{}');
    Object.assign(S, migrate(raw));
  } catch (e) {}
  return S;
};

/**
 * Persiste o estado S no localStorage sob a chave K ('lumen.v1').
 */
export const save = () => {
  try {
    localStorage.setItem(K, JSON.stringify(S));
  } catch (e) {}
};

/**
 * Limpa todas as movimentações e restaura no armazenamento local.
 */
export const resetState = () => {
  try {
    localStorage.removeItem(K);
  } catch (x) {}
  S.tx = [];
  save();
};

// Hidrata o estado imediatamente na carga do módulo
get();
