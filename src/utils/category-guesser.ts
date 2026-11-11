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
  Supermercado: [
    'mercado',
    'supermercado',
    'carrefour',
    'assai',
    'atacadao',
    'pao de acucar',
    'extra',
    'dia',
    'hortifruti',
    'feira',
    'sacolao',
    'acougue',
    'padaria'
  ],
  Alimentação: [
    'ifood',
    'restaurante',
    'almoco',
    'jantar',
    'cafe',
    'lanche',
    'pizza',
    'hamburguer',
    'sushi',
    'mcdonalds',
    'burguer king'
  ],
  'Streaming & Assinaturas': [
    'netflix',
    'spotify',
    'amazon prime',
    'prime video',
    'disney',
    'hbo',
    'max',
    'youtube',
    'deezer',
    'apple',
    'paramount',
    'star+',
    'crunchyroll',
    'assinatura',
    'globoplay'
  ],
  'Academia & Bem-estar': [
    'smartfit',
    'smart fit',
    'bluefit',
    'academia',
    'gympass',
    'totalpass',
    'pilates',
    'crossfit',
    'natacao',
    'suplemento',
    'creatina',
    'whey',
    'personal'
  ],
  'Saúde & Médico': [
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
    'clinica',
    'terapia'
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
    'clinica'
  ],
  'Moradia & Contas': [
    'aluguel',
    'condominio',
    'luz',
    'energia',
    'enel',
    'agua',
    'sabesp',
    'internet',
    'claro',
    'vivo',
    'tim',
    'gas',
    'iptu',
    'reforma',
    'faxina'
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
  'Lazer & Restaurantes': [
    'cinema',
    'show',
    'viagem',
    'hotel',
    'bar',
    'festa',
    'jogo',
    'steam',
    'passeio',
    'balada',
    'ingresso'
  ],
  Lazer: [
    'cinema',
    'show',
    'viagem',
    'hotel',
    'bar',
    'festa',
    'jogo',
    'steam',
    'passeio'
  ],
  'Educação & Cursos': [
    'curso',
    'faculdade',
    'escola',
    'livro',
    'apostila',
    'mensalidade',
    'idioma',
    'ingles',
    'udemy',
    'alura'
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
  'Compras & Vestuário': [
    'shopee',
    'shein',
    'aliexpress',
    'amazon',
    'mercado livre',
    'zara',
    'renner',
    'c&a',
    'riachuelo',
    'roupa',
    'tenis',
    'sapato',
    'calcado',
    'vestuario'
  ],
  Pets: [
    'petshop',
    'pet shop',
    'veterinario',
    'racao',
    'cobasi',
    'petz',
    'gato',
    'cachorro',
    'banho e tosa'
  ],
  Salário: [
    'salario',
    'pagamento',
    'holerite',
    'adiantamento',
    'ferias'
  ],
  'Bônus, 13º & PLR': [
    'plr',
    'bonus',
    '13',
    'decimo terceiro',
    'participacao',
    'premiacao'
  ],
  'Reembolsos & Cashback': [
    'reembolso',
    'cashback',
    'estorno',
    'devolucao',
    'meliuz'
  ],
  'Freelance & Projetos': ['freelance', 'freela', 'projeto', 'consultoria', 'servico'],
  Freelance: ['freelance', 'freela', 'projeto', 'consultoria', 'servico'],
  'Vendas & Comissões': ['venda', 'comissao', 'desapego', 'olx', 'enjoei'],
  Vendas: ['venda', 'comissao', 'desapego', 'olx'],
  'Rendimentos & Dividendos': ['dividendo', 'rendimento', 'juros', 'cdb', 'tesouro', 'fii', 'investimento'],
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
