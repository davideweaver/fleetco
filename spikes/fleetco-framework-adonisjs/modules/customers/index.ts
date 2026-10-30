/**
 * The module's public interface — "the only legal import surface"
 * ([[Code Standards and Guardrails]] § The Golden Module).
 *
 * Note what is *not* here: `schema.ts`. Another module that needs a customer
 * asks this module for it; it never queries `customers.customers`
 * ([[Evolution Path]] rule 2, enforced by the `no-restricted-imports` zone in
 * `eslint.config.mjs`).
 */
export { createCustomerStore, CUSTOMER_TABLES } from './repository.js';
export type { CustomerStore } from './repository.js';
export { createCustomerService } from './service.js';
export type { CustomerService, CustomerServiceDeps } from './service.js';
export { customerRoutes } from './routes.js';
export type { CustomerRoutes } from './routes.js';
export { customerTopic } from './events.js';
export type { CustomerEventName } from './events.js';
export {
  CUSTOMER_STATUSES,
  BILLING_TERMS_NET_DAYS,
  createCustomerSchema,
  customerSchema,
  updateCustomerSchema,
} from './contracts.js';
export type {
  CreateCustomer,
  Customer,
  CustomerEvent,
  CustomerPage,
  CustomerStatus,
  ListCustomersQuery,
  UpdateCustomer,
} from './contracts.js';
