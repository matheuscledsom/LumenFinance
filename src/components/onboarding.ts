/* ==========================================================================
   onboarding.ts — Fluxo de Boas-Vindas em 3 Etapas e Tour Guiado Interativo (Spotlight)
   ========================================================================== */

import {
  S,
  addShortcut,
  addTx,
  save,
  upsertBankWithCard
} from '../state';
import type { SalaryRuleType } from '../types/finance';
import { esc } from '../utils/currency';
import { now, toIsoDate } from '../utils/date';
import { centsToInput, parseAmountInput } from '../utils/qol';

export const ONBOARDING_STEPS = 3;
export const TOUR_STEPS = 4;

interface OnboardingDraft {
  name: string;
  age: string;
  salary: string;
  salaryRuleType: SalaryRuleType;
  salaryDay: string;
  bankName: string;
  balance: string;
  cardMode: 'debit' | 'credit' | 'both';
  cardLimit: string;
  cardClosing: string;
  cardDue: string;
  loadShortcuts: boolean;
}

export let onboardingStep = 1;
export let tourStep = 1;

const draft: OnboardingDraft = {
  name: '',
  age: '',
  salary: '',
  salaryRuleType: 'fifth_business_day',
  salaryDay: '5',
  bankName: 'Nubank',
  balance: '',
  cardMode: 'both',
  cardLimit: '5000',
  cardClosing: '10',
  cardDue: '17',
  loadShortcuts: true
};

const $ = <T extends Element = HTMLElement>(s: string): T | null =>
  document.querySelector<T>(s);

const read = (id: string, fallback: string): string => {
  const el = $<HTMLInputElement | HTMLSelectElement>(id);
  return el ? el.value : fallback;
};

/**
 * Captura os campos da etapa visível para o rascunho antes de avançar.
 */
const captureStep = (): void => {
  if (onboardingStep === 1) {
    draft.name = read('#onb-name', draft.name);
    draft.age = read('#onb-age', draft.age);
    draft.salary = read('#onb-salary', draft.salary);
    draft.salaryRuleType = read('#onb-salary-rule', draft.salaryRuleType) as SalaryRuleType;
    draft.salaryDay = read('#onb-salary-day', draft.salaryDay);
  } else if (onboardingStep === 2) {
    draft.bankName = read('#onb-bank-name', draft.bankName);
    draft.balance = read('#onb-balance', draft.balance);
    draft.cardMode = read('#onb-card-mode', draft.cardMode) as 'debit' | 'credit' | 'both';
    draft.cardLimit = read('#onb-card-limit', draft.cardLimit);
    draft.cardClosing = read('#onb-card-close', draft.cardClosing);
    draft.cardDue = read('#onb-card-due', draft.cardDue);
  } else {
    const chk = $<HTMLInputElement>('#onb-shortcuts');
    if (chk) draft.loadShortcuts = chk.checked;
  }
};

export const nextOnboardingStep = (): void => {
  captureStep();
  onboardingStep = Math.min(ONBOARDING_STEPS, onboardingStep + 1);
};

export const prevOnboardingStep = (): void => {
  captureStep();
  onboardingStep = Math.max(1, onboardingStep - 1);
};

export const nextTourStep = (): void => {
  tourStep = Math.min(TOUR_STEPS, tourStep + 1);
};

export const finishTour = (): void => {
  S.hasCompletedTour = true;
  save();
  tourStep = 1;
};

export const restartTour = (): void => {
  S.hasCompletedTour = false;
  tourStep = 1;
  save();
};

/**
 * Dispara a chuva de confetes via CSS puro.
 */
export const launchConfetti = (): void => {
  const root = $<HTMLElement>('#confetti-root');
  if (!root) return;
  const colors = [S.accent, '#22c55e', '#eab308', '#ec4899', '#3b82f6'];
  root.innerHTML = Array.from({ length: 36 }, (_, i) => {
    const left = Math.round((i * 100) / 36 + (i % 3) * 2);
    const delay = (i % 12) * 0.08;
    const dur = 1.8 + (i % 5) * 0.25;
    const rot = (i * 47) % 360;
    return `<i style="left:${left}%;background:${colors[i % colors.length]};animation-delay:${delay.toFixed(2)}s;animation-duration:${dur.toFixed(2)}s;--rot:${rot}deg"></i>`;
  }).join('');
  setTimeout(() => {
    root.innerHTML = '';
  }, 4200);
};

/**
 * Conclui o onboarding aplicando perfil, regra de salário, conta bancária unificada e atalhos.
 */
export const finishOnboarding = (skip = false): void => {
  if (!skip) {
    captureStep();
    const name = draft.name.trim();
    if (name) S.name = name.slice(0, 30);

    const ageNum = parseInt(draft.age, 10);
    if (Number.isFinite(ageNum) && ageNum >= 12 && ageNum <= 120) {
      S.age = ageNum;
    }

    const salaryCents = parseAmountInput(draft.salary);
    S.salaryRule = {
      type: draft.salaryRuleType,
      amountCents: salaryCents,
      day:
        draft.salaryRuleType === 'fixed_day'
          ? Math.min(31, Math.max(1, parseInt(draft.salaryDay, 10) || 5))
          : undefined
    };

    const initialBalanceCents = parseAmountInput(draft.balance);
    const bankName = draft.bankName.trim() || 'Nubank';
    const limitCents = parseAmountInput(draft.cardLimit) || 500000;
    const closingDay = Math.min(31, Math.max(1, parseInt(draft.cardClosing, 10) || 10));
    const dueDay = Math.min(31, Math.max(1, parseInt(draft.cardDue, 10) || 17));

    upsertBankWithCard({
      bankName,
      initialBalanceCents,
      cardMode: draft.cardMode,
      kind: 'bank',
      cardLimitCents: limitCents,
      closingDay,
      dueDay,
      color: S.accent
    });

    if (initialBalanceCents > 0) {
      const inCat = S.cats.in.find((c) => c.name === 'Salário' || c.name === 'Outros') || S.cats.in[0];
      const acc = S.accounts.find((a) => a.name.toLowerCase() === bankName.toLowerCase());
      addTx({
        type: 'in',
        v: initialBalanceCents,
        n: 'Saldo inicial em conta',
        c: inCat ? inCat.name : 'Outros',
        d: toIsoDate(now),
        pay: 'pix',
        accountId: acc?.id,
        tags: ['essencial'],
        status: 'confirmed'
      });
    }

    if (draft.loadShortcuts && S.quickShortcuts.length === 0) {
      const outCat = (name: string): string =>
        S.cats.out.find((c) => c.name.toLowerCase().includes(name.toLowerCase()))?.id ||
        S.cats.out[0]?.id ||
        '';
      addShortcut({ label: '☕ Café', amountCents: 600, categoryId: outCat('alimentacao'), paymentMethod: 'pix' });
      addShortcut({ label: '🍽 Almoço', amountCents: 2800, categoryId: outCat('alimentacao'), paymentMethod: 'debit' });
      addShortcut({ label: '🛒 Mercado', amountCents: 12000, categoryId: outCat('supermercado'), paymentMethod: 'credit' });
      addShortcut({ label: '🚗 Transporte', amountCents: 1800, categoryId: outCat('transporte'), paymentMethod: 'pix' });
    }
  }

  S.hasCompletedOnboarding = true;
  save();
  onboardingStep = 1;
  if (!skip) launchConfetti();
};

const dots = (current: number, total: number): string =>
  `<div class="onb-dots" aria-hidden="true">${Array.from({ length: total }, (_, i) => `<i class="${i + 1 <= current ? 'on' : ''}"></i>`).join('')}</div>`;

/**
 * HTML do modal de boas-vindas.
 */
export function onboarding(): string {
  if (S.hasCompletedOnboarding) return '';

  let body = '';
  if (onboardingStep === 1) {
    const isFixed = draft.salaryRuleType === 'fixed_day';
    body = `
      <h2 id="onb-title">Bem-vindo ao Lumen 👋</h2>
      <p class="mut">Seu controle financeiro pessoal, limpo e inteligente.</p>
      <label>Como você gostaria de ser chamado?
        <input id="onb-name" maxlength="30" placeholder="Seu nome" value="${esc(draft.name || (S.name === 'Matheus' ? '' : S.name))}" autocomplete="off">
      </label>
      <div class="form-split-row">
        <label>Sua idade (opcional)
          <input id="onb-age" type="number" min="14" max="120" placeholder="Ex: 26" value="${esc(draft.age || (S.age ? String(S.age) : ''))}">
        </label>
        <label>Salário mensal aproximado (R$)
          <input id="onb-salary" inputmode="decimal" placeholder="0,00" value="${esc(draft.salary || (S.salaryRule.amountCents ? centsToInput(S.salaryRule.amountCents) : ''))}">
        </label>
      </div>
      <label>Quando você costuma receber?
        <select id="onb-salary-rule" style="padding:11px 12px">
          <option value="fifth_business_day"${draft.salaryRuleType === 'fifth_business_day' ? ' selected' : ''}>💼 5º dia útil do mês</option>
          <option value="fixed_day"${draft.salaryRuleType === 'fixed_day' ? ' selected' : ''}>📅 Dia fixo todo mês</option>
          <option value="none"${draft.salaryRuleType === 'none' ? ' selected' : ''}>🎲 Renda variável / Sem data fixa</option>
        </select>
      </label>
      <div id="onb-salary-day-wrap" style="display:${isFixed ? 'block' : 'none'};margin-top:6px">
        <label>Dia do pagamento (1 a 31)
          <input id="onb-salary-day" type="number" min="1" max="31" value="${esc(draft.salaryDay)}">
        </label>
      </div>
    `;
  } else if (onboardingStep === 2) {
    const hasCredit = draft.cardMode === 'credit' || draft.cardMode === 'both';
    body = `
      <h2 id="onb-title">Seu Principal Banco & Cartão 🏦</h2>
      <p class="mut">Integre sua conta e cartão para controle unificado.</p>
      <label>Banco ou Instituição Financeira
        <input id="onb-bank-name" maxlength="24" placeholder="Ex: Nubank, Inter, Itaú" value="${esc(draft.bankName)}" autocomplete="off">
      </label>
      <div class="form-split-row">
        <label>Saldo atual em conta (R$)
          <input id="onb-balance" inputmode="decimal" placeholder="0,00" value="${esc(draft.balance)}" autocomplete="off">
        </label>
        <label>Modalidade utilizada
          <select id="onb-card-mode" style="padding:11px 12px">
            <option value="both"${draft.cardMode === 'both' ? ' selected' : ''}>💳 Débito + Crédito</option>
            <option value="credit"${draft.cardMode === 'credit' ? ' selected' : ''}>💳 Só Cartão de Crédito</option>
            <option value="debit"${draft.cardMode === 'debit' ? ' selected' : ''}>🏦 Só Débito / Conta</option>
          </select>
        </label>
      </div>
      <div id="onb-card-fields" style="display:${hasCredit ? 'block' : 'none'};margin-top:8px">
        <label>Limite do cartão (R$)
          <input id="onb-card-limit" inputmode="decimal" placeholder="5.000,00" value="${esc(draft.cardLimit)}" autocomplete="off">
        </label>
        <div class="form-split-row">
          <label>Dia de fechamento
            <input id="onb-card-close" type="number" min="1" max="31" value="${esc(draft.cardClosing)}">
          </label>
          <label>Dia de vencimento
            <input id="onb-card-due" type="number" min="1" max="31" value="${esc(draft.cardDue)}">
          </label>
        </div>
        <small class="mut" style="display:block;margin-top:4px;font-size:.78rem">
          ℹ️ Compras até 1 dia antes do fechamento entram na fatura atual; compras no dia de fechamento ou após entram na fatura seguinte.
        </small>
      </div>
    `;
  } else {
    body = `
      <h2 id="onb-title">Atalhos Rápidos de 1 Toque ⚡</h2>
      <p class="mut">Lance despesas frequentes na Home com apenas um clique.</p>
      <div class="quick-bar" style="margin:16px 0;display:flex;gap:8px;flex-wrap:wrap">
        <span class="quick-chip">☕ Café R$ 6</span>
        <span class="quick-chip">🍽 Almoço R$ 28</span>
        <span class="quick-chip">🛒 Mercado R$ 120</span>
        <span class="quick-chip">🚗 Transporte R$ 18</span>
      </div>
      <label class="chk-row">
        <input id="onb-shortcuts" type="checkbox"${draft.loadShortcuts ? ' checked' : ''}>
        <span>Adicionar atalhos recomendados na tela inicial</span>
      </label>
    `;
  }

  const nav = `
    <div class="onb-actions" style="display:flex;justify-content:space-between;margin-top:20px;gap:10px">
      ${
        onboardingStep > 1
          ? '<button type="button" class="btn" data-onb-prev>Voltar</button>'
          : '<button type="button" class="btn" data-onb-skip>Pular</button>'
      }
      ${
        onboardingStep < ONBOARDING_STEPS
          ? '<button type="button" class="btn p" data-onb-next>Continuar</button>'
          : '<button type="button" class="btn p" data-onb-finish>Concluir e Começar 🎉</button>'
      }
    </div>
  `;

  return `<div class="onb-overlay"><div class="onb-modal card" role="dialog" aria-modal="true" aria-labelledby="onb-title">${dots(onboardingStep, ONBOARDING_STEPS)}${body}${nav}</div></div>`;
}

/**
 * Tour guiado interativo (Spotlight) em 4 cartões com explicação prática dos recursos-chave.
 */
export function tourOverlay(): string {
  if (!S.hasCompletedOnboarding || S.hasCompletedTour) return '';

  const tourCards = [
    {
      title: '🌟 1. Saldo Real vs Custódia de Terceiros',
      desc: 'O Lumen separa com precisão matemática o seu <b>Saldo Livre</b> do valor em <b>Custódia</b> (dinheiro de amigos de contas divididas). Você sabe exatamente quanto pode gastar sem se iludir!',
      highlight: 'Dica: Toque em <b>🎛 Personalizar Tela</b> na Home para reordenar ou ocultar seções ao seu gosto.'
    },
    {
      title: '💳 2. Cartões & Bancos Unificados',
      desc: 'Suas contas e cartões operam juntos: acompanhe limites disponíveis, dias ideais de compra e pague faturas liquidando automaticamente créditos que você recebeu de terceiros.',
      highlight: 'Acompanhe a barra de fechamento e o status aberto/fechado de cada fatura.'
    },
    {
      title: '📺 3. Lançamentos Inteligentes & Streaming',
      desc: 'Ao selecionar <b>Streaming</b> ou <b>Academia</b>, o Lumen sugere recorrência automática e opções de divisão. Divida contas com amigos e o sistema cria a cobrança Pix automaticamente!',
      highlight: 'Use <b>#tags</b> de 1 clique para agrupar projetos, eventos ou viagens.'
    },
    {
      title: '📅 4. Agenda Financeira & Modo Casal',
      desc: 'No Calendário, veja com clareza o seu <b>Dia de Salário</b> (incluindo o 5º dia útil) e os vencimentos das faturas. E ative o <b>Modo Casal</b> no perfil para ratear despesas domésticas!',
      highlight: 'Divisão equilibrada 50/50 ou proporcional à renda de cada parceiro.'
    }
  ];

  const current = tourCards[tourStep - 1] || tourCards[0];

  return `
    <div class="onb-overlay tour-overlay">
      <div class="onb-modal card tour-modal" role="dialog" aria-modal="true" style="max-width:480px">
        ${dots(tourStep, TOUR_STEPS)}
        <h2 style="margin:8px 0 4px;font-size:1.25rem">${current.title}</h2>
        <p style="font-size:.92rem;line-height:1.5;margin:10px 0">${current.desc}</p>
        <div class="tour-highlight-box" style="background:var(--mut-bg, rgba(139,92,246,0.1));border:1px solid var(--bd);padding:10px 12px;border-radius:var(--r);font-size:.82rem;margin:12px 0">
          💡 ${current.highlight}
        </div>
        <div class="onb-actions" style="display:flex;justify-content:space-between;margin-top:16px;gap:10px">
          <button type="button" class="btn" data-tour-finish>Pular Tour</button>
          ${
            tourStep < TOUR_STEPS
              ? '<button type="button" class="btn p" data-tour-next>Próximo →</button>'
              : '<button type="button" class="btn p" data-tour-finish>Concluir Tour 🚀</button>'
          }
        </div>
      </div>
    </div>
  `;
}
