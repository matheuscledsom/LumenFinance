/* ==========================================================================
   home.ts — Tela Inicial: Saldo, Meta de Economia, Gastos Pessoais, Orçamentos e Movimentações
   ========================================================================== */

import {
  S,
  getAccountBalances,
  getCategoryBudgetsProgress,
  getRoundUpTotal,
  normalizePay,
  normalizeTags
} from '../state';
import { getCategoryIcon, getPaymentLabel } from '../types/finance';
import { brl, esc, sum } from '../utils/currency';
import { getHomeCommitmentsBreakdown } from '../utils/credit-card';
import { now, cur, ym, prevM, dfmt } from '../utils/date';

export function home(): string {
  const A = S.tx;
  const m = prevM(cur, S.per);
  const pm = prevM(cur, S.per + 1);

  const activeForBalance = A.filter(
    (t) =>
      (t.status === 'confirmed' || ym(t.d) <= m) &&
      !(t.type === 'out' && t.thirdParty?.isThirdParty && t.thirdParty.isReimbursed)
  );
  const bal = sum(activeForBalance);
  const prevBal = sum(
    activeForBalance.filter((t) => ym(t.d) <= prevM(cur, 0) && ym(t.d) < cur)
  );
  const chg = prevBal ? ((bal - prevBal) / Math.abs(prevBal)) * 100 : null;

  const mo = A.filter(
    (t) => ym(t.d) === m && (t.status === 'confirmed' || ym(t.d) === m)
  );
  const out = mo.filter((t) => t.type === 'out' && !t.thirdParty?.isThirdParty);
  const inc = mo.filter((t) => t.type === 'in');

  const spent = out.reduce((a, t) => a + t.v, 0);
  const earned = inc.reduce((a, t) => a + t.v, 0);
  const netMonth = earned - spent;
  const pspent = A.filter(
    (t) =>
      t.type === 'out' &&
      !t.thirdParty?.isThirdParty &&
      ym(t.d) === pm &&
      (t.status === 'confirmed' || ym(t.d) === pm)
  ).reduce((a, t) => a + t.v, 0);

  const sv = pspent ? ((spent - pspent) / pspent) * 100 : null;
  const pct = earned ? Math.min(100, (spent / earned) * 100) : 0;

  const budgetProgresses = getCategoryBudgetsProgress(m);

  const by: Record<string, number> = {};
  out.forEach((t) => {
    by[t.c] = (by[t.c] || 0) + t.v;
  });
  for (const bp of budgetProgresses) {
    if (!(bp.categoryName in by)) {
      by[bp.categoryName] = bp.spentCents;
    }
  }

  const rows: [string, number][] = Object.entries(by).sort((a, b) => b[1] - a[1]);
  const top: [string, number][] = rows.slice(0, 3);
  const remaining = rows.slice(3);
  let rest = 0;
  for (const r of remaining) {
    const hasBudget = budgetProgresses.some(
      (b) => b.categoryName.toLowerCase() === r[0].toLowerCase()
    );
    if (hasBudget) {
      top.push(r);
    } else {
      rest += r[1];
    }
  }
  if (rest) top.push(['Outros', rest]);

  const R = 44;
  const C = 2 * Math.PI * R;
  let off = 0;
  const arcs = spent
    ? top
        .filter((r) => r[1] > 0)
        .map((r, i) => {
          const f = r[1] / spent;
          const s = `<circle r="${R}" cx="60" cy="60" fill="none" stroke="var(--ac)" stroke-opacity="${Math.max(0.2, 1 - i * 0.22)}" stroke-width="14" stroke-dasharray="${f * C} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 60 60)"/>`;
          off += f * C;
          return s;
        })
        .join('')
    : '';

  const visibleTx = A.filter((t) => t.status === 'confirmed' || ym(t.d) <= m);
  const last = [...(visibleTx.length ? visibleTx : A)]
    .reverse()
    .sort((a, b) => b.d.localeCompare(a.d))
    .slice(0, 6);
  const ch = (t: string, r = ''): string => `<div class="ch"><span>${t}</span>${r}</div>`;

  const accountBalances = getAccountBalances();
  const accountPillsHtml = accountBalances.length
    ? `<div class="account-pills-bar wide" role="group" aria-label="Saldos por conta">${accountBalances
        .map(({ account, currentBalanceCents }) => {
          const formatted = S.hide ? '••••' : brl(currentBalanceCents);
          return `<span class="account-pill" title="Saldo na conta ${esc(account.name)}">${esc(account.icon)} <span class="acc-name">${esc(account.name)}:</span> <b class="num ${currentBalanceCents >= 0 ? '' : 'neg'}">${formatted}</b></span>`;
        })
        .join('')}</div>`
    : '';

  const commitments = getHomeCommitmentsBreakdown(m);
  const totalCommitmentsDisplay = S.hide ? '••••' : brl(commitments.totalCommitmentsCents);

  const barSegmentsHtml =
    commitments.totalCommitmentsCents > 0
      ? commitments.segments
          .filter((s) => s.pct > 0)
          .map((s) => {
            const segVal = S.hide ? '••••' : brl(s.amountCents);
            return `<div class="commitments-bar-seg" style="width:${s.pct.toFixed(1)}%;background:${esc(s.color)}" title="${esc(s.label)}: ${segVal} (${s.pct.toFixed(0)}%)"></div>`;
          })
          .join('')
      : '<div class="commitments-bar-empty" style="width:100%;height:100%"></div>';

  const cardLegendItems = commitments.cardDetails
    .filter((cd) => cd.invoiceTotalCents > 0)
    .map((cd) => {
      const invVal = S.hide ? '••••' : brl(cd.invoiceTotalCents);
      const statusBadge =
        cd.status === 'paid'
          ? '<span class="pill pos" style="font-size:.7rem">Paga</span>'
          : `<span class="mut" style="font-size:.74rem">Fecha dia ${cd.closingDay} · Vence dia ${cd.dueDay}</span>`;
      return `<div class="commitments-item">
        <div class="commitments-item-left"><i class="dot" style="background:${esc(cd.card.color)}"></i><span>💳 <b>${esc(cd.card.name)}</b></span></div>
        <div class="commitments-item-right"><b class="num">${invVal}</b>${statusBadge}</div>
      </div>`;
    });

  const debtsToPayItem =
    commitments.totalDebtsToPayCents > 0
      ? `<div class="commitments-item">
        <div class="commitments-item-left"><i class="dot" style="background:var(--neg)"></i><span>📤 <b>Devo a terceiros</b></span></div>
        <div class="commitments-item-right"><b class="num neg">${S.hide ? '••••' : brl(commitments.totalDebtsToPayCents)}</b><span class="mut" style="font-size:.74rem">Dívidas ativas</span></div>
      </div>`
      : '';

  const debtsToReceiveItem =
    commitments.totalDebtsToReceiveCents > 0
      ? `<div class="commitments-item commitments-receive">
        <div class="commitments-item-left"><i class="dot" style="background:var(--pos)"></i><span class="pos">📥 <b>A receber de amigos</b></span></div>
        <div class="commitments-item-right"><b class="num pos">+ ${S.hide ? '••••' : brl(commitments.totalDebtsToReceiveCents)}</b><span class="mut" style="font-size:.74rem">Contas a cobrar</span></div>
      </div>`
      : '';

  const legendContent = [...cardLegendItems, debtsToPayItem, debtsToReceiveItem].filter(Boolean).join('');

  const commitmentsCardHtml = `<section class="card wide commitments-card">
    ${ch('Faturas e Compromissos do Mês', `<span class="pill ${commitments.totalCommitmentsCents > 0 ? 'neg' : 'pos'}">Total: ${totalCommitmentsDisplay}</span>`)}
    <div class="cb">
      <div class="commitments-bar" role="progressbar" aria-label="Distribuição de faturas e compromissos" aria-valuenow="${commitments.totalCommitmentsCents}">${barSegmentsHtml}</div>
      ${
        legendContent
          ? `<div class="commitments-legend">${legendContent}</div>`
          : `<div class="mut" style="font-size:.82rem;text-align:center;padding:6px 0">Nenhuma fatura ou dívida a pagar neste mês. 🎉</div>`
      }
    </div>
  </section>`;

  const quickChips = S.quickShortcuts
    .map(
      (sc) =>
        `<button type="button" class="quick-chip" data-quick="${esc(sc.id)}" aria-label="Registrar ${esc(sc.label)} por ${brl(sc.amountCents)}">${esc(sc.label)} <b class="num">${brl(sc.amountCents)}</b></button>`
    )
    .join('');
  const quickBarHtml = `<div class="quick-bar wide" role="group" aria-label="Atalhos rápidos">${quickChips}<button type="button" class="quick-chip quick-add" data-shortcut-add>+ Adicionar atalho</button>${
    S.roundUpEnabled
      ? `<span class="pill pos" title="Cofrinho de arredondamento do mês">🐷 ${brl(getRoundUpTotal(m))}</span>`
      : ''
  }</div>`;

  const savedCents = Math.max(0, netMonth);
  const goalPct = S.goalCents > 0 ? Math.max(0, (savedCents / S.goalCents) * 100) : 0;
  const goalBarWidth = Math.min(100, goalPct).toFixed(0);

  const goalCardHtml =
    S.goalCents > 0
      ? `<section class="card wide">${ch('Meta de economia mensal', `<span class="pill ${goalPct >= 100 ? 'pos' : ''}">${goalPct.toFixed(0)}%</span>`)}<div class="cb"><div class="goal-summary"><b>${brl(savedCents)} de ${brl(S.goalCents)} economizados · ${goalPct.toFixed(0)}%</b><span class="mut">Saldo líquido do mês: <b class="${netMonth >= 0 ? 'pos' : 'neg'}">${brl(netMonth)}</b></span></div><div class="prog-track" role="progressbar" aria-valuenow="${goalPct.toFixed(0)}" aria-valuemin="0" aria-valuemax="100"><div class="prog-fill ${goalPct >= 100 ? 'pos-bg' : ''}" style="width:${goalBarWidth}%"></div></div></div></section>`
      : `<section class="card wide">${ch('Meta de economia mensal')}<div class="cb"><div class="goal-summary"><span class="mut">Saldo líquido do mês: <b class="${netMonth >= 0 ? 'pos' : 'neg'}">${brl(netMonth)}</b> · Defina uma meta mensal no seu <button type="button" class="link-btn" data-v="profile">Perfil</button>.</span></div></div></section>`;

  const legItemsHtml = top
    .map((r, i) => {
      const sharePct = spent > 0 ? ((r[1] / spent) * 100).toFixed(0) : '0';
      const bp = budgetProgresses.find(
        (b) =>
          b.categoryName.toLowerCase() === r[0].toLowerCase() || b.categoryId === r[0]
      );
      const budgetBarHtml = bp
        ? `<div class="leg-budget"><div class="leg-budget-head"><span class="mut ${bp.isOverBudget ? 'neg' : ''}">Orçamento: ${brl(bp.spentCents)} / ${brl(bp.limitCents)} (${bp.percentage.toFixed(0)}%)</span>${bp.isOverBudget ? '<span class="pill neg badge-over">Limite estourado</span>' : ''}</div><div class="prog-track" role="progressbar" aria-valuenow="${bp.percentage.toFixed(0)}" aria-valuemin="0" aria-valuemax="100"><div class="prog-fill ${bp.isOverBudget ? 'neg-bg' : ''}" style="width:${Math.min(100, Math.max(0, bp.percentage)).toFixed(0)}%"></div></div></div>`
        : '';
      return `<div class="leg-item"><div class="leg-row"><i class="dot" style="background:var(--ac);opacity:${Math.max(0.2, 1 - i * 0.22)}"></i><span>${esc(r[0])}</span><span class="num">${brl(r[1])}</span><span class="mut num">${sharePct}%</span></div>${budgetBarHtml}</div>`;
    })
    .join('');

  return `<header class="wide"><h1>Olá, <b>${esc(S.name)}</b><div class="mut" style="font-size:.8rem;font-weight:500">${now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</div></h1>
<div style="display:flex;gap:8px"><button class="ib" id="eye" aria-label="${S.hide ? 'Mostrar' : 'Ocultar'} valores" aria-pressed="${S.hide}">${S.hide ? '🙈' : '👁'}</button><button class="ib" data-v="profile" aria-label="Configurações">⚙</button></div></header>
<section class="card bal wide" title="Toque duas vezes para ocultar/mostrar valores">${ch('Saldo total')}<div class="cb"><div class="big num">${brl(bal)}</div>
<span class="pill ${chg == null ? '' : chg >= 0 ? 'pos' : 'neg'}">${chg == null ? 'Sem mês anterior para comparar' : (chg >= 0 ? '↑ +' : '↓ ') + chg.toFixed(0) + '% vs. mês passado'}</span></div></section>
${accountPillsHtml}
${quickBarHtml}
<div class="acts wide"><button class="btn" data-add="out">− Registrar gasto</button><button class="btn p" data-add="in">+ Registrar ganho</button></div>
${commitmentsCardHtml}
${goalCardHtml}
<section class="card">${ch('Seus gastos', `<select id="per" aria-label="Período"><option value="0">Este mês</option><option value="1">Mês passado</option></select>`)}<div class="cb">
${
  spent || budgetProgresses.length
    ? `<div class="spend"><div><div class="big num" style="font-size:1.8rem">${brl(spent)}</div><div class="mut">Total de gastos</div>${sv == null ? '' : `<div class="${sv <= 0 ? 'pos' : 'neg'}" style="margin-top:8px;font-weight:700">${sv <= 0 ? '↓' : '↑'} ${Math.abs(sv).toFixed(0)}% <span class="mut">vs. mês anterior</span></div>`}</div>
<svg width="120" height="120" viewBox="0 0 120 120" role="img" aria-label="${pct.toFixed(0)}% da renda gasta"><circle r="${R}" cx="60" cy="60" fill="none" stroke="var(--bd)" stroke-width="14"/>${arcs}<text x="60" y="60" text-anchor="middle" fill="var(--tx)" font-weight="800" font-size="18">${earned ? pct.toFixed(0) + '%' : '—'}</text><text x="60" y="76" text-anchor="middle" fill="var(--mut)" font-size="10">da renda</text></svg></div>
<div class="leg">${legItemsHtml}</div>`
    : `<div class="empty">Nenhum gasto neste período.<br><button class="btn p" data-add="out">Registrar gasto</button></div>`
}</div></section>
<section class="card">${ch('Últimas movimentações', '<button type="button" class="link-btn" data-v="history">Ver histórico completo</button>')}<div class="cb">
${
  last.length
    ? last
        .map((t) => {
          const icon = getCategoryIcon(S.cats, t.type, t.c);
          const tags = normalizeTags(t.tags);
          const tagsHtml = tags
            .map((tag) => `<span class="pill-tag">#${esc(tag)}</span>`)
            .join('');

          const card =
            t.pay === 'credit' && t.cardId ? S.cards.find((c) => c.id === t.cardId) : undefined;
          const account = t.accountId ? S.accounts.find((a) => a.id === t.accountId) : undefined;

          let payBadge = '';
          if (card) {
            const instStr =
              t.installments && t.installments.total > 1
                ? ` · ${t.installments.current}/${t.installments.total}`
                : '';
            payBadge = `<span class="pill-sub card-badge" style="border-color:${esc(card.color)}">💳 ${esc(card.name)}${instStr}</span>`;
          } else {
            const baseLabel = getPaymentLabel(normalizePay(t.pay));
            if (account && t.pay !== 'credit') {
              payBadge = `<span class="mut">${esc(baseLabel)} · ${esc(account.icon)} ${esc(account.name)}</span>`;
            } else {
              payBadge = `<span class="mut">${esc(baseLabel)}</span>`;
            }
          }

          const instBadge =
            !card && t.installments && t.installments.total > 1
              ? `<span class="pill-sub">💳 ${t.installments.current}/${t.installments.total}</span>`
              : '';
          const recBadge = t.recurring ? `<span class="pill-sub">🔁 Fixa</span>` : '';
          const pendingBadge =
            t.status === 'pending'
              ? `<span class="pill-sub pending">Pendente</span>`
              : '';
          const tpBadge = t.thirdParty?.isThirdParty
            ? `<span class="pill-sub tp-badge ${t.thirdParty.isReimbursed ? 'pos' : 'tp-pending'}" data-toggle-tp="${esc(t.id)}" role="button" tabindex="0" aria-label="Alternar cobrança de ${esc(t.thirdParty.personName)}">👤 ${esc(t.thirdParty.personName)} · ${t.thirdParty.isReimbursed ? '✓ Pago' : 'A Cobrar'}</span>`
            : '';
          const splitBadge =
            t.splitInfo && t.splitInfo.participants.length > 1
              ? `<span class="pill-sub split-badge">🤝 Dividido (${t.splitInfo.participants.length} pessoas)</span>`
              : '';

          const subBadges = tpBadge + splitBadge + instBadge + recBadge + pendingBadge;
          const hasChips = Boolean(subBadges || tagsHtml);
          const payAndTags = `<span class="tx-meta">${payBadge}${hasChips ? ' · ' : ''}${subBadges}${tagsHtml}</span>`;
          return `<button class="tx ${t.type}${t.status === 'pending' ? ' pending-tx' : ''}" data-id="${esc(t.id)}" aria-label="Editar ${esc(t.n)}"><span class="av">${esc(icon)}</span><span class="m"><b>${esc(t.n)}</b><span class="mut">${esc(t.c)} · ${dfmt(t.d)}</span>${payAndTags}</span><b class="num ${t.type === 'in' ? 'pos' : 'neg'}">${t.type === 'in' ? '+' : '−'} ${brl(t.v)}</b></button>`;
        })
        .join('') + '<div class="mut" style="margin-top:8px">Toque em uma movimentação para editá-la.</div>'
    : `<div class="empty">Suas movimentações aparecerão aqui.<br><button class="btn p" data-add="in">Registrar ganho</button></div>`
}</div></section>`;
}
