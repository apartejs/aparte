import ts from 'typescript';
import { angularJitApplicationTransform } from '@angular/compiler-cli';
import { resolve } from 'path';
import type { Plugin } from 'vite';

/**
 * Lets the JIT-compiled specs see Angular's signal APIs.
 *
 * `input()`, `model()`, `output()`, `viewChild()`, `contentChild()` and friends are plain
 * function calls in the source. The AOT compiler turns them into component metadata; in JIT
 * that work is done by Angular's own TypeScript transform (`angularJitApplicationTransform`),
 * which the Angular CLI runs for a JIT build. esbuild — what Vitest uses here — does not, so
 * without this plugin a signal input silently keeps its initial value: `setInput()` and template
 * bindings never reach it.
 *
 * The plugin compiles only this package's own `src/**\/*.ts` with that transform, through one
 * TypeScript program it reuses between files (the transform needs the type checker to know an
 * `input` call is Angular's). Everything else still goes through esbuild.
 */
const SIGNAL_API = /\b(?:input|model|output|viewChild|viewChildren|contentChild|contentChildren)\s*(?:\.required\s*)?[(<]/;

export function angularJitSignals(packageDir: string): Plugin {
    const srcDir = resolve(packageDir, 'src').replace(/\\/g, '/');
    const parsed = ts.getParsedCommandLineOfConfigFile(
        resolve(packageDir, 'tsconfig.spec.json'),
        {},
        { ...ts.sys, onUnRecoverableConfigFileDiagnostic: (d) => { throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n')); } },
    );
    if (!parsed) throw new Error('[aparte] could not read tsconfig.spec.json');
    // `composite` (inherited from the package tsconfig) forbids turning declarations off, and
    // TypeScript then skips the emit altogether — with no error unless you read the result.
    const options: ts.CompilerOptions = {
        ...parsed.options,
        composite: false,
        incremental: false,
        tsBuildInfoFile: undefined,
        noEmit: false,
        noEmitOnError: false, // type checking is `typecheck:tests`' job; this only emits JS
        emitDeclarationOnly: false,
        declaration: false,
        declarationMap: false,
        declarationDir: undefined,
        sourceMap: false,
        inlineSourceMap: false,
        inlineSources: false,
        module: ts.ModuleKind.ESNext,
        importHelpers: false,
    };
    let program: ts.Program | undefined;

    return {
        name: 'aparte:angular-jit-signals',
        enforce: 'pre',
        transform(code, id) {
            const file = id.split('?')[0].replace(/\\/g, '/');
            if (!file.endsWith('.ts') || file.endsWith('.d.ts') || !file.startsWith(srcDir)) return null;
            // A program per file is the slow part: only files that call a signal API need it.
            if (!SIGNAL_API.test(code)) return null;
            const host = ts.createCompilerHost(options);
            const readFromDisk = host.getSourceFile.bind(host);
            host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) =>
                fileName.replace(/\\/g, '/') === file
                    ? ts.createSourceFile(fileName, code, languageVersion, true)
                    : readFromDisk(fileName, languageVersion, onError, shouldCreate);
            program = ts.createProgram([file], options, host, program);
            const sourceFile = program.getSourceFile(file);
            if (!sourceFile) return null;
            let output = '';
            const result = program.emit(
                sourceFile,
                (name, text) => { if (name.endsWith('.js')) output = text; },
                undefined,
                false,
                { before: [angularJitApplicationTransform(program)] },
            );
            // A skipped emit must be loud: falling back to esbuild would bring back the exact
            // silent failure this plugin exists to prevent (a signal input that never updates).
            if (result.emitSkipped || !output) {
                const why = result.diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' ')).join('; ');
                throw new Error(`[aparte] the Angular JIT transform emitted nothing for ${file}${why ? `: ${why}` : ''}`);
            }
            return { code: output, map: null };
        },
    };
}
