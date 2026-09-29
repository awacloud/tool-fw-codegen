#!/usr/bin/env bun
// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// tools/fw-codegen/src/audit/index.js
/**
 * @fileoverview Audits each module's `factory` return-type annotation and
 * reports which ones degrade the emitted `.d.ts` (and therefore `InstanceOf` /
 * the typed runtime registry).
 *
 * Ported logic-verbatim from `packages/front/fw/tools/types/audit/index.js`
 * (fw-tools mutualization W1b). The only adaptation is the path-resolution
 * seam: `PKG_ROOT` / `SRC_DIR` derive from `--pkg ?? cwd` instead of the
 * tool's own file location, so any fw-shaped package can point the auditor at
 * its own `src/`.
 *
 * Three buckets:
 *   - LOSSY  : explicit wide `@returns` (`{Object}`, `{object}`, `{any}`, `{*}`,
 *              `{}`, `{Function}`, `{unknown}`). tsc honours the annotation and
 *              throws away the real shape → `resolve('x')` becomes useless.
 *              **These are the fix targets.**
 *   - INFER  : no `@returns` on the factory → tsc infers from the returned
 *              literal. Usually fine, occasionally loose. Low priority.
 *   - TYPED  : precise `@returns {SomeType}` (a typedef / constructor / shape).
 *              Good — nothing to do.
 *   - INLINE : anonymous `@returns {{ ... }}` object literal — no exported
 *              type alias; fix target, promote to a named `@typedef`.
 *
 * LOSSY entries are ranked by dependent count (how many other modules depend on
 * them) as a usage proxy — fix the most-depended-on first.
 *
 * Read-only. Usage:
 *     bun cli.ts fw-codegen audit                       # full report
 *     bun cli.ts fw-codegen audit --lossy-only          # only the fix list
 *     bun cli.ts fw-codegen audit --pkg <dir>           # target another package
 */

import { readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';

import { scanAll } from '@awacloud/tool-fw-bundler/modlib';
import { printHelp, wantsHelp, isMainModule } from '@awacloud/tool-fw-bundler/modlib';

const WIDE = new Set(['Object', 'object', 'any', '*', '{}', 'Function', 'function', 'unknown']);

// ─── CLI help ───
const HELP_USAGE = 'bun cli.ts fw-codegen audit [--lossy-only] [--pkg <dir>]';
const HELP_FLAGS = [
    ['--lossy-only', 'Print only the LOSSY/INLINE fix-list sections (omit the INFER/TYPED-omitted lines).'],
    ['--pkg <dir>', 'Package root to read from (default: cwd). Resolves src/ under it.'],
    ['--help, -h', 'Show this help.'],
];
const HELP_EXAMPLES = [
    'bun cli.ts fw-codegen audit',
    'bun cli.ts fw-codegen audit --lossy-only',
    'bun cli.ts fw-codegen audit --pkg packages/front/fw',
];

/**
 * Parse the `audit` subcommand argv.
 * @param {string[]} argv
 * @returns {{ lossyOnly: boolean, pkg: string|null }}
 */
function parseArgs(argv) {
    const opts = { lossyOnly: false, pkg: null };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--lossy-only') opts.lossyOnly = true;
        else if (a === '--pkg') opts.pkg = argv[++i];
        else if (a.startsWith('--')) throw new Error(`Unknown flag: ${a}. Run with --help.`);
        else throw new Error(`Unexpected positional argument: ${a}`);
    }
    return opts;
}

/**
 * Extract the `@returns {TYPE}` type string of the module's factory.
 * Returns `null` when the factory carries no `@returns` annotation.
 *
 * @param {string} src
 * @returns {string | null}
 */
function factoryReturnsType(src) {
    // Anchor on the comment-close `*/` immediately followed by `factory` — this
    // is the factory's own JSDoc, and ignores `factory()` mentioned inside an
    // `@example` block (which would otherwise match a `\bfactory` search first).
    const m = src.match(/\*\/\s*factory\s*[(:]/);
    if (!m) return null; // factory has no preceding JSDoc → inferred

    const closeIdx = m.index; // position of `*/`
    const openIdx = src.lastIndexOf('/**', closeIdx);
    if (openIdx < 0) return null;

    const block = src.slice(openIdx, closeIdx + 2);
    const at = block.search(/@returns?\s*\{/);
    if (at < 0) return null;

    // Balance braces from the first `{` after @returns.
    const start = block.indexOf('{', at);
    let depth = 0;
    let i = start;
    for (; i < block.length; i++) {
        if (block[i] === '{') depth++;
        else if (block[i] === '}') { depth--; if (depth === 0) { i++; break; } }
    }
    return block.slice(start + 1, i - 1).trim();
}

/**
 * Pure programmatic API: scan `<pkg>/src` and classify each module's factory
 * `@returns` annotation into LOSSY / INFER / INLINE / TYPED buckets, ranked by
 * dependent count. Never writes, never logs.
 *
 * @param {string} [pkg]  Package root (default: cwd).
 * @returns {{
 *   total: number,
 *   lossy: {name: string, rel: string, ret: string|null, deps: number}[],
 *   infer: {name: string, rel: string, ret: string|null, deps: number}[],
 *   inline: {name: string, rel: string, ret: string|null, deps: number}[],
 *   typed: {name: string, rel: string, ret: string|null, deps: number}[],
 *   unparseable: import('@awacloud/tool-fw-bundler/modlib').ModuleInfo[],
 * }}
 */
export function computeAudit(pkg = process.cwd()) {
    const pkgRoot = resolve(pkg);
    const srcDir = resolve(pkgRoot, 'src');
    const { byFile, unparseable } = scanAll(srcDir);

    // Dependent counts (usage proxy).
    const dependents = new Map();
    for (const info of byFile.values()) {
        for (const dep of info.depNames) {
            dependents.set(dep, (dependents.get(dep) || 0) + 1);
        }
    }

    const lossy = [];
    const infer = [];
    const inline = [];
    const typed = [];

    for (const info of byFile.values()) {
        const src = readFileSync(info.file, 'utf8');
        const ret = factoryReturnsType(src);
        const rel = relative(pkgRoot, info.file).replace(/\\/g, '/');
        const row = {
            name: info.moduleName,
            rel,
            ret,
            deps: dependents.get(info.moduleName) || 0,
        };
        if (ret === null) infer.push(row);
        else if (WIDE.has(ret)) lossy.push(row);
        else if (ret.startsWith('{')) inline.push(row); // anonymous object literal → no exported type alias
        else typed.push(row);
    }

    const byDepsDesc = (a, b) => b.deps - a.deps || (a.name < b.name ? -1 : 1);
    lossy.sort(byDepsDesc);
    infer.sort(byDepsDesc);
    inline.sort(byDepsDesc);

    return { total: byFile.size, lossy, infer, inline, typed, unparseable };
}

/**
 * Pure formatter: render the human-readable audit report text (byte-identical
 * to fw's `types/audit` stdout format) from an already-computed audit result.
 * Never writes, never logs.
 *
 * @param {{total: number, lossy: object[], infer: object[], inline: object[], typed: object[]}} result
 * @param {{ lossyOnly?: boolean }} [opts]
 * @returns {string}
 */
function formatReport({ total, lossy, infer, inline, typed }, opts = {}) {
    const lossyOnly = opts.lossyOnly ?? false;
    const lines = [];
    const out = (s = '') => lines.push(s);

    out('');
    out(`Factory return-type audit — ${total} modules`);
    out(`  TYPED  (named @returns type)  : ${typed.length}  → exported type alias (TypeDoc "Type Aliases")`);
    out(`  INLINE (anonymous {…} @returns): ${inline.length}  ← fix targets : promote to a named @typedef`);
    out(`  INFER  (no @returns)          : ${infer.length}`);
    out(`  LOSSY  (wide @returns)        : ${lossy.length}  ← fix targets`);
    out('');

    const printTable = (rows, header) => {
        if (!rows.length) return;
        out(`── ${header}`);
        const w = Math.max(6, ...rows.map((r) => r.name.length));
        for (const r of rows) {
            const pad = r.name + ' '.repeat(w - r.name.length);
            const tail = r.ret === null ? '(inferred)' : `@returns {${r.ret}}`;
            out(`  ${pad}  deps:${String(r.deps).padStart(2)}  ${tail}  — ${r.rel}`);
        }
        out('');
    };

    printTable(lossy, `LOSSY — fix these (by dependents desc)`);
    printTable(inline, `INLINE — promote anonymous {…} to a named @typedef (→ TypeDoc Type Alias)`);
    if (!lossyOnly) {
        printTable(infer, `INFER — verify (inference may be loose)`);
        out(`(${typed.length} TYPED modules omitted — already a named, exported type.)`);
    }

    return lines.join('\n') + '\n';
}

/**
 * Pure programmatic API: render the human-readable audit report text (same
 * format fw's `types/audit` prints to stdout). Never writes, never logs.
 *
 * @param {string} [pkg]  Package root (default: cwd).
 * @param {{ lossyOnly?: boolean }} [opts]
 * @returns {string}
 */
export function renderAudit(pkg = process.cwd(), opts = {}) {
    return formatReport(computeAudit(pkg), opts);
}

/**
 * Run the `audit` subcommand CLI. Returns the process exit code.
 * @param {string[]} argv  Args after the `audit` token.
 * @returns {number}
 */
export function runCli(argv) {
    if (wantsHelp(argv)) { printHelp(HELP_USAGE, HELP_FLAGS, HELP_EXAMPLES); return 0; }

    let opts;
    try { opts = parseArgs(argv); }
    catch (err) { console.error('[codegen-audit] ' + err.message); return 2; }

    const pkgRoot = resolve(opts.pkg ?? process.cwd());

    let result;
    try { result = computeAudit(pkgRoot); }
    catch (err) { console.error('[codegen-audit] ' + err.message); return 1; }

    if (result.unparseable.length) {
        console.error(`[codegen-audit] ${result.unparseable.length} unparseable file(s).`);
    }

    process.stdout.write(formatReport(result, { lossyOnly: opts.lossyOnly }));
    return 0;
}

if (isMainModule(import.meta.url)) {
    process.exit(runCli(process.argv.slice(2)));
}
