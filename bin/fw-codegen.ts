#!/usr/bin/env bun
// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// tools/fw-codegen/bin/fw-codegen.ts
/**
 * Standalone CLI entry point for `@awacloud/tool-fw-codegen` (BL-642, O4
 * ruling — `ai/program/PUBLICATION-DECISIONS.md` § O4 — tools/* lot rows
 * are autonomous).
 *
 * Thin delegate only: importing `../src/index.ts` re-runs its dispatch
 * unchanged — same argument parsing, same `registry` / `deps` / `audit`
 * subcommand routing, same `0`/`1`/`2` exit-code contract — so this file
 * duplicates none of it. It exists so an npm consumer of the exported
 * package can run `fw-codegen <command> [...args]` directly (via
 * `node_modules/.bin/fw-codegen`, `npx fw-codegen`, or `bun bin/fw-codegen.ts`)
 * without this monorepo's `cli.ts` router, which does not travel with an
 * exported sub-repo.
 */
import "../src/index.ts";
