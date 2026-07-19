# Multi-Cloud Environment Provisioning

**Status:** Proposed — follows the portable recovery baseline

**Depends on:** [Portable Allerac Backup and Restore](portable-backup-restore.md)

**Existing foundation:** Terraform definitions for Azure, AWS, and GCP

## Objective

Turn the existing provider-specific Terraform definitions into a tested workflow that can create a compatible Allerac host, bootstrap it, restore portable state, validate the result, and perform a controlled environment cutover.

Infrastructure provisioning and state restoration remain separate responsibilities:

```text
Provision cloud infrastructure
            ↓
Bootstrap a compatible Docker host
            ↓
Install the recorded Allerac release
            ↓
Restore the portable recovery package
            ↓
Verify the candidate environment
            ↓
Perform an explicit traffic cutover
```

The portable backup must work on any compatible host even when Terraform is not used. Terraform must create hosts without containing application data or raw recovery secrets in its state.

## Current foundation

The repository already contains `infra/terraform/azure`, `infra/terraform/aws`, and `infra/terraform/gcp` definitions for provider, networking, compute, storage, Cloudflare, and startup concerns. The project must audit and validate these definitions rather than assume provider parity from file structure alone.

Current gaps to resolve include:

- confirmed deployment tests for each provider;
- common input and output contracts;
- pinned base images and compatible machine architectures;
- reproducible Docker and host bootstrap versions;
- secure secret injection and Cloudflare tunnel enrollment;
- backup transfer and restore orchestration;
- automated post-provision validation;
- documented DNS cutover and rollback;
- cost and capacity profiles for beta workloads.

## Provider-independent contract

Every provider implementation should produce the same logical outputs:

| Output | Purpose |
|---|---|
| Environment identifier | Stable operational reference |
| Host address or connection command | Bootstrap and emergency access |
| Persistent disk identity | Recovery and lifecycle management |
| Allerac installation directory | Restore target |
| Cloudflare tunnel/DNS readiness | External routing validation |
| Provider and region metadata | Recovery manifest and audit trail |

Every provisioned host must meet a shared baseline for supported Linux version, CPU architecture, Docker/Compose availability, disk capacity, time synchronization, firewall policy, and non-root administration.

## Phased delivery

### Phase 1 — Audit existing Terraform

1. Compare Azure, AWS, and GCP resources and variables against a shared capability matrix.
2. Identify provider-specific assumptions and missing lifecycle protections.
3. Pin versions for Terraform/OpenTofu providers and base images.
4. Validate plans without applying infrastructure changes.

### Phase 2 — Standard host bootstrap

1. Define an idempotent bootstrap contract for Docker, Compose, directories, permissions, and the Allerac CLI.
2. Keep deployment credentials outside images and source control.
3. Record bootstrap logs without exposing secrets.
4. Make the resulting host acceptable to the portable restore workflow.

### Phase 3 — First provider recovery drill

Use Azure first because it is the current production baseline:

1. Provision a separate disposable Azure environment.
2. Restore a portable recovery package.
3. Run the complete verification suite.
4. Destroy only the explicitly identified disposable resources after user approval.

### Phase 4 — AWS migration candidate

1. Provision an AWS candidate using a cost-appropriate profile.
2. Restore the same recovery package used in the Azure drill.
3. Compare build time, disk I/O, network behavior, reliability, and monthly cost.
4. Validate Cloudflare routing without changing production DNS.
5. Produce a cutover and rollback plan for user approval.

### Phase 5 — GCP parity and repeatability

1. Repeat the clean-host recovery drill on GCP.
2. Remove undocumented provider-specific steps.
3. Confirm that the same application verification contract passes on all supported clouds.
4. Publish a provider comparison based on measured results.

## Cutover safety

- Provisioning a candidate must not alter the active production environment.
- DNS or Cloudflare changes require an explicit, separately approved cutover step.
- The source environment remains intact until the destination passes verification.
- Database writes during migration require a defined freeze, final delta, or replication strategy.
- Rollback must restore routing to the source environment without requiring a rebuild.
- Terraform destroy operations must target an explicitly verified environment and require user approval.

## Definition of done

This project reaches its beta milestone when:

- one command or documented workflow can plan a supported provider environment;
- the created host satisfies the shared bootstrap contract;
- a portable recovery package restores successfully on a newly created VM;
- automated checks validate health, release identity, database schema, and core user data;
- the candidate can be tested through a non-production hostname;
- cutover and rollback are documented and tested without data loss;
- Azure and at least one additional provider have completed recovery drills;
- expected infrastructure cost and operational limitations are recorded.

## Non-goals for the first milestone

- Active-active operation across providers.
- Automatic failover without human approval.
- A single abstraction that hides every provider-specific capability.
- Kubernetes migration.
- Production cutover as part of a routine Terraform apply.
