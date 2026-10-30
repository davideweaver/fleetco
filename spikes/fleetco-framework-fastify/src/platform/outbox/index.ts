/**
 * The outbox's public surface. Modules append events and read them back
 * through here; nothing outside this directory imports `schema.ts`.
 */
export { createOutboxDispatcher } from './dispatcher.js';
export type { OutboxDispatcher } from './dispatcher.js';
export { OUTBOX_CHANNEL, createOutboxListener, notificationSchema } from './listener.js';
export type { OutboxListener, OutboxNotification } from './listener.js';
export {
  append,
  countPending,
  currentCursor,
  readTopicSince,
} from './repository.js';
export type { NewOutboxEvent, OutboxEvent } from './repository.js';
