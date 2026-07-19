# Portable Allerac Backup and Restore

**Status:** Proposed — high priority for beta

**Depends on:** Existing `allerac backup` and `allerac restore` database commands

**Enables:** Disaster recovery, host migration, staging clones, and multi-cloud portability

## Objective

Create a provider-independent recovery package that can reconstruct the state of an Allerac installation on a clean, compatible Docker host. The package must be verifiable, versioned, secure, and usable without relying on undocumented knowledge of the original VM.

The current `allerac backup` command creates and validates a compressed PostgreSQL dump. That protects the central application data, including pgvector records, but it does not capture the complete installation state.

## Recovery boundary

The portable backup must classify state explicitly instead of treating the VM as one opaque image.

| State | Initial policy |
|---|---|
| PostgreSQL and pgvector data | Include as a verified logical dump |
| Allerac release, commit, and product line | Include in the manifest |
| Docker Compose and image versions | Record reproducible identifiers and digests |
| Application-owned persistent files | Include when required for functional recovery |
| Configuration keys | Record required names and whether they were present |
| Secrets | Exclude from plain-text packages; restore through a separate secure channel |
| Ollama models | Record inventory; redownload by default because of size |
| Grafana, Loki, and Prometheus history | Optional profile, separate from core recovery |
| GitHub Actions runner identity | Re-register on the destination; do not clone credentials |
| Cloudflare tunnel credentials | Restore or rotate through an explicit secure step |

## Proposed commands

The exact CLI syntax remains subject to implementation review, but the intended operator workflow is:

```bash
allerac disaster-backup
allerac disaster-inspect <package>
allerac disaster-restore <package>
allerac verify
```

Existing `allerac backup` and `allerac restore` remain the lightweight database-only commands.

## Package format

The first version should produce one timestamped archive with a structure similar to:

```text
allerac-recovery-<timestamp>/
  manifest.json
  checksums.sha256
  database/
    allerac.sql.gz
  configuration/
    required-settings.json
  files/
  inventories/
    containers.json
    volumes.json
    ollama-models.json
```

`manifest.json` should contain at least:

- backup format version;
- creation timestamp and source environment identifier;
- Allerac release, commit, product line, and database schema version;
- required restore tool version;
- included and intentionally excluded components;
- artifact sizes and checksum references;
- compatibility and encryption metadata.

The archive must not contain raw secrets unless a later, explicitly designed encrypted-secret profile is selected.

## Phased delivery

### Phase 1 — Inventory and contract

1. Inventory every persistent volume, bind mount, configuration file, secret, and external dependency.
2. Define the core recovery boundary and optional profiles.
3. Version the manifest schema and document compatibility rules.
4. Define restore preconditions and failure behavior.

### Phase 2 — Portable backup

1. Reuse the existing verified PostgreSQL backup implementation.
2. Capture build, schema, container, volume, and configuration inventories.
3. Collect required application-owned files.
4. Generate checksums and validate the completed archive.
5. Ensure partial or corrupt packages are never reported as successful.

### Phase 3 — Restore to a clean host

1. Validate checksums, free space, Docker compatibility, and package version.
2. Require missing secrets through environment files or an external secret store.
3. Restore the database and required files without silently overwriting an existing environment.
4. Recreate services using the recorded compatible release.
5. Run automated health, authentication, schema, and data checks.

### Phase 4 — Recovery drill

1. Create a disposable clean VM.
2. Restore a production backup or a safely sanitized equivalent.
3. Verify login, conversations, memories, embeddings, notes, jobs, API access, and external clients.
4. Measure recovery time and record every manual step.
5. Treat undocumented manual work as a defect in the recovery process.

## Security requirements

- Never print, commit, or place unencrypted production secrets in the archive.
- Restrict package permissions and make the destination explicit.
- Generate and verify SHA-256 checksums.
- Create a safety backup before overwriting any existing database during restore.
- Require explicit confirmation for destructive restore operations.
- Support secret rotation when the destination environment changes trust boundaries.
- Document retention, off-host storage, and deletion policies before automating uploads.

## Definition of done

This project is complete for beta when:

- a backup package is created and validated automatically;
- its contents and exclusions are visible through an inspect command;
- a clean VM can restore the package without access to the source VM;
- all core application data and pgvector records pass verification;
- secrets are restored without appearing in source control or logs;
- a documented recovery drill has succeeded;
- the measured recovery point and recovery time are recorded.

## Deferred capabilities

- Continuous database replication and near-zero recovery point objectives.
- Cross-region automatic failover.
- Unattended restoration of every third-party credential.
- Bundling large Ollama model files by default.
- Production data cloning without a sanitization policy.
