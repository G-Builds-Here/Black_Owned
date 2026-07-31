---
name: commit-review
description: Code review checklist and commit verification before merging -- quality gates, test execution, security checks, commit message format. Use this skill when the user says "review this", "ready to commit", "check before merging", "code review", or when preparing code for commit. Also activate after implementation is complete and before creating a PR.
---

Run this review checklist before committing code. Every check that fails must be addressed or explicitly acknowledged.

## Review Checklist

### 1. Tech Debt
- Does this change introduce new technical debt?
- Cross-file DRY check: is similar logic duplicated elsewhere?

### 2. Warnings
- Run the build. Are there new compiler warnings, StyleCop warnings, or nullable reference warnings?
- Zero new warnings policy: fix any before committing.

### 3. Merge Safety
- Is the implementation complete, or is it a partial implementation?
- If partial: is the unfinished work safely guarded (feature flag, unreachable code path)?

### 4. Ambiguity
- Are there unclear variable/method names or surprising side effects?
- Is non-obvious logic missing a WHY comment?
- Are there obvious-code comments that should be removed? (e.g., `// increment counter` above `counter++`)

### 5. Obvious Errors
- Syntax errors, semantic errors, off-by-one?
- Null reference risks on unguarded paths?

### 6. Coverage
- Do tests exist for new/changed code?
- Are edge cases covered?
- Do test names describe scenario + expected outcome?
- One behavior per test?

### 7. Performance
- Any obvious performance concerns?
- SQL table scans that should be seeks?
- N+1 query patterns?

### 8. Security
- Injection (SQL, command, LDAP)?
- XSS (innerHTML, dangerouslySetInnerHTML, raw HTML with user data)?
- CSRF protection?
- Access control (authorization checks on all endpoints)?
- Hardcoded secrets (keys, tokens, connection strings in code)?
- Unsafe deserialization?

## Test Execution Gates

- Run tests for all new/modified test files
- Run each new test file **3 times total** to check for flakiness
- If any run fails on a new test: it's flaky -- fix before committing
- Pre-existing flaky tests: note them, don't let them block

## Micro-Fix Rule

If a review finds a bug that is:
- 5 or fewer changed lines, AND
- The correct code is unambiguous from the diff alone (wrong variable name, missing null check, off-by-one)

Then fix it directly. Guards:
1. Re-read the target file first
2. Run tests after applying the fix
3. If tests fail, the fix was wrong -- stop and investigate
4. If the fix grows past 5 lines or needs investigation, stop

## Commit Message Format

```
<TICKET-KEY> <imperative summary, 50 chars max>

- <bullet describing what changed>
- <bullet describing what changed>

Co-Authored-By: Claude <model> <noreply@anthropic.com>
```

## When to Suggest Splitting

If the commit is substantial and there's significant remaining work on the same ticket: suggest splitting the remaining work into a new ticket. Fresh context produces fewer mistakes than deep sessions.
