# TLS trust stores after the eMudhra incident

Fixed versions are documented at https://emudhra.we-have-a-problem.com/.
Node uses 22.23.4 in Docker, proto and CI. Notifier uses Go 1.26.10.
Python stays on 3.12 for application compatibility and uses the corrected
distribution certificates, pip >=26.2.2 and certifi >=2026.10.19.

`Dockerfile.ca-bundle` replaces the system CA bundle of vendor images, including
images without a shell. The active vendor images are pinned to their existing
digest so this change does not upgrade the applications. To upgrade a vendor
application later, update its `BASE_IMAGE` in `docker-compose.yml`, rebuild and
repeat the checks. Optional profiles retain their upstream tags.

`SSL_CERT_DIR` points to an empty directory: Go and OpenSSL can otherwise reload
old roots from hashed certificates in the vendor layer. `SSL_CERT_FILE` points
to the corrected bundle. n8n additionally uses Node's OpenSSL trust store.
The docs image updates its own pip and certifi because Python packages can use
their own certificates instead of the system store.

Installation builds all enabled images; upgrades rebuild them with `--pull`.
When operating Compose directly, use `docker compose build --pull` before
`docker compose up -d`. Do not replace local `allerac-*:ca-20261020` images with
the original upstream images, as that bypasses the trust-store overlay.

## Verification

From the repository root (PowerShell uses `${PWD}` instead of `$PWD`):

```sh
docker compose build --pull executor health-worker docs
docker compose run --rm --no-deps --entrypoint node -v "$PWD/scripts/ci/check-tls.cjs:/check-tls.cjs:ro" executor /check-tls.cjs
docker compose --profile health run --rm --no-deps --entrypoint python -v "$PWD/scripts/ci/check-tls.py:/check-tls.py:ro" health-worker /check-tls.py
docker compose run --rm --no-deps --entrypoint python -v "$PWD/scripts/ci/check-tls.py:/check-tls.py:ro" docs /check-tls.py
```

These commands perform TLS handshakes only. All fourteen compromised endpoints
must fail with certificate trust/revocation errors; the valid control must
succeed. DNS failures, timeouts, expiry and hostname errors do not pass.
The Node probe also runs in the Docker integration workflow.

For vendor wrappers, copy `/etc/ssl/certs/ca-certificates.crt` from the resulting
image and verify all fourteen PEM chains from the incident's `chains.zip` with
OpenSSL, disabling other trust sources (`-no-CApath -no-CAstore`). Confirm a
valid control chain succeeds and verify the running container keeps
`SSL_CERT_FILE` and `SSL_CERT_DIR` from the image.

The PostgreSQL/pgvector server image is unchanged: the audited image had no
system trust bundle. The migrations client image does receive the CA overlay.
These checks cover this incident; they are not a full dependency vulnerability
audit.
