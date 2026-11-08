import { describe, test, expect } from "#test-runner";
import * as anod from "#anod";
import * as internal from "#anod-internal";
import { signal, c, refuse } from "#anod";
import path from "node:path";
import ts from "typescript";

const typesDir = path.resolve(import.meta.dirname, "../types");
const indexPath = path.join(typesDir, "index.d.ts");
const internalPath = path.join(typesDir, "internal.d.ts");
const checkPath = path.join(typesDir, "__check__.ts");

/**
 * Type-checks the declarations, plus an optional virtual source file that
 * imports from them, and returns the program, its diagnostics, and the
 * 0-based line in the source file of each diagnostic (-1 elsewhere).
 * @param {string=} source
 */
function compile(source) {
    const options = { strict: true, noEmit: true, target: ts.ScriptTarget.ES2020, lib: ["lib.es2020.d.ts", "lib.dom.d.ts"] };
    const host = ts.createCompilerHost(options);
    const getSourceFile = host.getSourceFile;
    host.getSourceFile = (fileName, version, ...rest) => {
        if (source !== void 0 && path.resolve(fileName) === checkPath) {
            return ts.createSourceFile(fileName, source, version);
        }
        return getSourceFile.call(host, fileName, version, ...rest);
    };
    const roots = source !== void 0 ? [indexPath, internalPath, checkPath] : [indexPath, internalPath];
    const program = ts.createProgram(roots, options, host);
    const all = ts.getPreEmitDiagnostics(program);
    const diagnostics = all.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
    const lines = all.map((d) =>
        d.file !== void 0 && path.resolve(d.file.fileName) === checkPath
            ? d.file.getLineAndCharacterOfPosition(d.start).line
            : -1
    );
    return { program, diagnostics, lines };
}

/**
 * The names a declaration file exports as values. Types, and names
 * re-exported with `export type`, are not part of the module's value.
 * @param {ts.Program} program
 * @param {string} file
 */
function declaredValues(program, file) {
    const checker = program.getTypeChecker();
    const source = program.getSourceFile(file);
    const module = checker.getTypeOfSymbolAtLocation(checker.getSymbolAtLocation(source), source);
    return checker.getPropertiesOfType(module).map((symbol) => symbol.name).sort();
}

describe("declarations", () => {
    test("type-check cleanly", () => {
        expect(compile().diagnostics).toEqual([]);
    });

    test("declare exactly what anod exports", () => {
        expect(declaredValues(compile().program, indexPath)).toEqual(Object.keys(anod).sort());
    });

    test("declare exactly what anod/internal exports", () => {
        expect(declaredValues(compile().program, internalPath)).toEqual(Object.keys(internal).sort());
    });

    test("anod exposes nodes as interfaces only", () => {
        const { diagnostics } = compile(`
            import { Effect } from "./index.js";
            const E = Effect;
        `);
        expect(diagnostics.length).toBe(1);
        expect(diagnostics[0].includes("exported using 'export type'")).toBe(true);
    });

    test("anod/internal declares the constructors", () => {
        const { diagnostics } = compile(`
            import { Compute, Effect, Root, connect, addOwned, startEffect, signal } from "./internal.js";
            const s = signal(1);
            const owner = new Root();
            const node = new Effect(0, (v: number, c) => {}, s, owner);
            connect(s, node);
            addOwned(owner, node);
            startEffect(node);
            const k: Compute<string> = new Compute((v: number, c) => String(v), 0, s);
            function Derived(this: Effect) {
                Effect.call(this, 0, (c) => { c.val(s); }, null, null);
            }
            Derived.prototype = Object.create(Effect.prototype);
        `);
        expect(diagnostics).toEqual([]);
    });

    test("rejected() is typed as returning the error", () => {
        const { diagnostics } = compile(`
            import type { Context, Defect } from "./index.js";
            type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
            const ok: Equal<ReturnType<Context["rejected"]>, Defect | null> = true;
        `);
        expect(diagnostics).toEqual([]);
    });

    test("options, states and Defect types type-check where they belong", () => {
        const { diagnostics } = compile(`
            import { c, signal, root, STABLE, WEAK, EAGER, DEFER, SETUP, DISPOSED, LOADING, ERROR, REFUSE, PANIC, Defect } from "./index.js";
            const s = signal(1);
            const n = c.compute((cx) => cx.val(s), void 0, STABLE);
            c.compute((cx) => cx.val(s), void 0, WEAK);
            c.compute((cx) => cx.val(s), void 0, EAGER);
            c.compute(s, (v) => v, void 0, SETUP);
            c.effect((cx) => { cx.is(STABLE); }, DEFER);
            c.spawn(async (cx) => { cx.is(LOADING); }, STABLE);
            c.task(async (cx) => 1, void 0, EAGER);
            n.is(STABLE);
            n.is(LOADING);
            s.is(ERROR);
            root((cx) => cx.is(DISPOSED));
            const d = new Defect("x", PANIC);
            if (d.type === REFUSE) {}
        `);
        expect(diagnostics).toEqual([]);
    });

    test("misused options, states and Defect types are compile errors", () => {
        const cases = [
            "c.compute(() => 1, void 0, ERROR);",
            "c.effect(() => {}, LOADING);",
            "c.effect(() => {}, WEAK);",
            "c.spawn(async () => {}, EAGER);",
            "c.compute(() => 1, void 0, STABLE | WEAK);",
            "c.compute(() => 1, void 0, 2048);",
            "n.is(REFUSE);",
            "n.is(LOADING | ERROR);",
            "if (d.type === ERROR) {}",
            "new Defect('x', STABLE);",
            "n.stable();",
            "n.weak();",
            "n.eager();",
            "n.disposed;",
            "n.loading;",
            "n.error;"
        ];
        const header = [
            `import { c, STABLE, WEAK, EAGER, LOADING, ERROR, REFUSE, PANIC, Defect } from "./index.js";`,
            "const n = c.compute(() => 1);",
            `const d = new Defect("x", PANIC);`
        ];
        /** One program for all the cases: each sits on its own line, in its own block. */
        const { lines } = compile(header.concat(cases.map((line) => `{ ${line} }`)).join("\n"));
        const errors = cases.map((line, i) => [line, lines.filter((l) => l === header.length + i).length]);
        expect(errors).toEqual(cases.map((line) => [line, 1]));
        expect(lines.length).toBe(cases.length);
    });

    test("rejected() returns the error at runtime", () => {
        const s1 = signal(1);
        const c1 = c.compute((cx) => {
            const v = cx.val(s1);
            return v > 10 ? cx.refuse("too large") : v;
        });
        let err;
        const c2 = c.compute((cx) => {
            err = cx.rejected(c1);
            return 0;
        });
        c2.get();
        expect(err).toBe(null);
        s1.set(20);
        c2.get();
        expect(err).toEqual(refuse("too large"));
    });
});
