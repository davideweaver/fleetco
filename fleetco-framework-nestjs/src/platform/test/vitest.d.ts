import 'vitest';

/**
 * The database URL the global setup hands to every worker. Declared as a
 * module augmentation (hence the bare `import` above, which makes this file a
 * module rather than an ambient declaration that would shadow `vitest`).
 */
declare module 'vitest' {
  interface ProvidedContext {
    databaseUrl: string;
  }
}
