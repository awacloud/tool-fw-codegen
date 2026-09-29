# `@awacloud/tool-fw-codegen` — package docs index

Co-located documentation for `tools/fw-codegen` (fw code-generation tools).
This index gives the exhaustive module table for `src/` and freezes the
`registry` / `deps` slice of the fw-tools mutualization call contract, whose
unified form spans both mutualized tool packages.

## Module table

### `src/` — CLI dispatch

| Module | Purpose |
|---|---|
| `src/index.ts` | CLI dispatch: routes `registry` \| `deps` \| `audit`; exit 2 on unknown/missing command. Discoverable via `fw-codegen --help`. |

### `src/registry/` — typed-runtime registry generator

| Module | Purpose |
|---|---|
| `registry/index.js` | Emits `types/registry.generated.d.ts` (module-name → factory instance-type map for `@awacloud/fw/typed`). Exports `renderRegistry(pkg)` (pure, no write) + `runCli(argv)`. |

### `src/deps/` — `deps: [...]` one-shot injector

| Module | Purpose |
|---|---|
| `deps/index.js` | Injects the `deps: [...]` companion field + sibling imports into modules declaring string-form `dependencies`. Ignores generated prebuilt bundles, resolves fw AND cross-package names statically (4 layers), skips (never partially rewrites) modules with an unresolvable name. Exports `planDeps(seam)`, `runDeps(seam)`, `runCli(argv)`, `filterScan(scanned, srcDir, ignore)`, `DEFAULT_IGNORE`, `resolveWorkspacePackage(name, fromDir)`, `publicSubpathFor(pkgDir, file)`. |

### `src/audit/` — factory return-type audit

| Module | Purpose |
|---|---|
| `audit/index.js` | Read-only report classifying each module's factory `@returns` annotation into LOSSY/INFER/INLINE/TYPED buckets, ranked by dependent count. Exports `computeAudit(pkg)` (pure, no write) + `renderAudit(pkg, opts)` (pure text) + `runCli(argv)`. |

### Consumed substrate (`@awacloud/tool-fw-bundler/modlib`)

`scanAll`, `parseFile`, `listSourceFiles`, `relativeImport` (scan-modules) +
`printHelp`, `wantsHelp`, `isMainModule` (cli-help) — imported from the sibling
package's `./modlib` subpath. Not re-copied here (single source, by design).

## Path-resolution seam (`--pkg` / `--src`)

The only logic adaptation vs the fw originals: every fw-relative default derives
from `PKG_ROOT = --pkg ?? cwd`. `registry` resolves `src/`, `types/`,
`dist/types/` under it; `deps` resolves `src/` (or `--src <dir>` directly);
`audit` resolves `src/` under it. fw's build scripts run at the fw package
root, so the cwd default keeps fw green; `--pkg <dir>` retargets the machinery
at any fw-shaped package.

## Frozen call contract

The surface downstream freezes bind to (graphic-anim-packaging, office-harmonization)
and P2 must preserve or supersede via a human-reviewed plan change. Ratified
verbatim from the mutualization design proposal.

### `registry` (CLI + API)

- **CLI:** `fw-codegen registry [--check] [--pkg <dir>]`.
  - `--check` — exit 1 (no write) if `types/registry.generated.d.ts` is out of
    date; exit 0 (a no-op) when current.
- **API:** `renderRegistry(pkg = cwd) → { text, moduleCount }` (pure, never
  writes); `runCli(argv) → exitCode`.

### `deps` (CLI + API)

- **CLI:** `fw-codegen deps [--dry-run] [--check] [--pkg <dir>] [--src <dir>] [--ignore <glob>]`.
  - `--dry-run` — report the planned edits + the skip list, write nothing (exit 0).
  - `--check` — exit 1 if any module with non-empty `dependencies` is missing its
    `deps` field (skipped modules included, listed after the plain misses),
    **or** (the content leg) if an ALREADY-POPULATED module's `deps`
    identifiers no longer match what `dependencies` resolves to (a rename, a
    hand-edit, or a stale copy-paste — `hasDepsField` alone only proves the
    field exists, not that it still resolves); exit 0 otherwise. The content
    leg is check-only: it never plans a write (`rewriteFile` never touches an
    already-populated module), so a drifted module must be fixed by hand.
  - `--ignore <glob>` — **additive, repeatable** (ratified as a contract
    addendum). `Bun.Glob` pattern matched against the src-relative POSIX path,
    unioned with `DEFAULT_IGNORE`. A missing value is a usage error (exit 2).
- **API:** `planDeps({ pkg, src, ignore }) → { srcDir, plan, unparseable,
  unresolved, ignored, contentDrift }` (no write; `contentDrift` is
  `{ file, moduleName, expected, found }[]` for already-populated modules
  whose on-disk `deps` no longer matches); `runDeps({ pkg, src, ignore, dryRun }) →
  { srcDir, updated, unresolved }`; `runCli(argv) → exitCode`; plus the pure
  `filterScan(scanned, srcDir, ignore)` and the `DEFAULT_IGNORE` constant, and
  — since addendum A2 — the pure `resolveWorkspacePackage(name, fromDir)` and
  `publicSubpathFor(pkgDir, file)` (FS-only, `node_modules`-free); and — since
  addendum A3 — the pure `stripComments(src)`.

#### What is written is a real binding (A3)

Resolution finding a name is not enough: the identifier written into
`deps: [...]` must be **bound in the resulting file**. Three rules, added after
a consumer package wrote 2 of 329 descriptors broken with exit 0 and no warning.

1. **`name:` ≠ binding.** The framework module name and the exported JS
   identifier are distinct (`modlib` exposes both). When they differ the import
   is **aliased** — `import { mdMod as md } from '../md.js'` — because
   `validate-deps` compares `deps[i]` to `dependencies[i]` textually. An alias
   that would shadow an existing top-level binding leaves the module unresolved.
2. **A comment is not a binding.** All three import parsers read a
   comment-stripped source, so a documented usage example (`* import { xml as
   xmlMod } from …` in a JSDoc header) is no longer taken for a live import.
   `stripComments` preserves offsets and line numbers, and keeps string literals
   (specifiers live in them) while scanning over them.
3. **Emit guard.** Any identifier that is neither imported by the rewrite, nor
   already imported, nor declared at top level makes the module **unresolved**
   (skip-and-continue, exit 1 with the list) instead of being written. Neither
   `--dry-run` nor `--check` can catch a phantom binding — `--check` only asserts
   that a `deps` field exists — so the guard lives in the write path.

#### Consumer-package behaviour

Three behaviours make `deps` usable from a package that *consumes* fw, not only
from fw itself. None changes the frozen flags, signatures or exit-code meanings.

1. **Generated bundles are out of the scan.** `DEFAULT_IGNORE =
   ['bundles/prebuilt/**']`: the prebuilt bundles are build artefacts
   (`tools/generate-prebuilds.mjs`) whose `dependencies` name host-injected fw
   modules. They are dropped before any resolution, and an ignored file can
   never be picked as an import target — the name index is rebuilt from the
   survivors, so a bundle re-declaring a real module's name is inert.
2. **Static cross-package name resolution — four ordered layers.** A dependency
   name absent from the package's own `src/` is resolved against:
   1. the descriptor file's own named package imports (alias-aware; the
      in-scope binding is reused, no import added);
   2. the package entry `<src>/main.js` `@awacloud/fw/…` imports, **intersected with
      the identifiers of its `export const fw_require = [ … ]` array** — the
      guard enumerating exactly the fw modules injected in package mode;
   3. the entry's named sibling-package imports, intersected with its
      `pkg_require` guard;
   4. the entry's `pkg_require` **namespace spreads** (`import * as ns from
      '<pkg>'` + `...ns.<field>`, addendum A2): the sibling package is located
      through the workspace manifest, its own entry is parsed, and the
      identifiers of its `<field>` array act as the guard. A sibling binding
      imported relatively maps to its **public** `exports` subpath; one imported
      from a package specifier keeps that specifier verbatim.

   Package code is never imported or executed; emission reuses the specifier
   verbatim. **Two hard rules**: the spread FIELD is the guard (a name in the
   sibling's `modules` when only `fw_require` is spread stays unresolved), and a
   sibling file absent from its `exports` map stays unresolved — the tool never
   emits a private deep path across a package boundary. Resolution follows one
   hop only (a sibling's own `pkg_require` is not walked).
3. **Skip-and-continue.** A module with ≥1 unresolvable name is skipped
   *entirely* — never a partial or invented `deps` array. Apply mode writes all
   fully-resolved modules, then exits 1 with the skip list (`file`,
   `moduleName`, missing names); `--dry-run` still exits 0 (frozen contract).

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | ok (incl. `--help`, `--check` up-to-date, `--dry-run`) |
| `1` | out-of-date / parse error (`registry --check` stale, `deps --check` missing field, `deps` apply with ≥1 skipped module — the refined "unresolvable dependency" meaning) |
| `2` | usage (unknown / missing command, unknown flag, unexpected positional) |

## `audit` (CLI + API) — additive

Not part of the frozen contract above, which reserved it as a future slot.
Purely additive: does not change `registry`/`deps` signatures or exit codes.

- **CLI:** `fw-codegen audit [--lossy-only] [--pkg <dir>]`. Read-only
  — never writes.
- **API:** `computeAudit(pkg = cwd) → { total, lossy, infer, inline, typed,
  unparseable }` (pure, no write, no log); `renderAudit(pkg = cwd, { lossyOnly })
  → string` (pure text, same format as fw's `types/audit` stdout); `runCli(argv)
  → exitCode`.
- Exit codes: `0` ok (incl. `--help`); `1` if the shared scanner throws (e.g. a
  duplicate module name); `2` usage (unknown flag, unexpected positional).

## Golden-compare method (how the port is verified)

- **registry:** byte-identical rendered output vs the real fw package's committed
  `types/registry.generated.d.ts` (`--pkg packages/front/fw`, 199 modules) — the
  file fw's own `types:registry:check` oracle validates; plus byte-idempotence and
  a write→`--check` no-op on an isolated fixture (fw's committed file is never
  clobbered — the golden compare uses the pure `renderRegistry`).
- **deps:** running against fw is now a no-op (fw is fully deps-populated), so
  equivalence is proved on a FIXTURE module missing its `deps` field — a
  normalized (semantic) compare of the injected imports + `deps: [...]` literal
  (insertion offsets vary → not byte), with `--check` agreement before/after and
  a re-import smoke on the injected module. The consumer-package behaviours are
  proved on two dedicated fixture packages (`tests/__fixtures__/deps-ignore`,
  `deps-fw`) plus a **read-only** coverage proof over the five real office
  trees (`tests/deps-office-coverage.integration.test.js`), which also pins the
  `deps`-in-package-mode DI semantics and the prebuilt path's indifference to
  `deps`. Addendum A2 adds a fixture WORKSPACE
  (`tests/__fixtures__/deps-workspace`: root manifest + consumer + sibling +
  a `!`-negated package) whose packages are deliberately NOT `@awacloud/*`-scoped —
  proof the resolution is scope-agnostic rather than hardcoded to this repo.
  Addendum A3 adds `tests/__fixtures__/deps-binding` (a module whose `name:`
  differs from its export, one that would be shadowed by the alias, and one
  documenting an aliased import in its JSDoc) plus a read-only proof on the two
  real office descriptors that exposed the defect (`mdFullBundle`,
  `wmlRunFormatting`). Each fixture was run against the PRE-fix generator to
  confirm it reproduced the defect before the fix removed it.
- **audit:** byte-identical stdout vs the real fw package's own
  `packages/front/fw/tools/types/audit/index.js` script (spawned directly,
  its `PKG_ROOT` resolves from its own file location so it is cwd-independent),
  for both the default and `--lossy-only` modes; plus a fixture module tree
  (`tests/__fixtures__/audit-src`) exercising the LOSSY/INFER/INLINE/TYPED
  classification and dependent-count ranking in isolation.
