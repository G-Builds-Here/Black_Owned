---
name: test-standards
description: Test creation standards and quality gates -- assertion patterns, test structure, pre-write checks, coverage rules. Use this skill when the user asks to write tests, improve test coverage, audit test quality, create integration/acceptance/E2E tests, or mentions QA, test quality, or test standards. Also activate when reviewing or modifying existing test files.
---

Follow these standards when writing, reviewing, or auditing tests.

## Pre-Write Gates (complete in order)

1. **Read test-writing standards** -- check the project's test conventions before writing anything
2. **Read project coding standards** -- check the project's CLAUDE.md for code conventions
3. **Audit existing tests** -- flag pre-existing violations as tech debt. Don't fix unless asked, but don't pretend they don't exist
4. **Ensure test environment** -- hard stop: invoke the test runner before concluding "tests can't run". Build output is NOT test execution
5. **Zero new warnings** -- build after writing, grep for warnings in new files, fix before proceeding
6. **Stability** -- run tests 3x total to catch flakiness. Flaky tests are worse than no tests

## Quality Rules

| Rule | Detail |
|---|---|
| **Assertions explain failures** | Every assertion includes a message that explains what broke in business terms |
| **Domain assert helpers** | Complex validations go in shared assertion helpers, not inline per-test |
| **Centralized test data** | All constants, IDs, expected values in a shared location. No inline magic numbers |
| **AAA structure** | `// Arrange`, `// Act`, `// Assert` with blank-line separation. Every test, no exceptions |
| **Names are specs** | `{Feature}_{Scenario}_{ExpectedOutcome}`. Reading only test names should explain the system |
| **Parametric same-logic** | Use the test framework's parameterized test feature. If the body needs `if` on the parameter, split into separate tests |
| **Describe intent** | Each test method should document what it verifies in business terms (docstring, comment, or name) |
| **Follow project tagging conventions** | Apply any grouping/category attributes the project uses. Check CLAUDE.md for project-specific conventions |
| **Zero new warnings** | Build, grep, fix -- before proceeding |
| **One command per Bash** | No `&&`, no `;`. Use absolute paths or `git -C` |

## Input Class Coverage

Every test suite must cover these input classes:

| Class | What to test | Example |
|---|---|---|
| **Happy path** | Expected inputs produce expected outputs | Valid transaction with valid sponsor key |
| **Failure path** | Legitimate inputs that trigger error handling | Null sponsor key, empty string, boundary values |
| **Invalid input** | Malformed or unauthorized inputs that should be rejected | SQL injection, XSS payloads, wrong types |
| **Backwards compatibility** | Existing behavior unchanged by new code | Regression checks on adjacent features |

## Test Type Selection

| Type | When | What it validates |
|---|---|---|
| **Integration** | Multiple components interacting | Data flows correctly between layers |
| **E2E** | User-visible behavior | Feature works from user's perspective |
| **Contract** | API boundaries | Request/response shapes match |
| **Security** | Auth, data access, user input | No injection, XSS, access control bypass |
| **Regression** | Existing behavior must not change | Adjacent features still work |

Rare-path types (use when specifically needed): Performance, Exploratory, Sanity/Smoke, Canary.

## Confidence and Verdicts

| Confidence | Meaning |
|---|---|
| **High** | Automated tests ran, passed, cover the requirement |
| **Medium** | Tests ran but coverage is partial |
| **Low** | Could not run meaningful tests -- judgment-based |

| Verdict | When | Action |
|---|---|---|
| **PASS** | All requirements validated at High/Medium confidence | Proceed to commit |
| **PARTIAL** | Some validated, others need tests or are blocked | Commit passing tests, resume for remainder |
| **FAIL (impl)** | Failure caused by implementation bug | Fix the implementation, not the test |
| **FAIL (gap)** | Tests pass but coverage analysis shows missing scenarios | Write missing tests, re-run |
| **ESCALATE** | Cannot validate -- missing infra, ambiguous requirements | Ask user for decision |

## Tools

If the project has audit/lint tools available (check CLAUDE.md), run them after writing tests. Common patterns:
- Audit test quality: check for missing assertions, AAA structure, naming conventions, magic values
- Auto-fix trait/grouping attributes if the project uses them
- Auto-fix code style violations the project enforces
