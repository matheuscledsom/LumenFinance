/* ==========================================================================
   onboarding.ts — Fluxo de Boas-Vindas em 3 Etapas e Confete Nativo (CSS)
   ========================================================================== */

import { S, addCard, addShortcut, addTx, save } from '../state';
import { esc } from '../utils/currency';
import { now, toIsoDate } from '../utils/date';
import { parseAmountInput } from '../utils/qol';

export const ONBOARDING_STEPS = 3;

interface OnboardingDraft {
  name: string;
  balance: string;
  cardName: string;
  cardLimit: string;
  cardClosing: string;
  cardDue: string;
  loadShortcuts: boolean;
}

export let onboardingStep = 1;

const draft: OnboardingDraft = {
  name: '',
  balance: '',
  cardName: '',
  cardLimit: '',
  cardClosing: '10',
  cardDue: '17',
  loadShortcuts: true
};

const $ = <T extends Element = HTMLElement>(s: string): T | null =>
  document.querySelector<T>(s);

const read = (id: string, fallback: string): string => {
  const el = $<HTMLInputElement>(id);
  return el ? el.value : fallback;
};

/**
 * Captura os campos da etapa visível para o rascunho antes de renderizar outra etapa.
 */
const captureStep = (): void => {
  if (onboardingStep === 1) {
    draft.name = read('#onb-name', draft.name);
  } else if (onboardingStep === 2) {
    draft.balance = read('#onb-balance', draft.balance);
    draft.cardName = read('#onb-card-name', draft.cardName);
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

/**
 * Dispara a chuva de confetes via CSS puro (desativada com prefers-reduced-motion).
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
 * Conclui o onboarding aplicando nome, saldo inicial, cartão e atalhos escolhidos.
 */
export const finishOnboarding = (skip = false): void => {
  if (!skip) {
    captureStep();
    const name = draft.name.trim();
    if (name) S.name = name.slice(0, 30);

    const balance = parseAmountInput(draft.balance);
    if (balance > 0) {
      const inCat = S.cats.in.find((c) => c.name === 'Outros') || S.cats.in[0];
      addTx({
        type: 'in',
        v: balance,
        n: 'Saldo inicial',
        c: inCat ? inCat.name : 'Outros',
        d: toIsoDate(now),
        pay: 'money',
        tags: [],
        status: 'confirmed'
      });
    }

    const cardName = draft.cardName.trim();
    if (cardName) {
      const limit = parseAmountInput(draft.cardLimit);
      addCard({
        name: cardName,
        color: S.accent,
        limitCents: limit > 0 ? limit : 0,
        closingDay: Math.min(31, Math.max(1, Math.floor(Number(draft.cardClosing)) || 10)),
        dueDay: Math.min(31, Math.max(1, Math.floor(Number(draft.cardDue)) || 17))
      });
    }

    if (draft.loadShortcuts && S.quickShortcuts.length === 0) {
      const outCat = (name: string): string =>
        S.cats.out.find((c) => c.name === name)?.id || S.cats.out[0]?.id || '';
      addShortcut({ label: '☕ Café', amountCents: 600, categoryId: outCat('Alimentação'), paymentMethod: 'pix' });
      addShortcut({ label: '🍽 Almoço', amountCents: 2500, categoryId: outCat('Alimentação'), paymentMethod: 'pix' });
      addShortcut({ label: '🚗 Transporte', amountCents: 1500, categoryId: outCat('Transporte'), paymentMethod: 'pix' });
    }
  }
  S.hasCompletedOnboarding = true;
  save();
  onboardingStep = 1;
  if (!skip) launchConfetti();
};

const dots = (): string =>
  `<div class="onb-dots" aria-hidden="true">${Array.from({ length: ONBOARDING_STEPS }, (_, i) => `<i class="${i + 1 <= onboardingStep ? 'on' : ''}"></i>`).join('')}</div>`;

/**
 * HTML do modal de boas-vindas (vazio quando o onboarding já foi concluído).
 */
export function onboarding(): string {
  if (S.hasCompletedOnboarding) return '';

  const body =
    onboardingStep === 1
      ? `<h2 id="onb-title">Bem-vindo ao Lumen 👋</h2><p class="mut">Vamos configurar tudo em 3 passos rápidos.</p>
<label>Como quer ser chamado?<input id="onb-name" maxlength="30" placeholder="Seu nome" value="${esc(draft.name || (S.name === 'Matheus' ? '' : S.name))}" autocomplete="off"></label>
<label>Moeda<input value="Real brasileiro (R$)" disabled aria-label="Moeda padrão"></label>`
      : onboardingStep === 2
      ? `<h2 id="onb-title">Saldo e cartão 💳</h2><p class="mut">Deseja cadastrar seu saldo inicial e seu principal cartão? (opcional)</p>
<label>Saldo inicial (R$)<input id="onb-balance" inputmode="decimal" placeholder="0,00" value="${esc(draft.balance)}" autocomplete="off"></label>
<label>Nome do cartão principal<input id="onb-card-name" maxlength="24" placeholder="Ex.: Nubank" value="${esc(draft.cardName)}" autocomplete="off"></label>
<label>Limite (R$)<input id="onb-card-limit" inputmode="decimal" placeholder="5000,00" value="${esc(draft.cardLimit)}" autocomplete="off"></label>
<div class="form-split-row"><label>Fechamento<input id="onb-card-close" type="number" min="1" max="31" value="${esc(draft.cardClosing)}"></label><label>Vencimento<input id="onb-card-due" type="number" min="1" max="31" value="${esc(draft.cardDue)}"></label></div>`
      : `<h2 id="onb-title">Atalhos prontos ⚡</h2><p class="mut">Registre gastos do dia a dia com um único toque na tela inicial.</p>
<div class="quick-bar" style="margin:12px 0"><span class="quick-chip">☕ Café R$ 6</span><span class="quick-chip">🍽 Almoço R$ 25</span><span class="quick-chip">🚗 Transporte R$ 15</span></div>
<label class="chk-row"><input id="onb-shortcuts" type="checkbox"${draft.loadShortcuts ? ' checked' : ''}><span>Adicionar atalhos padrão</span></label>`;

  const nav = `<div class="onb-actions">${
    onboardingStep > 1
      ? '<button type="button" class="btn" data-onb-prev>Voltar</button>'
      : '<button type="button" class="btn" data-onb-skip>Pular</button>'
  }${
    onboardingStep < ONBOARDING_STEPS
      ? '<button type="button" class="btn p" data-onb-next>Continuar</button>'
      : '<button type="button" class="btn p" data-onb-finish>Começar 🎉</button>'
  }</div>`;

  return `<div class="onb-overlay"><div class="onb-modal card" role="dialog" aria-modal="true" aria-labelledby="onb-title">${dots()}${body}${nav}</div></div>`;
}
