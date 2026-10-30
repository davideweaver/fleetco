/**
 * Ported from `authors-api`'s `lib/app/AppModule.ts`, which is nine lines and
 * does two things: it gives every subsystem the same `init()` / `close()` pair,
 * and it hands each one a reference to the application so it can reach its
 * siblings explicitly — `this.app.db` rather than a resolved provider token.
 *
 * [[Framework Evaluation]] describes this as "a module system with lifecycle
 * hooks ... he wanted the structure NestJS provides and wrote it himself rather
 * than adopt a framework," and the thing being tested in this spike is whether
 * that remains a good trade when agents write the code. The honest summary of
 * the trade is in NOTES.md § 3.
 *
 * One change from the original: `TApp` has no `= any` default. The original
 * defaulted it, which is harmless when a careful human writes every module and
 * is a silent hole when an agent does.
 */
export default class AppModule<TApp> {
  protected readonly app: TApp;

  constructor(app: TApp) {
    this.app = app;
  }

  /** Acquire resources. Called by `App.startup()` in dependency order. */
  public init(): Promise<void> {
    return Promise.resolve();
  }

  /** Release them. Called by `App.shutdown()` in the reverse order. */
  public close(): Promise<void> {
    return Promise.resolve();
  }
}
