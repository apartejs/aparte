/**
 * Exhaustiveness guard for discriminated-union `switch`es. The argument narrows to
 * `never` only when every variant has a matching `case`, so adding a new union
 * member without handling it becomes a TYPECHECK error here instead of being
 * silently ignored at runtime. The throw is the runtime backstop (should be
 * unreachable in well-typed code).
 */
export function assertNever(value: never): never {
    throw new Error(`Unhandled union member: ${JSON.stringify(value)}`);
}
