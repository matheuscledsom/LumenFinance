# AGENTS.md — Governança e Arquitetura do Lumen Finance

## 1. Stack & Restrições (Zero Runtime Dependencies)
- **Core**: HTML5 Semântico (`index.html`), Vanilla CSS Modular (`css/base.css`, `css/components.css`, `css/layout.css`) e **TypeScript estrito + Vite** (`src/`).
- **Zero Dependências de Runtime**: Proibido instalar bibliotecas externas no `dependencies` (React, Tailwind, Chart.js, date-fns, etc.). Gráficos devem usar SVG puro declarativo; datas e moedas devem usar os helpers em `src/utils/`.
- **Valores Monetários**: Sempre inteiros em **centavos** (`number`). Formatação via `brl()` / `brlPlain()` e parse via `parseAmountInput()` / `parseCents()`.
- **Sanitização**: Toda string de usuário interpolada em HTML deve passar por `esc()`.

## 2. Árvore do Projeto (`src/`)
- `src/main.ts`: Boot, `render()`, `theme()`, `toast()` e **delegação centralizada de eventos** (`click`, `change`, `input`, `submit`).
- `src/state.ts`: Estado único `S` (`localStorage` key `'lumen.v1'`), `save()`, `migrate()` e mutações puras de domínio.
- `src/db.ts`: Wrapper IndexedDB (`lumen_db`) para anexos pesados, comprovantes, avatar e banner de perfil.
- `src/types/finance.ts`: Contratos e interfaces TypeScript.
- `src/components/`: Funções declarativas que retornam strings HTML (`home.ts`, `cards.ts`, `stats.ts`, `calendar.ts`, `debts.ts`, `history.ts`, `profile.ts`, `form-modal.ts`, `dialogs.ts`, `onboarding.ts`).
- `src/utils/`: `currency.ts`, `date.ts`, `credit-card.ts`, `qol.ts`, `category-guesser.ts`, `csv.ts`.

## 3. Regras de Ouro de Engenharia (Obrigatórias)
1. **Fluxo Unidirecional**: `Mutação em S -> save() -> render()`.
2. **Proibido Listeners Globais Fora do `main.ts`**: Componentes em `src/components/` NÃO devem registrar `document.addEventListener` no topo do módulo nem acumular listeners em elementos persistentes (`#f`, `#f2`). Toda ação de clique/submit deve usar `data-*` tratado em `src/main.ts`.
3. **Compatibilidade de Temas**: Todo componente novo deve respeitar as variáveis CSS (`--bg`, `--card`, `--bd`, `--tx`, `--mut`, `--pos`, `--neg`, `--ac`, `--on`, `--r`, `--sh`) e funcionar nos temas `oled`, `white`, `grey`, `xp` e novos temas sem cores hardcoded que quebrem contraste.
4. **Acessibilidade & Movimento**: Respeitar `@media (prefers-reduced-motion: no-preference)` e manter atributos `aria-*`.

## 4. Definition of Done (Verificação Obrigatória)
- Executar `npm run check` (`tsc --noEmit`) após qualquer alteração: **zero erros de TypeScript**.
- Garantir migração retroativa segura em `migrate()` (`src/state.ts`) sempre que `AppState` receber novas propriedades.
- Commits no padrão *Conventional Commits* (`feat:`, `fix:`, `refactor:`).
