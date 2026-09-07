---
name: tdd-coding
description: TDD discipline — red-green-refactor cycle, test-first implementation, coding standards. Use this skill when the user asks to implement a feature, fix a bug, write code with tests, or mentions TDD, red-green-refactor, or test-driven development. Also activate when writing any implementation code.
---

Follow test-driven development when implementing code. The test proves the behavior; the implementation makes it pass.

## The TDD Cycle

**Red** -- Write a failing test for the next behavior. It must fail for the right reason (assertion failure, not compilation error).

**Green** -- Write the minimum implementation to make the test pass. Nothing more.

**Refactor** -- Clean up. Tests must still pass. Then repeat for the next behavior.

## What Gets TDD and What Doesn't

| Classification | Examples | Rule |
|---|---|---|
| **Testable** | Logic, branching, data transformation, anything with assertable behavior | TDD cycle mandatory |
| **Config/scaffold** | CloudFormation, JSON config, static wiring, purely declarative code | Exception -- note why it's untestable |
| **Ambiguous** | Not clearly either | Write at least one smoke test, then implement |

If >50% of the work is untestable, stop and reassess the approach.

## Test Naming

`{Feature}_{Scenario}_{ExpectedOutcome}` -- one behavior per test. Someone reading only test names should understand the system.

## Test Structure (AAA)

Every test follows Arrange/Act/Assert with blank-line separation:

```
// Arrange
<set up inputs, dependencies, expected values>

// Act
<invoke the unit under test>

// Assert
<verify the outcome with a message explaining what broke in business terms>
```

## Assertion Rules

- **Assert.True / Assert.False with message only** -- the message explains what broke in business terms
- `Assert.Equal` is fine for simple value comparisons, but complex objects need `Assert.True` with a descriptive message
- No assert helpers that silently pass: `param == null || actual == expected` hides missing coverage

## Never Weaken Tests

The default assumption is that the implementation is wrong, not the test. Do not:
- Loosen assertions or broaden expected values
- Remove checks or add `test.skip()`
- Change assertions without evidence

To change an assertion: find evidence (read the code, check the response) OR ask the user. After 2 failed fix attempts with strong evidence the assertion is wrong, present the evidence and let the user decide.

## Coding Standards

| Rule | Detail |
|---|---|
| Zero new warnings | Build after writing, fix before proceeding |
| DRY at 3+ repeats | Extract a helper when you see 3+ repeated blocks |
| Comments | WHY only, one line max. No WHAT comments -- well-named identifiers handle that |
| Follow project conventions | Check CLAUDE.md or project docs for language-specific standards before writing |

## Implementation Discipline

- **Re-read file before every edit** -- never edit from stale context
- **Diagnose before retrying** -- if an edit fails, read the error and understand it before trying again
- **One command per Bash call** -- no `&&`, no `;`, no pipes. Use absolute paths or `git -C`
- **Minimal test data** -- only include fields the test cares about
- **Match existing patterns** -- don't build complex test setup when simpler patterns exist in the codebase
