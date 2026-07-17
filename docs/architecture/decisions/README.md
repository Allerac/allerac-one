# Architecture Decision Records

This directory records significant architecture decisions for Allerac One.

ADRs are used when a decision changes system boundaries, deployment shape, security
model, data ownership, or long-term API contracts. They should be short, dated, and
explicit about context and consequences.

## Records

| ADR | Status | Title |
|---|---|---|
| [0001](0001-adopt-control-api-v1.md) | Accepted | Adopt Control API v1 as the Allerac control plane |
| [0002](0002-keep-control-api-in-app-container-initially.md) | Accepted | Keep Control API in the app container initially |
| [0003](0003-expose-control-api-through-cloudflare-path-policy.md) | Accepted | Expose Control API through Cloudflare path policy |

## Status Values

- `Proposed` — under discussion, not committed.
- `Accepted` — current direction.
- `Superseded` — replaced by a newer ADR.
- `Rejected` — considered but not chosen.
