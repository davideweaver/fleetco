import { ApiError } from '../api';

/**
 * Renders the API's own problem body.
 *
 * This is the most useful component in the harness: every business rule in the
 * two modules surfaces here, with its `kind`, its message and its structured
 * context. Watching "a vehicle cannot be activated while its customer is not
 * active" appear with `customerStatus: inactive` attached is the whole reason
 * to have a UI at all.
 */
export function ProblemView({ error }: { error: unknown }): React.ReactElement | null {
  if (error === null || error === undefined) return null;

  if (error instanceof ApiError) {
    const problem = error.problem;
    return (
      <div className="problem">
        <div>
          <span className="kind">{problem?.kind ?? 'HTTP'} {error.status}</span>
          {' — '}
          {problem?.message ?? error.message}
        </div>
        {problem !== null && Object.keys(problem.context).length > 0 && (
          <div className="ctx">{JSON.stringify(problem.context)}</div>
        )}
      </div>
    );
  }
  return <div className="problem"><span className="kind">Error</span> — {String(error)}</div>;
}
