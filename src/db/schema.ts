import { relations } from 'drizzle-orm';
import { integer, jsonb, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  role: text('role').notNull().default('member'),
  createdAt: timestamp('created_at').defaultNow()
});

export const portalSnapshots = pgTable('portal_snapshots', {
  id: text('id').primaryKey(),
  payload: jsonb('payload').notNull(),
  updatedAt: timestamp('updated_at').defaultNow()
});

export const sqlAuditLogs = pgTable('sql_audit_logs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  actorUid: text('actor_uid'),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  details: text('details'),
  createdAt: timestamp('created_at').defaultNow()
});

export const usersRelations = relations(users, ({ many }) => ({
  auditEntries: many(sqlAuditLogs)
}));

export const sqlAuditLogsRelations = relations(sqlAuditLogs, ({ one }) => ({
  author: one(users, {
    fields: [sqlAuditLogs.userId],
    references: [users.id]
  })
}));
