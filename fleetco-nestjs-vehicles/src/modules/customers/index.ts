/**
 * The module's public interface — the only legal import surface for another
 * module ([[Code Standards and Guardrails]] § The Golden Module).
 *
 * Note what is absent: `repository.ts`, `schema.ts`, and the Drizzle tables.
 * A sibling module that wants a customer asks `CustomersService`; it cannot
 * join against `customers.customers`.
 *
 * `CustomersModule` is exported for `AppModule` to import, and the Zod
 * contracts are exported because they are the wire shape other modules'
 * handlers may legitimately reference.
 */
export { CustomersModule } from './customers.module';
export { CustomersService } from './service';
export {
  customerSchema,
  customerEventSchema,
  createCustomerSchema,
  updateCustomerSchema,
  listCustomersQuerySchema,
  customerPageSchema,
} from './contracts';
export type {
  Customer,
  /**
   * Added when `vehicles` arrived: its activation rule is expressed in terms
   * of the owning fleet's status, so the status type is part of this module's
   * contract and not an internal detail. Module one could not have known that.
   */
  CustomerStatus,
  CustomerEvent,
  CreateCustomer,
  UpdateCustomer,
  ListCustomersQuery,
  CustomerPage,
} from './contracts';
export { CUSTOMER_EVENT_NAMES, customerTopic } from './events';
export type { CustomerEventName } from './events';
