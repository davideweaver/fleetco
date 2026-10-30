import { Module } from '@nestjs/common';

import { OutboxDispatcher } from './dispatcher';
import { OutboxNotifier } from './notifier';
import { OutboxRepository } from './repository';

/**
 * `exports` is the whole point of a Nest module and the strongest structural
 * argument for the framework: `OutboxRepository` and `OutboxNotifier` are
 * reachable from the customers module, and `OutboxDispatcher` is not. That is
 * [[Evolution Path]] rule 2 at tier 1 rather than tier 2.
 */
@Module({
  providers: [OutboxRepository, OutboxNotifier, OutboxDispatcher],
  // `OutboxDispatcher` is exported only so the scrape endpoint can read its
  // heartbeat. Nothing in a feature module may reach it — [[Evolution Path]]
  // rule 2 still holds; observability is platform, not a sibling module.
  exports: [OutboxRepository, OutboxNotifier, OutboxDispatcher],
})
export class OutboxModule {}
