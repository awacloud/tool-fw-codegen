# @awacloud/tool-fw-codegen

Code-generation tools for `@awacloud/fw`-shaped packages: the `registry` generator
(the module-name → factory instance-type map that powers `@awacloud/fw/typed`), the
`deps` one-shot injector (fills the `deps: [...]` companion field on modules
declaring string-form `dependencies`), and the `audit` read-only report
(classifies each module's factory `@returns` annotation into
LOSSY/INFER/INLINE/TYPED buckets). Generalised to any fw-shaped package via a
`--pkg` / `--src` seam.

The shared fw-module substrate (`scanAll`, `relativeImport`, …) is consumed from
`@awacloud/tool-fw-bundler/modlib` (a devDep). No `scan-modules.js` is
re-copied into this package.

## Consumption shape

**Autonomous — standalone `bin`.** This package ships its own `fw-codegen`
executable (`bin/fw-codegen.ts`, a thin delegate to `src/index.ts` — no
argument parsing duplicated), so it runs directly once installed:

```bash
bunx fw-codegen registry --pkg packages/front/fw --check
```

## Installation

```bash
npm install --save-dev @awacloud/tool-fw-codegen
```

Runs under Bun (the `bin` is TypeScript executed by Bun).

## Quick Start

```bash
# Regenerate a package's typed-runtime registry (defaults to the current dir)
bunx fw-codegen registry --pkg packages/front/fw

# Verify the registry is up to date (exit 1 if stale)
bunx fw-codegen registry --pkg packages/front/fw --check

# Inject the `deps: [...]` companion field into a package's modules
bunx fw-codegen deps --pkg packages/front/office/pdf

# Report the planned deps edits without writing
bunx fw-codegen deps --pkg packages/front/office/pdf --dry-run

# Exclude an extra subtree from the deps scan (repeatable; unioned with the
# default ignore of generated `src/bundles/prebuilt/**`)
bunx fw-codegen deps --pkg packages/front/office/md --ignore "legacy/**"

# Audit a package's factory @returns annotations (read-only report)
bunx fw-codegen audit --pkg packages/front/fw

# Only print the LOSSY/INLINE fix-list sections
bunx fw-codegen audit --pkg packages/front/fw --lossy-only
```

`--pkg <dir>` selects the package root (`src/`, `types/`, `dist/types/` resolve
under it). When omitted it defaults to the working directory, so fw's own build
scripts — which run at the fw package root — keep working unchanged. `deps` also
accepts `--src <dir>` to point the scan at a source dir directly, plus
`--ignore <glob>` to exclude subtrees.

From a *consumer* package (office), `deps` additionally ignores generated
prebuilt bundles by default, resolves dependency names it cannot find locally
through four static layers — the descriptor's own package imports, the entry
`main.js` under its `fw_require` guard, the entry under its `pkg_require`
guard, and one hop into a sibling package reached by a `pkg_require` namespace
spread — and skips (rather than aborts on) a module whose names it cannot
resolve. It never imports package code and never emits a private deep path
across a package boundary. What it writes is always a **real binding**: the
module `name:` is aliased to the actual export when the two differ, comments are
not mistaken for imports, and an identifier that would not be bound in the
resulting file is reported as unresolved instead of written. See
[`docs/README.md`](./docs/README.md) § Consumer-package behaviour and
§ What is written is a real binding.

Direct invocation without the `bin` is equivalent:

```bash
bun node_modules/@awacloud/tool-fw-codegen/src/registry/index.js --pkg packages/front/fw --check
bun node_modules/@awacloud/tool-fw-codegen/src/deps/index.js --pkg packages/front/office/pdf --dry-run
bun node_modules/@awacloud/tool-fw-codegen/src/audit/index.js --pkg packages/front/fw --lossy-only
```

## Structure

```
src/
  index.ts            CLI dispatch: `registry` | `deps` | `audit`
  registry/
    index.js          types/registry.generated.d.ts emitter (renderRegistry, runCli)
  deps/
    index.js          the deps: [...] one-shot injector (planDeps, runDeps, runCli)
  audit/
    index.js          factory @returns LOSSY/INFER/INLINE/TYPED report (computeAudit, renderAudit, runCli)
tests/                golden (registry byte, audit byte) / equivalence (deps semantic) + idempotence
  __fixtures__/
    mini-fw/          fw-shaped package for the registry write path
    deps-src/         a module missing `deps` — exercises the injector
    deps-ignore/      real modules + generated prebuilt bundles — exercises the ignore filter
    deps-fw/          an office-shaped consumer (main.js + fw_require) — exercises fw resolution
    deps-workspace/   a whole fixture workspace (root + consumer + sibling) — exercises pkg_require
    deps-noworkspace/ a manifest without `workspaces` — pins the walk-up behaviour
    deps-binding/     name ≠ export, an alias that would shadow, a JSDoc import — exercises the emit guard
    audit-src/        a module tree spanning LOSSY/INFER/INLINE/TYPED — exercises the auditor
```

The shared substrate lives in the sibling package:

```js
import { scanAll, relativeImport } from '@awacloud/tool-fw-bundler/modlib';
```

## Build

Not applicable — the tool is executed directly by Bun (no build step). The
`registry` / `deps` / `audit` subcommands ARE the codegen machinery for
downstream fw-shaped packages.

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | success (incl. `--help`, `--check` up-to-date, `--dry-run`) |
| 1 | out-of-date / parse error (`registry --check` stale, `deps --check` missing field, `deps` apply with ≥1 skipped module — the refined "unresolvable dependency" meaning) |
| 2 | usage error (unknown / missing command, unknown flag, unexpected positional) |

## Tests

```bash
bun test tools/fw-codegen/
```

The suite byte-compares `registry` output against the real fw package's
committed `registry.generated.d.ts` (the file fw's own `types:registry:check`
validates), proves byte-idempotence, drives the `deps` injector on a fixture
with a normalized (semantic) equivalence check on the injected imports + `deps`
literal, and byte-compares `audit`'s rendered report against fw's own
`tools/types/audit` script's stdout (the verbatim-port oracle). See
`docs/README.md` for the frozen call contract.

## Documentation

- [`docs/README.md`](./docs/README.md) — module map + the frozen `registry` / `deps` call contract.
- [`CHANGELOG.md`](./CHANGELOG.md).

## See also

- [`@awacloud/tool-fw-bundler`](https://github.com/awacloud/awa/tree/main/tools/fw-bundler) — the sibling package that hosts `./modlib`.
- [`@awacloud/fw`](https://github.com/awacloud/awa/tree/main/packages/front/fw) — the framework whose codegen tools this package ports.

## Licence

Apache-2.0 — see [`LICENSE`](LICENSE) in this package.

Copyright (c) 2026 AwaCloud SAS

## Project

- Website: https://awaforge.eu
- Source: [`tools/fw-codegen`](https://github.com/awacloud/awa/tree/main/tools/fw-codegen)
- Issues: this package's own repository has issues disabled — report at
  https://github.com/awacloud/awa/issues
- Security policy and release verification:
  https://github.com/awacloud/awa/blob/main/SECURITY.md
- Maintenance policy:
  https://github.com/awacloud/awa/blob/main/MAINTENANCE.md

A CycloneDX 1.6 and SPDX 2.3 SBOM is generated for each published release.

Developed by AwaCloud.
