#!/usr/bin/env bun
// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// tools/fw-codegen/src/index.ts
/**
 * @awacloud/tool-fw-codegen — CLI dispatch for the fw code-generation tools.
 *
 * Three subcommands, ported logic-verbatim from fw's `tools/types/codegen`
 * (registry), fw's now-deleted `tools/codegen-deps` one-shot (deps) — the
 * latter surviving only as the broken copy `packages/front/office/codegen-deps`
 * — and fw's `tools/types/audit` (audit, W1b). Only the fw-path resolution
 * seam is adapted (`--pkg`/cwd); the logic is unchanged (fw-tools
 * mutualization W1a/W1b):
 *   - `registry` — generate `types/registry.generated.d.ts` (module-name →
 *     factory instance-type map for `@awacloud/fw/typed`). Downstream-critical.
 *   - `deps`     — the one-shot `deps: [...]` injector; fills the `deps`
 *     companion field on modules declaring string-form `dependencies`.
 *   - `audit`    — read-only report classifying each module's factory
 *     `@returns` annotation into LOSSY/INFER/INLINE/TYPED buckets.
 *
 * The shared fw-module substrate is consumed from `@awacloud/tool-fw-bundler/modlib`
 * (devDep) — the modlib home ratified by Task 01; no re-copied `scan-modules`.
 *
 * Discoverable via `bun cli.ts fw-codegen <command> …`.
 *
 * Exit codes: 0 ok · 1 out-of-date/parse error (`registry --check` fail,
 * `deps --check` missing field) · 2 usage (unknown/missing command).
 */

import { runCli as runRegistryCli } from "./registry/index.js";
import { runCli as runDepsCli } from "./deps/index.js";
import { runCli as runAuditCli } from "./audit/index.js";

const USAGE = `Usage:
  bun cli.ts fw-codegen <command> [...args]   (via the monorepo CLI router)
  fw-codegen <command> [...args]              (standalone, via this package's bin)

Commands:
  registry [--check] [--pkg <dir>]              generate types/registry.generated.d.ts
  deps [--dry-run] [--check] [--pkg <dir>]      inject the deps: [...] companion field
  audit [--lossy-only] [--pkg <dir>]            report factory @returns LOSSY/INFER/TYPED buckets

Run \`fw-codegen registry --help\`, \`fw-codegen deps --help\`, or \`fw-codegen audit --help\` for command flags.`;

const argv = process.argv.slice(2);
const cmd = argv[0];

if (cmd === undefined) {
    process.stderr.write("fw-codegen: missing command.\n" + USAGE + "\n");
    process.exit(2);
}

if (cmd === "--help" || cmd === "-h" || cmd === "help") {
    process.stdout.write(USAGE + "\n");
    process.exit(0);
}

const rest = argv.slice(1);

if (cmd === "registry") {
    process.exit(runRegistryCli(rest));
}
if (cmd === "deps") {
    process.exit(runDepsCli(rest));
}
if (cmd === "audit") {
    process.exit(runAuditCli(rest));
}

process.stderr.write(`fw-codegen: unknown command "${cmd}".\n` + USAGE + "\n");
process.exit(2);
