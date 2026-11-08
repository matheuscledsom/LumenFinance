# AGENTS.md — Governança e Arquitetura do Lumen Finance

Este documento define as diretrizes arquiteturais, restrições técnicas e padrões de qualidade obrigatórios para qualquer desenvolvimento ou manutenção no projeto **Lumen Finance**.

---

## 1. Stack Tecnológica

- **HTML5 Semântico**: Uso estrito de elementos semânticos nativos (`<header>`, `<main>`, `<section>`, `<nav>`, `<dialog>`, `<form>`) e atributos de acessibilidade (`aria-label`, `aria-pressed`, `aria-current`, `role="status"`, `role="alert"`).
- **CSS Puro (Vanilla CSS)**: Estilização baseada em variáveis customizadas (CSS Custom Properties) definidas em `:root` e sobrescritas por `[data-theme]`:
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
- **Vanilla JS (ES6+)**: Código moderno, enxuto e sem dependências de terceiros em tempo de execução. Valores monetários devem ser armazenados sempre em **centavos (inteiros)** para evitar imprecisões de ponto flutuante e formatados via `brl()`.

---

## 2. Arquitetura de Estado Central

A aplicação segue um **fluxo de dados estritamente unidirecional**:

```text
S (Mutação de Estado) ──► save() (Persistência) ──► render() (Atualização de UI)
```

1. **Estado Único (`S`)**:
   - Objeto central contendo preferências do usuário (`name`, `theme`, `accent`, `hide`, `per`) e a coleção de transações (`tx`).
   - Estado de navegação controlado pela variável de visão ativa (`view`).
2. **Persistência (`save()`)**:
   - Sincroniza o objeto `S` no `localStorage` sob a chave versionada `K = 'lumen.v1'` com tratamento seguro de exceções (`try/catch`).
3. **Renderização Declarativa (`render()`)**:
   - Aplica o tema e variáveis dinâmicas via `theme()`.
   - Reconstrói a árvore DOM da view ativa (`home`, `profile`, `stats`, `cal`) e a barra de navegação (`#nav`) de forma determinística a partir de `S`.
   - Toda interpolação de dados fornecidos pelo usuário deve passar pelo helper de sanitização `esc()`.
4. **Delegação de Eventos**:
   - Listeners globais centralizados (`click`, `change`, `submit`) que capturam interações via `Element.closest()`, atualizam `S`, invocam `save()` e disparam `render()`.

---

## 3. Proibições e Restrições (Guardrails)

- **Proibido introduzir frameworks ou bibliotecas pesadas**: Não utilizar React, Vue, Angular, Svelte, jQuery, Tailwind CSS ou bundlers complexos. O projeto deve permanecer leve, autossuficiente e executável diretamente no navegador.
- **Compatibilidade obrigatória com todos os temas**:
  - Qualquer novo componente ou ajuste de layout deve funcionar perfeitamente nos temas `oled` (padrão escuro profundo), `white` (claro), `grey` (cinza escuro) e, em especial, no tema **`xp` (Windows XP)** — preservando suas bordas específicas, gradientes clássicos e legibilidade.
  - A validação de contraste (mínimo `3:1` via `con()` e `lum()`) deve ser mantida para cores de destaque personalizadas.
- **Respeito a `prefers-reduced-motion`**:
  - Animações e transições de CSS devem ser encapsuladas em `@media (prefers-reduced-motion: no-preference)` para garantir acessibilidade a usuários sensíveis a movimento.
- **Preservação de Safe Areas e Responsividade**:
  - Manter suporte a `env(safe-area-inset-*)` para dispositivos móveis e a transição fluida entre barra inferior mobile e sidebar fixa no desktop (`@media (min-width: 900px)`).

---

## 4. Padrão de Verificação (Definition of Done)

Antes de realizar qualquer commit:

1. **Lint e Validação Sintática**: O código HTML, CSS e JavaScript deve ser validado sem erros de sintaxe.
2. **Zero Erros de Console**: Nenhuma interação ou carregamento de página pode gerar `SyntaxError`, `ReferenceError`, `TypeError` ou avisos/erros no console do navegador.
3. **Integridade Funcional**:
   - Testar o ciclo completo `S -> save() -> render()`.
   - Verificar cadastro e exclusão de gastos/ganhos, ocultação de saldo (`hide`), troca de período (`per`), troca de temas (incluindo `oled` e `xp`) e cores de destaque.
4. **Padronização de Commits**: Utilizar mensagens claras seguindo o padrão *Conventional Commits* (`feat:`, `fix:`, `chore:`, `refactor:`, etc.).
