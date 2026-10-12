# Tabelas órfãs após a remoção de domínios descontinuados (2026-10)

A PR `chore/remove-discontinued-domains` removeu o código de space, design, finance,
expenses, tax-filings, write, recipes, learn, robot-assistant (página), benchmark/skill-eval e OIDC.
As migrations **não** foram alteradas nem removidas. As tabelas abaixo continuam no banco,
sem código que as use, e devem ser tratadas numa etapa futura (backup + migration de DROP):

| Tabela | Migration de origem | Domínio |
|---|---|---|
| `user_watchlist` | 048_user_watchlist.sql | finance |
| `expense_invoices` | 096_expense_invoices.sql | expenses |
| `tax_filings` | 099_tax_filings.sql | tax-filings |
| `benchmark_results` | 013_benchmark_results.sql | benchmark |
| `skill_eval_results` | 024_skill_eval_results.sql | skill-eval |
| `oidc_models` | 014_oidc_provider.sql | oidc |

Linhas na tabela `domains` (e `user_domain_access`/`domain_*`) para os slugs
`space`, `design`, `finance`, `recipes`, `write`, `learn`, `benchmark` continuam presentes
(migrations 034, 044, 075, 078, 083...). Como a navegação não lista mais esses slugs e as
rotas foram removidas, elas são inofensivas; podem ser marcadas `is_active = false` ou
removidas na mesma migration futura. O slug `robot-assistant` continua em uso pela
Control API `/api/v1/robot/settings` (cliente Android).

O código removido está preservado na branch `archive/pre-cleanup-2026-10` e na tag `v0.0.22`.
