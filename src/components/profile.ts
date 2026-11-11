/* ==========================================================================
   profile.ts — Gerenciamento de Perfil, Capa/Avatar (IndexedDB), Ajuste de Foto,
              Sub-abas (👤 Meu Perfil | ⚙️ Configurações), Mini-Extrato & Faturas
   ========================================================================== */

import {
  S,
  THEMES,
  ACC,
  getRoundUpTotal,
  getCoupleSummary,
  save
} from '../state';
import {
  type TransactionType,
  type SalaryRule,
  type CoupleConfig,
  getCategoryIcon
} from '../types/finance';
import { brl, esc } from '../utils/currency';
import { parseAmountInput, centsToInput } from '../utils/qol';
import { cur, now, toIsoDate } from '../utils/date';
import { deleteItem, getItem, putItem } from '../db';
import { getUpcomingInvoicesAndBills } from '../utils/credit-card';
import { cardsSection } from './cards';

export let profileCatTab: TransactionType = 'out';
export let profileSectionTab: 'overview' | 'settings' = 'overview';

export const setProfileCatTab = (t: TransactionType): void => {
  profileCatTab = t;
};

export const setProfileSectionTab = (t: 'overview' | 'settings'): void => {
  profileSectionTab = t;
};

// --------------------------------------------------------------------------
// Cache e Gerenciamento de Mídia do Perfil (IndexedDB + AppState)
// --------------------------------------------------------------------------
let avatarDataUrl: string | null = null;
let bannerDataUrl: string | null = null;

export async function loadProfileMedia(): Promise<void> {
  avatarDataUrl = S.avatarDataUrl || (await getItem<string>('profile_avatar'));
  bannerDataUrl = S.bannerDataUrl || (await getItem<string>('profile_banner'));
}

export function getProfileAvatar(): string | null {
  return avatarDataUrl || S.avatarDataUrl || null;
}

export function getProfileBanner(): string | null {
  return bannerDataUrl || S.bannerDataUrl || null;
}

export async function setProfileAvatar(url: string | null): Promise<void> {
  avatarDataUrl = url;
  S.avatarDataUrl = url || undefined;
  save();
  if (url) {
    await putItem('profile_avatar', url);
  } else {
    await deleteItem('profile_avatar');
  }
}

export async function setProfileBanner(url: string | null): Promise<void> {
  bannerDataUrl = url;
  S.bannerDataUrl = url || undefined;
  save();
  if (url) {
    await putItem('profile_banner', url);
  } else {
    await deleteItem('profile_banner');
  }
}

export function compressImageFile(file: File, maxDim = 800, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(e.target?.result as string);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Abre o modal para ajustar zoom e enquadramento da foto de perfil e da capa.
 */
export function openMediaAdjustDialog(): void {
  const adjust = S.profileMediaAdjust || { avatarZoom: 100, avatarY: 0, bannerY: 0 };
  const f = document.querySelector<HTMLFormElement>('#f2');
  if (!f) return;
  f.dataset.kind = 'profile_media_adjust';
  f.innerHTML = `
    <h2 id="dt2" style="margin:0 0 4px;font-size:1.2rem">🎚 Ajustar Foto & Capa</h2>
    <div class="mut" style="font-size:.82rem;margin-bottom:12px">Regule o zoom e a posição vertical para o melhor enquadramento.</div>

    <label>Zoom da Foto (${adjust.avatarZoom || 100}%)
      <input type="range" id="pma-zoom" min="100" max="200" value="${adjust.avatarZoom || 100}" style="width:100%;margin-top:4px">
    </label>

    <label style="margin-top:10px">Posição Vertical da Foto (${adjust.avatarY || 0}%)
      <input type="range" id="pma-avy" min="-50" max="50" value="${adjust.avatarY || 0}" style="width:100%;margin-top:4px">
    </label>

    <label style="margin-top:10px">Posição Vertical da Capa (${adjust.bannerY || 0}%)
      <input type="range" id="pma-bany" min="-50" max="50" value="${adjust.bannerY || 0}" style="width:100%;margin-top:4px">
    </label>

    <div id="f2e" class="neg" role="alert" style="margin-top:8px;font-size:.85rem"></div>
    <div style="display:flex;gap:10px;margin-top:16px">
      <button type="button" class="btn" data-close-dlg2 style="flex:1">Cancelar</button>
      <button type="submit" class="btn p" style="flex:1">Salvar Enquadramento</button>
    </div>
  `;
  document.querySelector<HTMLDialogElement>('#dlg2')?.showModal();
}

/**
 * Componente / Widget Reutilizável: Mini-Extrato & Faturas / Contas a Vencer.
 */
export function renderStatementAndBillsWidget(): string {
  // Coluna 1: Mini-Extrato Recente (últimos 5)
  const recentTxs = [...S.tx]
    .sort((a, b) => b.d.localeCompare(a.d))
    .slice(0, 5);

  const txRows = recentTxs.length
    ? recentTxs
        .map((t) => {
          const isIncome = t.type === 'in';
          const icon = getCategoryIcon(S.cats, t.type, t.c);
          const payLabel = t.cardId
            ? `💳 ${S.cards.find((c) => c.id === t.cardId)?.name || 'Cartão'}`
            : t.accountId
            ? `🏦 ${S.accounts.find((a) => a.id === t.accountId)?.name || 'Conta'}`
            : '💵 Dinheiro';

          return `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--bd)">
              <div style="display:flex;align-items:center;gap:8px;min-width:0;flex:1">
                <span style="font-size:1.15rem;flex-shrink:0">${esc(icon)}</span>
                <div style="min-width:0">
                  <div style="font-size:.84rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.n)}</div>
                  <div class="mut" style="font-size:.72rem">${esc(t.d.split('-').reverse().slice(0, 2).join('/'))} · ${esc(payLabel)}</div>
                </div>
              </div>
              <b class="num ${isIncome ? 'pos' : 'neg'}" style="font-size:.86rem;margin-left:8px;flex-shrink:0">${isIncome ? '+' : '-'}${brl(t.v)}</b>
            </div>
          `;
        })
        .join('')
    : '<div class="mut" style="font-size:.8rem;padding:8px 0">Nenhuma movimentação recente.</div>';

  // Coluna 2: Faturas & Contas a Vencer
  const upcoming = getUpcomingInvoicesAndBills().slice(0, 4);

  const upcomingRows = upcoming.length
    ? upcoming
        .map((bill) => {
          let dueBadge = '';
          if (bill.daysUntilDue < 0) {
            dueBadge = `<span class="pill neg" style="font-size:.68rem">Vencida (${Math.abs(bill.daysUntilDue)}d atrás)</span>`;
          } else if (bill.daysUntilDue === 0) {
            dueBadge = `<span class="pill warning" style="font-size:.68rem">Vence Hoje!</span>`;
          } else {
            dueBadge = `<span class="pill" style="font-size:.68rem">Vence em ${bill.daysUntilDue}d</span>`;
          }

          let actionBtn = '';
          if (bill.type === 'card_invoice' && bill.cardId && bill.invoiceMonthYear) {
            actionBtn = `<button type="button" class="btn btn-sm p" data-pay-invoice="${esc(bill.cardId)}" data-invoice-ym="${esc(bill.invoiceMonthYear)}" style="padding:3px 8px;font-size:.75rem">⚡ Pagar</button>`;
          } else if (bill.type === 'pending_tx') {
            const rawId = bill.id.replace('tx-', '');
            actionBtn = `<button type="button" class="btn btn-sm" data-confirm-tx="${esc(rawId)}" style="padding:3px 8px;font-size:.75rem">Confirmar</button>`;
          }

          return `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--bd)">
              <div style="min-width:0;flex:1">
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                  <span style="font-size:.84rem;font-weight:600">${esc(bill.title)}</span>
                  ${dueBadge}
                </div>
                <div class="mut" style="font-size:.72rem">Vencimento: ${esc(bill.dueDate.split('-').reverse().join('/'))}</div>
              </div>
              <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;margin-left:8px">
                <b class="num neg" style="font-size:.86rem">${brl(bill.amountCents)}</b>
                ${actionBtn}
              </div>
            </div>
          `;
        })
        .join('')
    : '<div class="mut" style="font-size:.8rem;padding:8px 0">🎉 Nenhuma fatura ou conta pendente próxima!</div>';

  return `
    <section class="card wide" style="margin-top:14px">
      <div class="ch">
        <span>📄 Mini-Extrato & Faturas a Vencer</span>
      </div>
      <div class="cb" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:1.25rem">
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <span class="mut" style="font-size:.78rem;font-weight:600;text-transform:uppercase">Últimos Lançamentos</span>
            <button type="button" class="link-btn" data-v="history" style="font-size:.75rem">Ver todos →</button>
          </div>
          <div>${txRows}</div>
        </div>

        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <span class="mut" style="font-size:.78rem;font-weight:600;text-transform:uppercase">Próximos Vencimentos</span>
            <button type="button" class="link-btn" data-v="cards" style="font-size:.75rem">Ver faturas →</button>
          </div>
          <div>${upcomingRows}</div>
        </div>
      </div>
    </section>
  `;
}

export function profile(): string {
  const activeCats = S.cats[profileCatTab] || [];

  const catItemsHtml = activeCats
    .map(
      (c) =>
        `<div class="cat-item"><span class="cat-info"><span class="cat-ico" aria-hidden="true">${esc(c.icon)}</span><b>${esc(c.name)}</b></span><button type="button" class="ib cat-del" data-del-cat="${esc(c.id)}" data-cat-type="${profileCatTab}" aria-label="Excluir categoria ${esc(c.name)}">×</button></div>`
    )
    .join('');

  const budgetRowsHtml = (S.cats.out || [])
    .map((c) => {
      const b = S.budgets[c.id] || S.budgets[c.name] || S.budgets[c.name.toLowerCase()];
      const limitStr = b && b.limitCents > 0 ? centsToInput(b.limitCents) : '';
      return `<div class="budget-row"><span class="cat-info"><span class="cat-ico" aria-hidden="true">${esc(c.icon)}</span><b>${esc(c.name)}</b></span><div class="budget-actions"><input class="budget-input" inputmode="decimal" data-budget-input="${esc(c.id)}" placeholder="Sem limite" value="${esc(limitStr)}" aria-label="Orçamento mensal para ${esc(c.name)}">${b && b.limitCents > 0 ? `<button type="button" class="ib cat-del" data-clear-budget="${esc(c.id)}" aria-label="Limpar orçamento de ${esc(c.name)}">×</button>` : ''}</div></div>`;
    })
    .join('');

  const shortcutRows = S.quickShortcuts.length
    ? S.quickShortcuts
        .map(
          (sc) =>
            `<div class="cat-item"><span class="cat-info"><b>${esc(sc.label)}</b><span class="mut num">${brl(sc.amountCents)}</span></span><button type="button" class="ib cat-del" data-del-shortcut="${esc(sc.id)}" aria-label="Excluir atalho ${esc(sc.label)}">×</button></div>`
        )
        .join('')
    : '<div class="mut">Nenhum atalho criado.</div>';

  const goalStr = centsToInput(S.goalCents);

  // Mídia de Perfil
  const banner = getProfileBanner();
  const avatar = getProfileAvatar();
  const mediaAdjust = S.profileMediaAdjust || { avatarZoom: 100, avatarY: 0, bannerY: 0 };
  const avZoom = (mediaAdjust.avatarZoom || 100) / 100;
  const avY = 50 + (mediaAdjust.avatarY || 0);
  const banY = 50 + (mediaAdjust.bannerY || 0);

  const bannerStyle = banner
    ? `background-image: url('${banner}'); background-size: cover; background-position: center ${banY}%;`
    : `background: linear-gradient(135deg, var(--ac) 0%, #1e1b4b 100%);`;

  const avatarContent = avatar
    ? `<img src="${avatar}" alt="${esc(S.name)}" class="profile-avatar-img" style="transform:scale(${avZoom});object-position:50% ${avY}%;width:100%;height:100%;object-fit:cover">`
    : `<div class="profile-avatar-placeholder" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2rem;font-weight:700;background:var(--mut);color:#fff">${esc((S.name[0] || 'M').toUpperCase())}</div>`;

  // Resumo do Modo Casal
  const couple = S.couple || {
    enabled: false,
    partnerName: 'Parceiro(a)',
    myIncomeCents: 0,
    partnerIncomeCents: 0,
    splitRule: '50_50',
    monthlyBudgetCents: 0
  };

  const coupleSummary = getCoupleSummary(cur);
  let coupleSummaryHtml = '';

  if (couple.enabled) {
    const isOver =
      S.couple.monthlyBudgetCents > 0 &&
      coupleSummary.totalCoupleExpenseCents > S.couple.monthlyBudgetCents;
    let balanceText = 'Tudo equilibrado este mês!';
    let balanceClass = 'pos';
    if (coupleSummary.settlementDebtor === 'partner') {
      balanceText = `${esc(couple.partnerName)} deve te pagar ${brl(coupleSummary.settlementCents)}`;
      balanceClass = 'pos';
    } else if (coupleSummary.settlementDebtor === 'me') {
      balanceText = `Você deve pagar ${brl(coupleSummary.settlementCents)} a ${esc(couple.partnerName)}`;
      balanceClass = 'neg';
    }

    coupleSummaryHtml = `
      <div class="couple-summary-card" style="margin-top:1rem;padding:1rem;border:1px solid var(--bd);border-radius:var(--r);background:var(--card)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <b>Resumo do Casal (${cur})</b>
          <span class="pill ${isOver ? 'neg' : ''}">${isOver ? '⚠️ Acima do Teto' : 'Dentro do Teto'}</span>
        </div>
        <div class="kpi-grid" style="margin-bottom:8px">
          <div class="kpi-box"><span class="mut">Total Gasto Juntos</span><b class="num neg">${brl(coupleSummary.totalCoupleExpenseCents)}</b></div>
          <div class="kpi-box"><span class="mut">Sua Parte Calculada</span><b class="num">${brl(coupleSummary.myShareCents)}</b></div>
          <div class="kpi-box"><span class="mut">Parte de ${esc(couple.partnerName)}</span><b class="num">${brl(coupleSummary.partnerShareCents)}</b></div>
          <div class="kpi-box"><span class="mut">Balanço do Acerto</span><b class="num ${balanceClass}">${brl(coupleSummary.settlementCents)}</b></div>
        </div>
        <div style="font-size:.85rem;margin-bottom:10px" class="${balanceClass}">
          <b>${balanceText}</b>
        </div>
        <div style="display:flex;gap:8px">
          <button type="button" class="btn p" data-settle-couple style="flex:1">⚡ Acertar Contas em 1 Clique</button>
        </div>
      </div>
    `;
  }

  // Sugestões
  const suggestions = S.suggestions || [];
  const suggestionsHtml = suggestions.length
    ? suggestions
        .map((s) => {
          const categoryLabels: Record<string, string> = {
            idea: '💡 Ideia',
            ui: '🎨 Visual',
            bug: '🐛 Bug',
            couple: '💑 Casal'
          };
          const catLabel = categoryLabels[s.category] || s.category;
          return `
            <div class="cat-item" style="padding:.6rem .8rem">
              <div style="flex:1;min-width:0">
                <div style="display:flex;gap:6px;align-items:center;margin-bottom:2px">
                  <span class="pill" style="font-size:.68rem;padding:1px 6px">${esc(catLabel)}</span>
                  <small class="mut">${esc(s.createdAt)}</small>
                </div>
                <div style="font-size:.85rem;word-break:break-word">${esc(s.message)}</div>
              </div>
              <button type="button" class="ib cat-del" data-del-suggestion="${esc(s.id)}" aria-label="Remover sugestão">×</button>
            </div>
          `;
        })
        .join('')
    : '<div class="mut">Nenhuma sugestão registrada ainda. Envie a sua abaixo!</div>';

  const salaryAccountOptions = S.accounts
    .map(
      (a) =>
        `<option value="${esc(a.id)}" ${S.salaryRule.accountId === a.id ? 'selected' : ''}>${esc(a.icon)} ${esc(a.name)}</option>`
    )
    .join('');

  // --------------------------------------------------------------------------
  // CONTEÚDO DA SUB-ABA 1: 👤 MEU PERFIL (OVERVIEW)
  // --------------------------------------------------------------------------
  const overviewTabHtml = `
    <!-- HERO CARD: BANNER & AVATAR -->
    <section class="card wide profile-hero-card" style="padding:0;overflow:hidden">
      <div class="profile-banner-wrap" style="position:relative;height:130px;${bannerStyle}">
        <div style="position:absolute;top:10px;right:10px;display:flex;gap:6px">
          <label class="btn btn-sm profile-banner-btn" style="background:rgba(0,0,0,0.65);color:#fff;backdrop-filter:blur(4px);cursor:pointer;font-size:.75rem">
            📷 Capa
            <input type="file" id="profile-banner-file" accept="image/*" style="display:none">
          </label>
          <button type="button" class="btn btn-sm" data-open-media-adjust style="background:rgba(0,0,0,0.65);color:#fff;backdrop-filter:blur(4px);font-size:.75rem" title="Ajustar zoom e posição">
            🎚 Ajustar
          </button>
        </div>
      </div>
      <div class="profile-hero-content" style="position:relative;padding:0 1.25rem 1.25rem;display:flex;align-items:flex-end;gap:1rem;margin-top:-45px;flex-wrap:wrap">
        <div class="profile-avatar-wrap" style="position:relative;width:84px;height:84px;border-radius:50%;border:3px solid var(--card);overflow:hidden;box-shadow:var(--sh);background:var(--mut);flex-shrink:0">
          ${avatarContent}
          <label class="profile-avatar-btn" style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.65);color:#fff;text-align:center;font-size:.65rem;padding:3px 0;cursor:pointer">
            Foto
            <input type="file" id="profile-avatar-file" accept="image/*" style="display:none">
          </label>
        </div>
        <div style="margin-bottom:4px;flex:1;min-width:180px">
          <h2 style="margin:0;font-size:1.35rem;font-weight:700">${esc(S.name)}</h2>
          <div class="mut" style="font-size:.82rem">
            ${S.age ? `${S.age} anos · ` : ''}Lumen Finance
            ${S.salaryRule.type !== 'none' ? ` · Salário: ${S.salaryRule.type === 'fifth_business_day' ? '5º dia útil' : `Dia ${S.salaryRule.day}`}` : ''}
          </div>
        </div>
        <div>
          <button type="button" class="btn btn-sm" data-profile-section="settings" style="font-size:.78rem">⚙️ Editar Configurações</button>
        </div>
      </div>
    </section>

    <!-- WIDGET: EXTRATO RECENTE & FATURAS A VENCER -->
    ${renderStatementAndBillsWidget()}

    <!-- RESUMO DO CASAL (SE ATIVO) -->
    ${
      couple.enabled
        ? `<section class="card wide">
            <div class="ch"><span>💑 Finanças Compartilhadas do Casal</span></div>
            <div class="cb">${coupleSummaryHtml}</div>
          </section>`
        : ''
    }
  `;

  // --------------------------------------------------------------------------
  // CONTEÚDO DA SUB-ABA 2: ⚙️ CONFIGURAÇÕES (SETTINGS)
  // --------------------------------------------------------------------------
  const settingsTabHtml = `
    <!-- DADOS PESSOAIS & REGRA DE SALÁRIO -->
    <section class="card wide">
      <div class="ch">Dados Pessoais & Regra de Salário</div>
      <div class="cb">
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:.75rem">
          <div>
            <label>Nome Completo / Como prefere ser chamado(a)</label>
            <input id="nm" value="${esc(S.name)}" maxlength="30" placeholder="Seu nome">
          </div>
          <div>
            <label>Idade (anos)</label>
            <input id="profile-age" type="number" min="0" max="120" value="${S.age || 25}" placeholder="Ex.: 28">
          </div>
        </div>

        <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--bd)">
          <b>Regra de Pagamento do Salário</b>
          <div class="mut" style="font-size:.8rem;margin-bottom:.75rem">
            Destaca automaticamente o dia do salário no calendário com 💰 e saldo previsto.
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:.75rem">
            <div>
              <label>Quando você recebe?</label>
              <select id="profile-salary-type">
                <option value="none" ${S.salaryRule.type === 'none' ? 'selected' : ''}>Não recebo salário fixo</option>
                <option value="fifth_business_day" ${S.salaryRule.type === 'fifth_business_day' ? 'selected' : ''}>5º dia útil do mês</option>
                <option value="fixed_day" ${S.salaryRule.type === 'fixed_day' ? 'selected' : ''}>Todo dia X do mês</option>
              </select>
            </div>
            <div id="profile-salary-day-wrap" style="display:${S.salaryRule.type === 'fixed_day' ? 'block' : 'none'}">
              <label>Dia do Mês (1 a 31)</label>
              <input id="profile-salary-day" type="number" min="1" max="31" value="${S.salaryRule.day || 5}">
            </div>
            <div>
              <label>Valor Líquido Estimado (R$)</label>
              <input id="profile-salary-amount" inputmode="decimal" value="${centsToInput(S.salaryRule.amountCents)}" placeholder="0,00">
            </div>
            <div>
              <label>Conta de Depósito</label>
              <select id="profile-salary-account">
                ${salaryAccountOptions}
              </select>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- MODO CASAL / FINANÇAS A DOIS -->
    <section class="card wide">
      <div class="ch">
        <span>💑 Modo Casal / Finanças Compartilhadas</span>
        <label class="chk-row" style="margin:0">
          <input type="checkbox" id="couple-enabled" ${couple.enabled ? 'checked' : ''}>
          <span style="font-size:.85rem">Ativar</span>
        </label>
      </div>
      <div class="cb">
        <div class="mut" style="font-size:.82rem;margin-bottom:.75rem">
          Controle gastos compartilhados, quem pagou o quê e saiba exatamente quem deve quanto no final do mês sem complicação.
        </div>

        <div id="couple-settings-wrap" style="display:${couple.enabled ? 'block' : 'none'}">
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:.75rem">
            <div>
              <label>Nome do Parceiro(a)</label>
              <input id="couple-partner-name" value="${esc(couple.partnerName)}" placeholder="Ex.: Ana">
            </div>
            <div>
              <label>Regra de Divisão</label>
              <select id="couple-split-rule">
                <option value="50_50" ${couple.splitRule === '50_50' ? 'selected' : ''}>50% / 50% (Meio a Meio)</option>
                <option value="proportional" ${couple.splitRule === 'proportional' ? 'selected' : ''}>Proporcional às Rendas</option>
              </select>
            </div>
            <div>
              <label>Sua Renda Mensal (R$)</label>
              <input id="couple-my-income" value="${centsToInput(couple.myIncomeCents)}" inputmode="decimal" placeholder="0,00">
            </div>
            <div>
              <label>Renda de ${esc(couple.partnerName || 'Parceiro(a)')} (R$)</label>
              <input id="couple-partner-income" value="${centsToInput(couple.partnerIncomeCents)}" inputmode="decimal" placeholder="0,00">
            </div>
            <div>
              <label>Teto de Orçamento Conjunto (R$)</label>
              <input id="couple-budget" value="${centsToInput(couple.monthlyBudgetCents)}" inputmode="decimal" placeholder="Sem limite">
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- APARÊNCIA & TEMAS -->
    <section class="card wide">
      <div class="ch">Aparência</div>
      <div class="cb">
        <div class="mut">Tema</div>
        <div class="th">
          ${THEMES.map((t) => `<button data-th="${t[0]}" aria-pressed="${S.theme === t[0]}">${t[1]}</button>`).join('')}
        </div>
        <div class="mut" style="margin-top:16px">Cor de destaque</div>
        <div class="sw">
          ${ACC.map((a) => `<button data-ac="${a[1]}" style="background:${a[1]}" aria-label="${a[0]}" aria-pressed="${S.accent === a[1]}"></button>`).join('')}
          <input type="color" id="cc" value="${S.accent}" aria-label="Cor personalizada" style="width:44px;height:34px;padding:2px">
        </div>
      </div>
    </section>

    <!-- META DE ECONOMIA MENSAL -->
    <section class="card wide">
      <div class="ch">Meta de Economia Mensal</div>
      <div class="cb">
        <div class="mut" style="margin-bottom:8px">Estipule o valor alvo de sobra líquida do mês (receitas − despesas).</div>
        <div class="goal-form">
          <input id="fgoal" inputmode="decimal" placeholder="Ex.: 2000,00" value="${esc(goalStr)}" aria-label="Meta mensal de economia (R$)">
          <button type="button" class="btn p" id="fgoal-save">Salvar</button>
          ${S.goalCents > 0 ? `<button type="button" class="btn" id="fgoal-clear">Limpar</button>` : ''}
        </div>
      </div>
    </section>

    ${cardsSection()}

    <!-- ATALHOS RÁPIDOS -->
    <section class="card wide">
      <div class="ch">
        <span>Atalhos Rápidos</span>
        <button type="button" class="btn p" data-shortcut-add style="padding:6px 12px;font-size:.8rem">+ Atalho</button>
      </div>
      <div class="cb">
        <div class="mut" style="margin-bottom:10px">Chips de 1 toque na tela inicial que registram o gasto na hora.</div>
        <div class="cat-manage-list">${shortcutRows}</div>
      </div>
    </section>

    <!-- COFRINHO DE ARREDONDAMENTO -->
    <section class="card wide">
      <div class="ch">Cofrinho de Arredondamento</div>
      <div class="cb">
        <label class="chk-row" style="margin-top:0">
          <input id="round-toggle" type="checkbox"${S.roundUpEnabled ? ' checked' : ''}>
          <span>Arredondar gastos para a próxima dezena de reais</span>
        </label>
        <div class="mut" style="margin-top:8px">
          ${S.roundUpEnabled ? `Guardado virtualmente neste mês: <b class="pos num">${brl(getRoundUpTotal())}</b>` : 'Cada gasto soma a diferença até a próxima dezena (ex.: R$ 12,50 → R$ 7,50 no cofrinho).'}
        </div>
      </div>
    </section>

    <!-- ORÇAMENTOS POR CATEGORIA -->
    <section class="card wide">
      <div class="ch">Orçamentos por Categoria</div>
      <div class="cb">
        <div class="mut" style="margin-bottom:10px">Defina o teto mensal de gastos (R$) para cada categoria de despesa.</div>
        <div class="budget-list">${budgetRowsHtml}</div>
      </div>
    </section>

    <!-- GERENCIAR CATEGORIAS -->
    <section class="card wide">
      <div class="ch">Gerenciar Categorias</div>
      <div class="cb">
        <div class="seg" style="margin-bottom:12px">
          <button type="button" data-cat-tab="out" aria-pressed="${profileCatTab === 'out'}">Despesas</button>
          <button type="button" data-cat-tab="in" aria-pressed="${profileCatTab === 'in'}">Receitas</button>
        </div>
        <div class="cat-manage-list">${catItemsHtml}</div>
        <form id="fcat" class="cat-form">
          <input id="fcat-icon" class="cat-icon-input" maxlength="4" placeholder="🏷" value="🏷" aria-label="Emoji da categoria">
          <input id="fcat-name" maxlength="30" placeholder="Nova categoria..." required aria-label="Nome da nova categoria">
          <button type="submit" class="btn p" id="fcat-add">Adicionar</button>
        </form>
      </div>
    </section>

    <!-- CENTRAL DE SUGESTÕES E FEEDBACK -->
    <section class="card wide">
      <div class="ch">
        <span>💡 Central de Sugestões & Feedback</span>
        <button type="button" class="btn btn-sm" data-export-suggestions style="font-size:.75rem">📥 Exportar CSV</button>
      </div>
      <div class="cb">
        <div class="mut" style="font-size:.82rem;margin-bottom:.75rem">
          Sua voz molda o Lumen! Envie sugestões de funcionalidades, melhorias visuais ou ideias para o casal.
        </div>

        <form id="f-suggestion" style="display:grid;gap:.5rem;margin-bottom:1rem">
          <div style="display:flex;gap:.5rem;flex-wrap:wrap">
            <select id="sugg-category" style="flex:1;min-width:140px;font-size:.85rem;padding:6px">
              <option value="idea">💡 Ideia / Recurso</option>
              <option value="ui">🎨 Interface / Visual</option>
              <option value="bug">🐛 Problema / Bug</option>
              <option value="couple">💑 Finanças de Casal</option>
            </select>
            <input id="sugg-message" placeholder="Descreva sua sugestão ou ideia..." required style="flex:3;min-width:200px;font-size:.85rem;padding:6px" maxlength="140">
            <button type="submit" class="btn p" style="padding:6px 14px;font-size:.85rem">Enviar</button>
          </div>
        </form>

        <div class="cat-manage-list">${suggestionsHtml}</div>
      </div>
    </section>

    <!-- REVER TOUR & ZONA DE PERIGO -->
    <section class="card wide">
      <div class="ch">Sistema & Dados</div>
      <div class="cb">
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button type="button" class="btn" data-restart-tour style="flex:1">✨ Rever Tour Guiado</button>
          <button type="button" class="btn" id="rst" style="flex:1">Apagar todos os dados</button>
        </div>
      </div>
    </section>
  `;

  return `
    <header class="wide">
      <h1><b>Perfil & Configurações</b></h1>
    </header>

    <div class="wide" style="margin-bottom:14px">
      <div class="seg">
        <button type="button" data-profile-section="overview" aria-pressed="${profileSectionTab === 'overview'}">👤 Meu Perfil</button>
        <button type="button" data-profile-section="settings" aria-pressed="${profileSectionTab === 'settings'}">⚙️ Configurações</button>
      </div>
    </div>

    ${profileSectionTab === 'overview' ? overviewTabHtml : settingsTabHtml}
  `;
}
