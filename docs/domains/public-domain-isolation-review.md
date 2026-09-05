# Public domain isolation review

Status: initial application-level mitigations implemented locally; production account and deployment checks remain open.

Date opened: 2026-09-05

Initial affected domain: `sales`

Related public domain: `openworld`

## Purpose

This document records the isolation failure observed in the public `sales` agent and defines the
security model and repeatable checks required before any Allerac domain is exposed to anonymous or
external users.

It is both an incident record and the starting point for remediation. A public domain must not be
considered safe because its prompt says that it has no access. Isolation must be enforced by the
server at every layer and verified by automated and deployment-time checks.

## Incident summary

During a conversation through the `sales` widget on `allerac.ai`, the assistant disclosed the name
and location associated with the API-key account:

- Name: Gian
- Location: Barcelona
- Account language and current date/time context

The assistant also claimed that it could save and retrieve notes and reminders. It said that a
dentist appointment had been saved, but later said that it could not retrieve earlier notes.

### Current interpretation

The personal profile disclosure was real: the shared prompt builder includes the authenticated
account's name and location for all domains, including public domains.

The claimed note creation was most likely a model hallucination, not a successful tool call. The
current tool registry excludes note, memory, scheduling, and self-instruction tools from domains
listed in `PUBLIC_DOMAINS`. Tool-call events or production logs are still required to prove what
happened in that specific request.

The absence of a successful note call does not make the configuration safe. The general tool
resolver treats an empty `skill_tools` result as unrestricted access to the base tool registry.
That registry can include shell, web, URL-reading, health, music, social, GitHub, and logs tools,
depending on runtime configuration. A missing, stale, duplicated, or incorrectly bound skill can
therefore expand privileges instead of removing them.

## Confirmed isolation gaps

### 1. Public prompts receive the service account's identity

`buildChatSystemPrompt` includes `user.name` and the location loaded from that user's settings.
For a shared public account, these values describe the service-account owner, not the anonymous
visitor. They must never be placed in the public agent's context.

### 2. Public runtime context loads personal account settings

The chat runtime loads user-level location, global instructions, and provider credentials before
the public-domain policy is applied. Even when a capability is not shown to the model, loading
personal state into the request path increases the blast radius of future mistakes.

### 3. Tool resolution is fail-open

An empty tool assignment currently means "use all base tools," not "use no tools." This is the
opposite of the required behavior for public and customer-facing domains.

Prompt instructions such as "do not use private tools" are behavioral guidance, not an
authorization boundary.

### 4. Public callers can influence privileged prompt and skill fields

The Control API message payload accepts `preSelectedSkillId`, `defaultSkillName`, and `postContext`.
These fields are useful for trusted first-party clients, but an anonymous public proxy must not be
able to select another skill or append trusted-looking system context.

### 5. RAG uses the shared account and domain

Vector search runs with the service account's user ID and the current domain. Documents accidentally
uploaded or assigned to that account/domain may become model context. Public domains need an
explicit knowledge-source policy; an empty or accidental corpus must not silently become a shared
personal corpus.

### 6. Account configuration can bypass the intended boundary

Domain access checks allow administrators through. A public widget key created from a personal or
admin account therefore invalidates the domain-only account model. Dedicated non-admin service
accounts are mandatory, but account separation alone is not sufficient to compensate for the
application-level gaps above.

## Security model

The authorization decision is the intersection of four independently enforced boundaries:

1. **Principal** — a dedicated, non-human, non-admin service account used by exactly one public
   domain.
2. **API scope** — the key contains only the endpoint scopes required by the proxy.
3. **Domain policy** — the server derives a fixed policy from the conversation's domain; the client
   cannot broaden it.
4. **Capability allowlist** — tools, context sources, credentials, and knowledge sources are
   explicitly allowed. Missing configuration always results in no access.

The model prompt is not part of the authorization boundary. It may describe restrictions for good
behavior, but server code must make violations impossible.

## Decisions for `sales`

The following remediation decisions were approved. The application-level items are implemented in
the working tree; account, key, database, and production deployment items remain pending:

- Disable `create_ticket` for `sales`.
- Start with **zero tools** for `sales`.
- Do not expose personal name, email, location, memories, notes, reminders, instructions, documents,
  or integration state to `sales`.
- Do not allow the public caller to select a skill or submit `postContext`.
- Use a dedicated, non-admin `sales` service account with no access to any other domain.
- Rotate the current widget API key after the owning account and its privileges are verified.
- Keep lead capture outside the model tool loop. If lead capture is reintroduced later, prefer a
  purpose-built, validated website form or a narrowly scoped service endpoint with independent
  spam controls and retention rules.

### Web search decision

`openworld` is a useful reference for a domain with one explicit capability: `search_web`, backed
by a domain-specific Tavily key and domain-specific usage controls.

That should be the pattern if `sales` later demonstrates a real need for live web information, but
it should not be the initial `sales` policy. Sales can normally answer from its reviewed skill
content or an explicitly approved public knowledge base. Web retrieval adds untrusted external
content, prompt-injection risk, cost, and another credential, so it must be enabled deliberately,
not inherited.

Proposed starting policies:

| Domain | Allowed tools | Credential policy | Context policy |
| --- | --- | --- | --- |
| `sales` | None | Model credential dedicated or centrally controlled; no personal keys | Public skill content only |
| `openworld` | `search_web` only | Tavily key dedicated to `openworld`, with its own limits | Public skill content plus sanitized search results |

## Required checks

These checks apply to every public or externally shared domain.

### Design review

- [ ] Record the domain owner, audience, purpose, data classification, and expected lifetime.
- [ ] List every allowed tool and justify each one. An empty list means no tools.
- [ ] List every allowed context source: profile fields, instructions, RAG collections, conversation
      history, locale, date/time, and caller-provided metadata.
- [ ] List every credential the execution path may load and identify who owns it.
- [ ] Define retention and deletion behavior for conversations and any visitor PII.
- [ ] Define abuse, cost, and concurrency limits per visitor and per domain.
- [ ] Document whether files, images, URLs, or arbitrary prompt context are accepted.

### Account and key review

- [ ] Confirm that the service account is not an administrator.
- [ ] Confirm that it is not a personal account and contains no personal profile/settings data.
- [ ] Confirm that it has access to exactly one public domain.
- [ ] Confirm that its API key has the minimum endpoint scopes.
- [ ] Confirm that the key is injected only by the server-side proxy and never reaches the browser.
- [ ] Confirm that secrets are unique per domain; never reuse personal or cross-domain provider keys.
- [ ] Record key ownership and rotation date without recording the secret itself.

### Server authorization tests

- [ ] Assert the exact tool-name set for each public domain. Use equality, not partial assertions.
- [ ] Assert that missing skill, missing tool rows, duplicate skill, and stale default-skill bindings
      all fail closed.
- [ ] Assert that a public request cannot activate a skill outside its conversation domain.
- [ ] Assert that `postContext`, client-selected skill fields, and unsupported model/provider overrides
      are rejected or ignored for public domains.
- [ ] Assert that the tool runner independently rejects any tool not allowed by the domain policy,
      even if a model fabricates a tool call.
- [ ] Assert that admin status on the API-key owner does not broaden a public conversation's runtime
      capabilities.

### Context-isolation tests

- [ ] Seed the service account with canary values for name, email, location, personal instructions,
      notes, memories, documents, health, music, GitHub, and logs.
- [ ] Verify that none of those canaries appears in the generated public system prompt.
- [ ] Ask direct and indirect questions designed to extract every canary.
- [ ] Verify that public RAG searches only an explicitly approved public collection, or is disabled.
- [ ] Verify that one visitor cannot obtain another visitor's conversation content.
- [ ] Verify that locale and safe date/time context do not reveal service-account attributes.

### End-to-end and deployment checks

- [ ] Inspect the production database binding from domain to default skill and tool policy.
- [ ] Inspect the production API-key owner, admin flag, domain grants, and scopes.
- [ ] Run a production smoke test that records response events and confirms the exact tools offered
      to the model and any tools executed.
- [ ] Test prompt-injection attempts that request notes, shell, logs, GitHub, health, email, memory,
      instructions, skill switching, and raw system context.
- [ ] Confirm per-IP, per-account, per-domain daily, concurrency, and conversation-length controls.
- [ ] Confirm the deployed branch and revision before signing off.
- [ ] Rotate the public key after remediation and verify that the previous key is rejected.

## Remediation sequence

No step should rely on a later step for safety.

1. Contain: disable or rotate the current public key while its ownership is uncertain.
2. Inventory: capture the production account, grants, key scopes, skill binding, tool rows, deployed
   revision, domain credentials, and the events from the observed conversation.
3. Specify: approve the exact `sales` and `openworld` policies in this document.
4. Enforce: introduce a server-derived, fail-closed public-domain policy for tools and context.
5. Test: add unit, integration, adversarial, and end-to-end isolation tests.
6. Deploy: apply account/key/configuration changes and application changes in a controlled order.
7. Verify: run the production checklist and preserve evidence of the result.
8. Operate: monitor policy violations, usage, costs, credential age, and configuration drift.

## Evidence still needed

- The identity and `is_admin` value of the account that owns the current `sales` widget key.
- That account's domain grants and API-key scopes.
- The production `sales` default-skill binding and all `skill_tools` rows for the bound skill.
- The branch and commit currently deployed to Allerac One.
- Tool-call events or logs for the dentist-note conversation.
- Whether the production `sales` account has personal location, global instructions, documents, or
  integration credentials stored.
- Whether the Tavily key configured in each public domain is truly domain-specific at runtime or
  can fall back to user/system/global credentials.

## Sign-off record

The domain remains unapproved for public exposure until all required checks are complete.

| Review | Owner | Date | Result | Evidence |
| --- | --- | --- | --- | --- |
| Product/data policy | TBD | | Pending | |
| Application security | TBD | | Pending | |
| Production configuration | TBD | | Pending | |
| End-to-end verification | TBD | | Pending | |
