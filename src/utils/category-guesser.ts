/* ==========================================================================
   utils/category-guesser.ts — Autocompletar Inteligente de Categorias por Palavras-Chave
   ========================================================================== */

import type { CategoryItem } from '../types/finance';

/**
 * Dicionário desacoplado de palavras-chave mapeadas para nomes de categorias padrão.
 */
export const KEYWORD_CATEGORY_MAP: Record<string, readonly string[]> = {
  Transporte: [
    'uber',
    '99',
    'posto',
    'gasolina',
    'combustivel',
    'etanol',
    'estacionamento',
    'pedagio',
    'onibus',
    'metro',
    'passagem',
    'taxi',
    'oficina',
    'ipva'
  ],
  Alimentação: [
    'ifood',
    'mercado',
    'supermercado',
    'restaurante',
    'padaria',
    'almoco',
    'jantar',
    'cafe',
    'lanche',
    'pizza',
    'hamburguer',
    'acougue',
    'feira',
    'hortifruti'
  ],
  Saúde: [
    'farmacia',
    'drogaria',
    'consulta',
    'exame',
    'medico',
    'dentista',
    'hospital',
    'remedio',
    'medicamento',
    'psicologo',
    'academia',
    'clinica'
  ],
  Moradia: [
    'aluguel',
    'condominio',
    'luz',
    'energia',
    'agua',
    'internet',
    'gas',
    'iptu',
    'reforma'
  ],
  Lazer: [
    'cinema',
    'netflix',
    'spotify',
    'show',
    'viagem',
    'hotel',
    'bar',
    'festa',
    'jogo',
    'steam',
    'passeio'
  ],
  Educação: [
    'curso',
    'faculdade',
    'escola',
    'livro',
    'apostila',
    'mensalidade',
    'idioma',
    'ingles'
  ],
  Salário: [
    'salario',
    'pagamento',
    'holerite',
    'adiantamento',
    'ferias',
    'plr',
    'bonus'
  ],
  Freelance: ['freelance', 'freela', 'projeto', 'consultoria', 'servico'],
  Vendas: ['venda', 'comissao', 'reembolso', 'desapego', 'olx'],
  Rendimentos: ['dividendo', 'rendimento', 'juros', 'cdb', 'tesouro', 'fii', 'investimento']
};

/**
 * Remove acentuação e normaliza texto para comparação insensível a caixa/acentos.
 */
const normalizeText = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

/**
 * Infere a categoria mais adequada a partir da descrição digitada e das categorias disponíveis.
 */
export function guessCategory(
  description: string,
  availableCats: CategoryItem[]
): CategoryItem | null {
  const cleanDesc = normalizeText(description);
  if (!cleanDesc || !Array.isArray(availableCats) || availableCats.length === 0) {
    return null;
  }

  const tokens = cleanDesc.split(/[^a-z0-9]+/).filter(Boolean);

  for (const [targetCatName, keywords] of Object.entries(KEYWORD_CATEGORY_MAP)) {
    const matchedKeyword = keywords.some(
      (kw) => tokens.includes(kw) || (kw.length >= 4 && cleanDesc.includes(kw))
    );
    if (matchedKeyword) {
      const normalizedTarget = normalizeText(targetCatName);
      const found = availableCats.find((c) => normalizeText(c.name) === normalizedTarget);
      if (found) return found;
    }
  }

  for (const cat of availableCats) {
    const normCat = normalizeText(cat.name);
    if (
      normCat &&
      normCat !== 'outros' &&
      (tokens.includes(normCat) || (normCat.length >= 4 && cleanDesc.includes(normCat)))
    ) {
      return cat;
    }
  }

  return null;
}
