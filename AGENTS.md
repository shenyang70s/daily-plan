# Repository Guidelines

## Project Structure & Module Organization

This repository contains design materials, a static prototype, and the initial application foundation for **Research Tasks**, an AI-assisted research task planner.

- `docs/`: versioned system-design and frontend-design Word documents.
- `docs/research_tasks_system_source_bundle/README.txt`: bundle contents and usage notes.
- `docs/research_tasks_system_source_bundle/research_tasks_system_design_v1.md`: editable system-design source.
- `docs/research_tasks_system_source_bundle/research_tasks_system_assets/`: Graphviz `.dot` sources and corresponding `.png` diagrams.

- `prototype/`: retained interactive prototype; its `dist/` files are source artifacts.
- `apps/web/`, `apps/api/`: React/Vite and NestJS startup scaffolding.
- `packages/contracts/`, `packages/domain/`, `packages/persistence/`: DTOs, domain rules, and SQLite persistence.
- `infra/migrations/`: versioned SQL; `scripts/`: migration entry point.

The approved implementation uses SQLite. Framework startup and the production driver remain unverified until dependency installation succeeds; see the root README and implementation plan.

## Build, Test, and Development Commands

Run `npm run test:foundation` for dependency-free domain and SQLite behavior checks. Application commands require dependency installation: `corepack pnpm install`, then `corepack pnpm dev`, `corepack pnpm build`, or `corepack pnpm typecheck`. `corepack pnpm db:migrate` initializes the configured SQLite file. These application commands have not yet been verified in this execution environment. Preview design Markdown with an editor that resolves relative image paths.

To regenerate a diagram from the repository root, install Graphviz and run:

```bash
dot -Tpng docs/research_tasks_system_source_bundle/research_tasks_system_assets/ai_action_flow.dot -o docs/research_tasks_system_source_bundle/research_tasks_system_assets/ai_action_flow.png
```

Use a font supporting Chinese characters; diagram sources specify `Noto Sans CJK SC`.

## Style & Naming Conventions

Preserve the documents’ Chinese prose, numbered sections, tables, and relative image links. Use descriptive snake_case asset names, with matching stems for `.dot` and `.png` files. Follow existing Graphviz formatting: two-space indentation and explicit graph, node, and edge attributes. Edit diagram sources and regenerate their images together. Application TypeScript uses strict checking and two-space indentation. No formatter or linter is configured.

## Validation Guidelines

For documentation changes, preview Markdown, verify image links, and inspect regenerated diagrams for clipping and legibility. Keep Word documents and editable sources consistent when changing shared content. Shared behavior tests live in `packages/{domain,persistence}/test/*.test.mjs` and use Node’s test runner with real temporary SQLite files. They do not verify the uninstalled better-sqlite3 production driver. No coverage threshold is configured. Framework and browser checks remain pending.

## Commit & Pull Request Guidelines

Git history is unavailable in this checkout, so no existing commit convention can be established. Use concise, imperative messages, such as `docs: clarify reminder delivery flow`. Pull requests should describe the change, list affected documents, link relevant issues when available, and include before/after images for diagram or visual-spec changes. State which previews or regeneration checks were performed.

The Git repository belongs at the `daily-plan/` root. Keep `prototype/` as an ordinary directory in that repository; do not initialize or push a separate nested repository. Local recovery metadata under `.git-recovery/` is ignored and must never be committed. If the session masks the root `.git`, use `scripts/repair-git.sh` from the host terminal rather than creating another repository in a subdirectory.

## Core Principles

* Implement the requested change with the smallest reasonable scope.
* Prefer simple, local changes that follow existing project conventions.
* Do not refactor, reorganize, or improve unrelated code.
* Do not expand the task based on speculative improvements.

## Investigation

* Inspect only the files and dependencies necessary to understand the requested change.
* For localized tasks, avoid repository-wide exploration.
* Make reasonable implementation decisions from existing code and conventions; ask for clarification only when ambiguity materially affects the result.

## Verification

Use verification proportional to the risk of the change:

1. Syntax or compilation check when relevant.
2. Targeted tests directly related to the change.
3. Broader tests only when the change has meaningful cross-module impact.
4. Full test suite only when explicitly requested or clearly justified.

Do not run unrelated tests, linting, builds, or other checks merely for completeness.

Do not add tests unless requested, necessary for a regression fix, or needed to verify behavior that cannot otherwise be reasonably checked.

## Stop Condition

Once the requested change is implemented and appropriate targeted verification passes, stop.

Do not continue testing, investigating edge cases, refactoring, or fixing unrelated issues unless there is concrete evidence that the current implementation is insufficient.

Sufficient verification is enough; do not pursue exhaustive certainty.

## Existing Failures

If a verification step fails, determine whether the failure is caused by the current change.

* If caused by the change, fix it.
* If unrelated or pre-existing, do not modify unrelated code solely to make the repository pass.

Report relevant verification results and pre-existing failures briefly in the final response.
