# Changelog — `@awacloud/tool-fw-codegen`

All notable changes to this package are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

## [0.1.0] - 2026-09-29

### Fixed

- `deps` — every emitted identifier is now a real binding (addendum A3).
  Reported by a consumer package, where 2 of 329 descriptors were
  written broken with exit 0 and no warning — caught only by the consumer's
  test suite, never by `--dry-run` or `--check`.
  - The module `name:` is no longer assumed to be the exported JS binding: the
    real binding is emitted and **aliased** when they differ (`import { mdMod as
    md }`), keeping `deps[i]` textually equal to `dependencies[i]`. An alias
    that would shadow an existing top-level binding leaves the module
    unresolved instead.
  - Import parsing now ignores comments (`stripComments`, offset-preserving), so
    a JSDoc usage example is no longer read as an in-scope import.
  - New **emit guard**: an identifier that is not imported or declared in the
    resulting file is reported through the existing skip-and-continue path
    rather than written.

### Added

- `stripComments(src)` — pure, offset- and line-preserving comment blanker
  (addendum A3); string literals are scanned over but preserved.
- `deps` — cross-package `pkg_require` resolution (addendum A2).
  Closes the last office gap: `packages/front/office/pdf` now resolves fully, so
  all five office packages can be generated.
  - Layer 4: a `pkg_require` NAMESPACE SPREAD (`import * as ns from '<pkg>'` +
    `...ns.<field>`) is followed one hop into the sibling package. The sibling
    is located through the workspace manifest, its entry is parsed, and the
    identifiers of its `<field>` array are the guard.
  - The sibling binding maps to its **public** `exports` subpath (exact targets
    and one-`*` wildcard patterns); a file absent from `exports` stays
    unresolved — no private deep path is ever emitted across a package boundary.
    A binding the sibling itself imports from a package keeps that specifier.
  - Layers 1/3 generalized from `@awacloud/`-scoped to any package specifier: the
    guard arrays are the safety boundary, not the scope, so the tool serves a
    workspace whose packages are not named `@awacloud/*`.
  - New exports: `resolveWorkspacePackage(name, fromDir)` and
    `publicSubpathFor(pkgDir, file)` — both pure, FS-only, and deliberately
    `node_modules`-free (a workspace symlink can be stale; the root manifest's
    `workspaces` globs are the declarative source of truth).

- `deps` — consumer-package support.
  Additive only: existing flags, signatures and exit-code meanings unchanged.
  - `--ignore <glob>` (repeatable, `Bun.Glob` over the src-relative POSIX path)
    unioned with the new `DEFAULT_IGNORE = ['bundles/prebuilt/**']`, so the scan
    no longer embarks generated prebuilt bundles. Missing value → exit 2.
  - Static cross-package resolution of `@awacloud/fw` dependency names: descriptor-local
    `@awacloud/fw/…` imports first (alias-aware), then the package entry `main.js`
    import map intersected with its `fw_require` guard. Package code is never
    imported or executed.
  - Skip-and-continue: a module with an unresolvable name is skipped entirely
    (never a partial `deps`), siblings are still written; apply exits 1 with the
    skip list, `--dry-run` stays exit 0.
  - New exports: `filterScan(scanned, srcDir, ignore)` (pure), `DEFAULT_IGNORE`.
    `planDeps`/`runDeps` results gain `unresolved` (and `ignored` on `planDeps`).

- Initial mint of `@awacloud/tool-fw-codegen` (fw-tools mutualization).
  Ports two fw codegen tools logic-verbatim, alongside fw's unchanged originals:
  - `registry` subcommand ← fw `tools/types/codegen/index.js` — generates
    `types/registry.generated.d.ts` (the module-name → factory instance-type map
    for `@awacloud/fw/typed`). Downstream-critical: the office packages bind to it.
  - `deps` subcommand ← fw's now-deleted `tools/codegen-deps` one-shot (surviving
    only as the broken copy `packages/front/office/codegen-deps`) — injects the
    `deps: [...]` companion field. The repoint target for the office breakage.
- `--pkg <dir>` (both subcommands) and `--src <dir>` (`deps`) path-resolution
  seam (default: cwd); the only logic adaptation vs the fw originals.
- Consumes the shared fw-module substrate from `@awacloud/tool-fw-bundler/modlib`
  (devDep `@awacloud/tool-fw-bundler: workspace:*`) — no re-copied `scan-modules.js`.
- Programmatic APIs: `renderRegistry(pkg)` (pure, no write), `planDeps(seam)` /
  `runDeps(seam)`.
- Frozen `registry` / `deps` call-contract slice (`docs/README.md`).
- Golden / equivalence + idempotence integration tests: a byte-identical
  `registry` compare vs the real fw package's committed registry, and a
  semantic (normalized) `deps` equivalence check on a fixture.
- `audit` subcommand (additive to the frozen contract) ← fw `tools/types/audit/index.js` — read-only report classifying
  each module's factory `@returns` annotation into LOSSY/INFER/INLINE/TYPED
  buckets, ranked by dependent count. `--lossy-only` / `--pkg <dir>` flags.
  Programmatic APIs: `computeAudit(pkg)` (pure, no write) + `renderAudit(pkg,
  opts)` (pure text) + `runCli(argv)`. Golden-compare integration test proves
  byte-identical stdout vs fw's own `types/audit` script (default and
  `--lossy-only` modes), plus a fixture-tree bucket/ranking test.

### Notes

- fw source is untouched (the fw devDep add, `scripts` rewrite and `files` drop
  are deferred, recorded in the migration inventory, not applied here). The
  office packages are not touched — a later step deletes the broken
  `office/codegen-deps` copy.
