# AGENTS.md — Governança e Arquitetura do Lumen Finance

Este documento define as diretrizes arquiteturais, estrutura modular, restrições técnicas e padrões de qualidade obrigatórios para qualquer desenvolvimento ou manutenção no projeto **Lumen Finance**.

---

## 1. Stack Tecnológica

- **HTML5 Semântico**: Uso estrito de elementos semânticos nativos (`<header>`, `<main>`, `<section>`, `<nav>`, `<dialog>`, `<form>`) e atributos de acessibilidade (`aria-label`, `aria-pressed`, `aria-current`, `role="status"`, `role="alert"`).
- **CSS Puro (Vanilla CSS Modular)**: Estilização dividida em `css/base.css`, `css/components.css` e `css/layout.css`, baseada em variáveis customizadas (CSS Custom Properties) definidas em `:root` e sobrescritas por `[data-theme]`:
  - `--bg`: Cor de fundo principal da aplicação
  - `--card`: Superfície de cartões, modais e barra de navegação
  - `--bd`: Cor de bordas e divisores
  - `--tx`: Cor principal de texto
  - `--mut`: Cor de texto secundário/auxiliar
  - `--pos` / `--neg`: Cores semânticas para valores positivos (ganhos) e negativos (gastos)
  - `--ac`: Cor de destaque (accent) configurável pelo usuário
  - `--on`: Cor de contraste sobre elementos preenchidos com `--ac`
  - `--r`: Raio de borda padrão (`border-radius`)
  - `--sh`: Sombra de elevação dos cartões (`box-shadow`)
  - `--font`: Família tipográfica ativa
- **Vanilla JS (ES6+ Modules)**: Código modular nativo (`<script type="module" src="js/app.js">`), enxuto e sem dependências de terceiros ou bundlers em tempo de execução. Valores monetários devem ser armazenados sempre em **centavos (inteiros)** para evitar imprecisões de ponto flutuante e formatados via `brl()`.

---

## 2. Estrutura Modular de Diretórios

```text
lumen-finance/
├── index.html              # Casca semântica da interface e modais básicos
├── AGENTS.md               # Governança, arquitetura e regras para agentes
├── manifest.json           # Configuração de PWA
├── sw.js                   # Service Worker para cache offline-first
│
├── css/
│   ├── base.css            # Reset, variáveis globais (--bg, --card, --ac) e temas (XP, OLED, Branco, Cinza)
│   ├── components.css      # Botões (.btn), cards (.card), modais, tags (.pill), listas e overrides XP
│   └── layout.css          # Grid principal, cabeçalho, navegação lateral e barra inferior
│
└── js/
    ├── app.js              # Ponto de entrada (boot, roteamento de abas, render central e eventos)
    ├── state.js            # Definição de S, save(), get(), resetState() e migrações
    ├── db.js               # Wrapper do IndexedDB (para recibos e anexos pesados)
    │
    ├── components/         # Funções puras/declarativas que retornam HTML de blocos e telas
    │   ├── home.js         # Cards de saldo, resumo de gastos e últimas movimentações
    │   ├── stats.js        # Painel analítico e renderização de gráficos
    │   ├── calendar.js     # Grade do mês e contas a vencer
    │   ├── profile.js      # Gerenciamento de temas, cores de destaque e conta
    │   └── form-modal.js   # Modal de criação e edição com validações
    │
    └── utils/              # Funções utilitárias puras
        ├── currency.js     # brl(), parseCents(), esc(), lum(), con()
        ├── date.js         # prevM(), dfmt(), ym(), manipulação de datas ISO
        └── csv.js          # Exportação e importação de planilhas CSV
```

---

## 3. Arquitetura de Estado Central

A aplicação segue um **fluxo de dados estritamente unidirecional**:

```text
S (Mutação de Estado) ──► save() (Persistência) ──► render() (Atualização de UI)
```

1. **Estado Único (`S` em `js/state.js`)**:
   - Objeto central contendo preferências do usuário (`name`, `theme`, `accent`, `hide`, `per`) e a coleção de transações (`tx`).
   - Estado de navegação controlado por `view` e atualizado via `setView()`.
2. **Persistência (`save()` em `js/state.js`)**:
   - Sincroniza o objeto `S` no `localStorage` sob a chave versionada `K = 'lumen.v1'` com tratamento seguro de exceções (`try/catch`).
3. **Renderização Declarativa (`render()` em `js/app.js`)**:
   - Aplica o tema e variáveis dinâmicas via `theme()`.
   - Reconstrói a árvore DOM da view ativa (`home`, `profile`, `stats`, `cal`) e a barra de navegação (`#nav`) de forma determinística a partir de `S`.
   - Toda interpolação de dados fornecidos pelo usuário deve passar pelo helper de sanitização `esc()`.
4. **Delegação de Eventos (`js/app.js`)**:
   - Listeners globais centralizados (`click`, `change`, `submit`) que capturam interações via `Element.closest()`, atualizam `S`, invocam `save()` e disparam `render()`.

---

## 4. Proibições e Restrições (Guardrails)

- **Proibido introduzir frameworks ou bibliotecas pesadas**: Não utilizar React, Vue, Angular, Svelte, jQuery, Tailwind CSS ou bundlers complexos (Webpack/Vite). O projeto deve permanecer leve, autossuficiente e executável via ES Modules nativos.
- **Compatibilidade obrigatória com todos os temas**:
  - Qualquer novo componente ou ajuste de layout deve funcionar perfeitamente nos temas `oled` (padrão escuro profundo), `white` (claro), `grey` (cinza escuro) e, em especial, no tema **`xp` (Windows XP)** — preservando suas bordas específicas, gradientes clássicos e legibilidade.
  - A validação de contraste (mínimo `3:1` via `con()` e `lum()`) deve ser mantida para cores de destaque personalizadas.
- **Respeito a `prefers-reduced-motion`**:
  - Animações e transições de CSS devem ser encapsuladas em `@media (prefers-reduced-motion: no-preference)` para garantir acessibilidade a usuários sensíveis a movimento.
- **Preservação de Safe Areas e Responsividade**:
  - Manter suporte a `env(safe-area-inset-*)` para dispositivos móveis e a transição fluida entre barra inferior mobile e sidebar fixa no desktop (`@media (min-width: 900px)`).

---

## 5. Padrão de Verificação (Definition of Done)

Antes de realizar qualquer commit:

1. **Lint e Validação Sintática**: Todos os módulos HTML, CSS, JSON e JavaScript devem ser validados sem erros de sintaxe ou de importação ES Module.
2. **Zero Erros de Console**: Nenhuma interação ou carregamento de página pode gerar `SyntaxError`, `ReferenceError`, `TypeError` ou avisos/erros no console do navegador.
3. **Integridade Funcional**:
   - Testar o ciclo completo `S -> save() -> render()`.
   - Verificar cadastro e exclusão de gastos/ganhos, ocultação de saldo (`hide`), troca de período (`per`), troca de temas (incluindo `oled` e `xp`) e cores de destaque.
4. **Padronização de Commits**: Utilizar mensagens claras seguindo o padrão *Conventional Commits* (`feat:`, `fix:`, `chore:`, `refactor:`, etc.).
