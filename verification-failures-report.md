# LOC-0030 Verification Failures Report

**Date:** 2026-07-16
**Status:** 13 of 16 ACs FAILED verification

## Summary Table

| AC ID | Story | Missing Files | Primary Failure |
|-------|-------|---------------|-----------------|
| LOC-0031-AC1 | LOC-0031 | bw-types/src/lib.rs, Cargo.lock, Cargo.toml, .github/workflows/ci.yml | files_exist, artifact_integration, meaningful_diff |
| LOC-0031-AC2 | LOC-0031 | bw-types/src/lib.rs, bw-types/Cargo.toml | git_commits, files_exist, meaningful_diff |
| LOC-0031-AC3 | LOC-0031 | .github/workflows/ci.yml, bw-types/src/lib.rs | git_commits, files_exist, artifact_integration, meaningful_diff |
| LOC-0034-AC1 | LOC-0034 | packages/ui/next-env.d.ts, tsconfig.json, package.json, globals.css | git_commits, files_exist, artifact_integration |
| LOC-0034-AC2 | LOC-0034 | packages/ui/package.json, vitest.config.ts | git_commits, files_exist |
| LOC-0034-AC3 | LOC-0034 | (needs investigation) | git_commits |
| LOC-0050-AC1 | LOC-0050 | .gitignore, tsconfig.json, src/utils/test-data-seeder.ts, test-data-seeder.spec.ts | files_exist, artifact_integration |
| LOC-0050-AC2 | LOC-0050 | src/types/review.ts, services/review-service.spec.ts | git_commits, files_exist, artifact_integration |
| LOC-0050-AC3 | LOC-0050 | src/services/image-service.ts, qa/loc-0050-ac1-business-seeding.spec.ts, utils/test-data-seeder.ts | files_exist, artifact_integration |
| LOC-0050-AC4 | LOC-0050 | utils/test-data-seeder.ts, qa/loc-0050-ac1-business-seeding.spec.ts, utils/test-data-seeder.spec.ts | files_exist, artifact_integration |
| LOC-0050-AC5 | LOC-0050 | types/business.ts, types/index.ts, utils/test-data-seeder.ts, utils/test-data-seeder.spec.ts | git_commits, files_exist, artifact_integration |
| LOC-0050-AC6 | LOC-0050 | utils/seed-runner.ts, utils/seed-runner.spec.ts, package.json | git_commits, files_exist, artifact_integration |
| LOC-0050-AC7 | LOC-0050 | utils/test-data-seeder.ts, docs/TEST-DATA-CONVENTIONS.md | files_exist, artifact_integration |

## Pattern Analysis

### Common Missing Files
1. **test-data-seeder.ts** - Missing from 5 ACs (LOC-0050-AC1, AC3, AC4, AC5, AC7)
2. **bw-types/src/lib.rs** - Missing from 3 ACs (LOC-0031-AC1, AC2, AC3)
3. **.github/workflows/ci.yml** - Missing from 3 ACs (LOC-0031-AC1, AC3, LOC-0034-AC3)
4. **package.json** - Missing from 3 ACs (LOC-0034-AC1, AC2, LOC-0050-AC6)

### Root Cause Categories
| Category | Count | ACs |
|----------|-------|-----|
| No git commits found | 8 | LOC-0031-AC2, AC3; LOC-0034-AC1, AC2; LOC-0050-AC2, AC5, AC6 |
| Files not on branch | 13 | All failed ACs |
| Artifacts orphaned | 11 | All ACs with artifact_integration failure |

## Action Required

1. **Re-dispatch affected ACs** to regenerate missing artifacts
2. **Verify worktree contents** before merging
3. **Update handoff** status from "complete" to "in_progress"
