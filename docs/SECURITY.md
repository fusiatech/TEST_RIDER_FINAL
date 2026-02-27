# Security Documentation

## SLSA Provenance (Level 3)

SwarmUI container images include [SLSA](https://slsa.dev/) Level 3 provenance attestations, providing cryptographic proof of the build process.

### What is SLSA Level 3?

SLSA (Supply-chain Levels for Software Artifacts) Level 3 guarantees:

- **Build integrity**: The build process is isolated and cannot be influenced by user parameters
- **Source integrity**: The provenance accurately reflects the source code used
- **Non-falsifiable**: Attestations are cryptographically signed and tamper-evident
- **Hardened builds**: Build runs on ephemeral, isolated infrastructure (GitHub-hosted runners)

### Verifying Attestations

#### Prerequisites

Install the [cosign](https://docs.sigstore.dev/cosign/installation/) CLI tool:

```bash
# macOS
brew install cosign

# Linux
curl -sSfL https://github.com/sigstore/cosign/releases/latest/download/cosign-linux-amd64 -o cosign
chmod +x cosign
sudo mv cosign /usr/local/bin/
```

Install the [slsa-verifier](https://github.com/slsa-framework/slsa-verifier) CLI:

```bash
# macOS
brew install slsa-verifier

# Linux
curl -sSfL https://github.com/slsa-framework/slsa-verifier/releases/latest/download/slsa-verifier-linux-amd64 -o slsa-verifier
chmod +x slsa-verifier
sudo mv slsa-verifier /usr/local/bin/
```

#### Verify SLSA Provenance

```bash
# Verify the container image provenance
slsa-verifier verify-image ghcr.io/OWNER/swarm-ui:TAG \
  --source-uri github.com/OWNER/swarm-ui \
  --source-tag vX.Y.Z
```

Replace:
- `OWNER` with the GitHub organization/user
- `TAG` with the image tag (e.g., `v1.0.0`, `latest`)
- `vX.Y.Z` with the git tag

#### Verify with GitHub CLI

```bash
# List attestations for an image
gh attestation verify oci://ghcr.io/OWNER/swarm-ui:TAG \
  --owner OWNER
```

### SBOM (Software Bill of Materials)

Each release includes an SBOM in SPDX JSON format, listing all dependencies.

#### SBOM Location

- **GitHub Actions Artifact**: Available as `sbom` artifact on each workflow run
- **Container Attestation**: Attached to the container image via `actions/attest-sbom`

#### Viewing the SBOM

```bash
# Download SBOM from GitHub release artifacts
gh run download --name sbom

# View SBOM contents
cat sbom.spdx.json | jq '.packages[] | {name, version: .versionInfo}'
```

#### Verify SBOM Attestation

```bash
# Verify SBOM attestation on container image
cosign verify-attestation \
  --type spdxjson \
  --certificate-identity-regexp ".*" \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  ghcr.io/OWNER/swarm-ui:TAG
```

### Container Security Scanning

All container images are scanned with [Trivy](https://trivy.dev/) before release:

- Critical and High severity vulnerabilities are reported to GitHub Security tab
- Builds fail if Critical vulnerabilities are detected
- Scan results are available in SARIF format

### Security Best Practices

1. **Always verify provenance** before deploying images to production
2. **Pin image digests** instead of tags for immutable deployments:
   ```yaml
   image: ghcr.io/OWNER/swarm-ui@sha256:abc123...
   ```
3. **Review SBOM** for known vulnerabilities using tools like `grype`:
   ```bash
   grype sbom:sbom.spdx.json
   ```
4. **Enable Dependabot** for automated dependency updates

### Reporting Security Issues

Please report security vulnerabilities via GitHub Security Advisories or email security@example.com.

Do not disclose security issues publicly until a fix is available.
