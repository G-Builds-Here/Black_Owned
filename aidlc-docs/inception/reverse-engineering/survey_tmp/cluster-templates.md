## Survey Subagents

Each subagent receives: pre-scan output scoped to its cluster + the cluster's structured return template embedded verbatim. Subagent prompts include the constraint block first.

### Constraint block (embed verbatim in every subagent prompt)

```
**Subagent constraints — read these first:**
- Do NOT create, update, or delete any files in `memory/` or `MEMORY.md`. Return findings only.
- All inputs are provided inline — do not read the parent skill file.
- Multi-project: tag every finding with which project it belongs to (from directory/csproj/package.json).
- Return ONLY the LUKE_CLUSTER_RESULT block. No preamble. No explanation outside the block.
- Fill every field. Use "none found" if genuinely absent. Never leave a field empty.
```

### Agent 1 — Business + Stack

**Return template (embed verbatim in prompt):**
```
LUKE_CLUSTER_RESULT
cluster: business-stack
overview: |
  <2-3 sentences — what this system does in business terms. What problem it solves, who uses it, what it produces. A product manager should recognise this.>
tech_stack: |
  <table or bullet list: language, framework, runtime, version. Include test framework.>
entry_points: |
  <list: each executable/API host with its startup file path and how it's invoked>
key_dependencies: |
  <external services, databases, queues, third-party APIs called — each with: name, purpose, how it's called>
build_commands: |
  <exact commands: build, test all, test filtered — copy from code, not guessed>
why_this_structure: |
  <why is the project structured this way — [ASSUMED] if inferred from code patterns>
additional_findings: <cross-cutting risks, surprises, or "none">
END_LUKE_CLUSTER
```

**Full prompt:**
```
{constraint block}

You have a pre-scan of this repo below. DON'T re-discover file structure — read the files the pre-scan identified to find actual values.

Specifically find:
- Business purpose: what does this system do, for whom, what outcome does it produce
- Tech stack: read csproj/package.json/pyproject.toml for actual versions — don't estimate
- Entry points: trace startup from the files listed in Pre-Scan > Entry Points
- External dependencies: read code for actual service calls (HTTP clients, SDK clients, queue consumers)
- Build commands: read README, Makefile, or runsettings for exact commands

<PRE_SCAN>
{pre-scan --markdown output — scoped to: Projects, Config Files, Environments, Entry Points sections}
</PRE_SCAN>

Return the LUKE_CLUSTER_RESULT block using the template above. Fill every field.
```

### Agent 2 — Structure + API

**Return template (embed verbatim in prompt):**
```
LUKE_CLUSTER_RESULT
cluster: structure-api
component_map: |
  <table: Component | Project | Type | Responsibility | Key files>
  <For each: what it owns, why it's a separate component, what it does NOT do>
service_boundaries: |
  <what crosses a boundary (HTTP, message, shared DB) vs what's internal — explicit list>
  <any boundary violations: circular deps, shared mutable state across components>
api_contracts: |
  <table: Method | Path | Auth | Request shape | Response shape | Status codes>
  NOTE: use the HTTP Endpoints table from pre-scan as your route list.
  Read the controller files to fill in request/response shapes and auth.
  Do not re-discover routes — only add shape/auth/status detail.
data_models: |
  <table: Model | Used by | Key fields | Validation | Notes>
  <include: entities, DTOs, request/response objects, any ORM mapping notes>
boundary_violations: |
  <specific instances of: circular deps, shared state across boundaries, tight coupling — or "none found">
additional_findings: <cross-cutting risks, surprises, anti-pattern candidates, or "none">
END_LUKE_CLUSTER
```

**Full prompt:**
```
{constraint block}

You have a pre-scan of this repo below. The HTTP endpoints table is authoritative — use it as your route list and read the referenced files to add shapes and auth detail.

Specifically find:
- Component ownership: what each project/module owns, why it exists as a separate unit
- Boundaries: what data or calls cross a component boundary vs what stays internal
- API shapes: for each endpoint in the pre-scan table, read the controller file and fill in request body, response body, auth type, and status codes
- Data models: read model/DTO/entity files for field names, types, validation, and ORM notes

<PRE_SCAN>
{pre-scan --markdown output — scoped to: Projects, HTTP Endpoints, Static State, Base Classes sections}
</PRE_SCAN>

Return the LUKE_CLUSTER_RESULT block using the template above. Fill every field.
```

### Agent 3 — Quality + Ops

**Return template (embed verbatim in prompt):**
```
LUKE_CLUSTER_RESULT
cluster: quality-ops
test_framework: |
  <framework name, version, test runner, how tests are grouped/filtered>
  <grouping/trait system: what values exist, what each means, how to filter>
credential_chain: |
  <ordered list: source 1 → source 2 → fallback → what happens if all fail>
  <traced from code — not from docs. Include the exact env var names and config keys.>
  <what happens if init fails: null ref, exception, misleading error?>
how_to_add_test: |
  <directory pattern: where the file goes (exact path template)>
  <base class: what to inherit, why — what cross-cutting concerns does it provide>
  <shared helpers: RequestGenerator, ResponseHandler, AssertHelper, etc — what each does and why you must use them instead of raw HttpClient>
  <trait attribute: exact value for a standard new test>
  <naming convention: exact format with example>
  <concrete example: "For a new GET /widgets test: create PPGTests/.../Widgets_GET_Tests.cs, inherit X, add [Trait(...)]">
build_system: |
  <exact commands: build, test all, test filtered by group>
  <group ordering: exact sequence and WHY — what breaks if you run out of order>
  <common first-run mistakes: what fails and how to fix it>
additional_findings: <cross-cutting risks, surprises, or "none">
END_LUKE_CLUSTER
```

**Full prompt:**
```
{constraint block}

You have a pre-scan of this repo below. Read the actual test files, config files, base classes, and build setup.

Specifically find:
- Test framework: read the runsettings file and test project csproj for framework/runner versions
- Credential chain: trace the actual code path from app startup to credential resolution — read the credential helper and fixture classes
- Static state: the pre-scan lists static members — read those classes to understand what breaks if tests run in parallel
- How to add a test: read one existing test file end to end, then read the base class to understand what it provides
- Build and group ordering: read the README or any CI pipeline file for the intended run order and its rationale

<PRE_SCAN>
{pre-scan --markdown output — scoped to: Test Groups, Static State, Base Classes, Fixture Registrations, Environment Variable Reads sections}
</PRE_SCAN>

Return the LUKE_CLUSTER_RESULT block using the template above. Fill every field.
```

---