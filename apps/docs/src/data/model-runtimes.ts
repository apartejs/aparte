/**
 * The runtimes of each model aparté publishes, one per language. Within a model, each runtime
 * reads the same model file and gives the same answer — the same title character for
 * character, the same spans with the same categories — and each port's tests compare it with
 * the JavaScript runtime and the Python reference. A new port is one more row here.
 */
export interface ModelRuntime {
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

/** Every model's Swift and Kotlin packages target the same platforms. */
const SWIFT_PLATFORMS = 'iOS, macOS, tvOS, watchOS, visionOS, Linux, Windows';
const KOTLIN_PLATFORMS = 'Android 5.0+, any JVM 8+ — from Kotlin or Java';

export const TITLER_RUNTIMES: ModelRuntime[] = [
    {
        language: 'JavaScript',
        platforms: 'Browsers, Node',
        install: 'npm install @aparte/titler-latin',
        href: 'https://www.npmjs.com/package/@aparte/titler-latin',
    },
    {
        language: 'Swift',
        platforms: SWIFT_PLATFORMS,
        install: 'https://github.com/apartejs/aparte-titler-swift',
        installNote: 'Swift Package Manager',
        href: 'https://github.com/apartejs/aparte-titler-swift',
    },
    {
        language: 'Kotlin',
        platforms: KOTLIN_PLATFORMS,
        install: 'dev.apartejs:titler-latin',
        installNote: 'Maven Central',
        href: 'https://github.com/apartejs/aparte-titler-kotlin',
    },
];

export const PRIVACY_RUNTIMES: ModelRuntime[] = [
    {
        language: 'JavaScript',
        platforms: 'Browsers, Node, workers',
        install: 'npm install @aparte/privacy',
        href: 'https://www.npmjs.com/package/@aparte/privacy',
    },
    {
        language: 'Swift',
        platforms: SWIFT_PLATFORMS,
        install: 'https://github.com/apartejs/aparte-privacy-swift',
        installNote: 'Swift Package Manager',
        href: 'https://github.com/apartejs/aparte-privacy-swift',
    },
    {
        language: 'Kotlin',
        platforms: KOTLIN_PLATFORMS,
        install: 'dev.apartejs:privacy',
        installNote: 'Maven Central',
        href: 'https://github.com/apartejs/aparte-privacy-kotlin',
    },
];

export const SECRETS_RUNTIMES: ModelRuntime[] = [
    {
        language: 'JavaScript',
        platforms: 'Browsers, Node',
        install: 'npm install @aparte/secrets',
        href: 'https://www.npmjs.com/package/@aparte/secrets',
    },
    {
        language: 'Swift',
        platforms: SWIFT_PLATFORMS,
        install: 'https://github.com/apartejs/aparte-secrets-swift',
        installNote: 'Swift Package Manager',
        href: 'https://github.com/apartejs/aparte-secrets-swift',
    },
    {
        language: 'Kotlin',
        platforms: KOTLIN_PLATFORMS,
        install: 'dev.apartejs:secrets',
        installNote: 'Maven Central',
        href: 'https://github.com/apartejs/aparte-secrets-kotlin',
    },
];
