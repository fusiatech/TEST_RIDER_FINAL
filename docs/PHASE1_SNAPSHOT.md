# Phase 1 Reproducible Snapshot

**Date:** 2025-02-26  
**Branch:** `cursor/cloud-development-environment-f66e` (merged from `cursor/phase1-gap-analysis`)  
**Purpose:** Reproducible baseline before any Phase 1+ work. Required by repo safety rules (0.1, 0.2).

## Snapshot Identifiers

| Item | Value |
|------|-------|
| **Commit hash** | `e8fca69a433f8155bc6a99de1f3f9e36bd505e8a` |
| **Lockfile** | `package-lock.json` (353089 bytes) |
| **package.json** | `swarm-ui@1.0.0` |
| **Line count** | ~25,884 (excluding node_modules) |
| **File count** | 112 tracked files |

## Dependency Versions (Key)

- Next.js 15.1.0, React 19, TypeScript 5.7.2
- Tailwind v4, Zustand 5, Zod 3.24.1
- node-pty 1.0.0, ws 8.18.0, lowdb 7.0.1

## Container / CI

- **Dockerfile:** None
- **CI config:** None (no `.github/workflows` or similar)

## Branch Strategy

- Work performed on `cursor/cloud-development-environment-f66e`
- No changes to `main` except via PR
- All changes PR-based; protected main
- Parallel agents: use `cursor/phase{N}-{ticket-id}-{short-desc}` for isolated work
