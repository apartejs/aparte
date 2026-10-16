/**
 * The runtimes of aparte-titler, one per language. Each reads the same model files and gives the
 * same title, character for character — the Swift package's tests compare it with the JavaScript
 * runtime and the Python reference at every precision. A new port is one more row here.
 */
export interface TitlerRuntime {
    /** The language it is written for. */
    language: string;
    /** Where it runs. */
    platforms: string;
    /** What a reader types or pastes to install it. */
    install: string;
    /** What takes that line, when it is not a command. */
    installNote?: string;
    /** Its page. */
    href: string;
}

export const TITLER_RUNTIMES: TitlerRuntime[] = [
    {
        language: 'JavaScript',
        platforms: 'Browsers, Node',
        install: 'npm install @aparte/titler-latin',
        href: 'https://www.npmjs.com/package/@aparte/titler-latin',
    },
    {
        language: 'Swift',
        platforms: 'iOS, macOS, tvOS, watchOS, visionOS, Linux, Windows',
        install: 'https://github.com/apartejs/aparte-titler-swift',
        installNote: 'Swift Package Manager',
        href: 'https://github.com/apartejs/aparte-titler-swift',
    },
];
