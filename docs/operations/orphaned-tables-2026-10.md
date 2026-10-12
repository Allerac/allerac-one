# Tabelas órfãs após a remoção de domínios descontinuados (2026-10)

A PR `chore/remove-discontinued-domains` removeu o código de space, design, finance,
expenses, tax-filings, write, recipes, learn, robot (página, Control API, cliente Android e speech), skill-eval e OIDC. O benchmark foi mantido e `benchmark_results` continua em uso.
As migrations **não** foram alteradas nem removidas. As tabelas abaixo continuam no banco,
sem código que as use, e devem ser tratadas numa etapa futura (backup + migration de DROP):

| Tabela | Migration de origem | Domínio |
|---|---|---|
| `user_watchlist` | 048_user_watchlist.sql | finance |
| `expense_invoices` | 096_expense_invoices.sql | expenses |
| `tax_filings` | 099_tax_filings.sql | tax-filings |
| `skill_eval_results` | 024_skill_eval_results.sql | skill-eval |
| `oidc_models` | 014_oidc_provider.sql | oidc |

Linhas na tabela `domains` (e `user_domain_access`/`domain_*`) para os slugs
`space`, `design`, `finance`, `recipes`, `write`, `learn`, `robot-assistant` continuam presentes
(migrations 034, 044, 075, 078, 083...). Como a navegação não lista mais esses slugs e as
rotas foram removidas, elas são inofensivas; podem ser marcadas `is_active = false` ou
removidas na mesma migration futura. O robot não criou tabelas próprias. Ficam órfãos os dados dele:
- a linha `robot-assistant` em `domains`, a skill semeada e as ligações em `skill_tools`
  e `domain_skill_defaults` (migration 082_robot_assistant_domain.sql);
- as chaves `robot_speech_voice`, `robot_speech_speed` e `robot_speech_style` em
  `system_settings`, se tiverem sido salvas;
- chaves da Control API criadas para o cliente Android (`control_api_keys`), que podem
  ser revogadas pela UI.

O código removido está preservado na branch `archive/pre-cleanup-2026-10` e na tag `v0.0.22`.
