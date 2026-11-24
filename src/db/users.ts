import { eq } from 'drizzle-orm';
import { db as sqlDb, isCloudSqlConfigured } from './index.ts';
import { portalSnapshots, sqlAuditLogs, users } from './schema.ts';

export async function getOrCreateUser(uid: string, email: string) {
  if (!isCloudSqlConfigured()) return null;
  try {
    const result = await sqlDb
      .insert(users)
      .values({
        uid,
        email
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email
        }
      })
      .returning();

    return result[0] || null;
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function getUsers() {
  if (!isCloudSqlConfigured()) return [];
  try {
    return await sqlDb.select().from(users);
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function getUserByUid(uid: string) {
  if (!isCloudSqlConfigured()) return null;
  try {
    const rows = await sqlDb.select().from(users).where(eq(users.uid, uid)).limit(1);
    return rows[0] || null;
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function savePortalSnapshotToSql(snapshot: Record<string, unknown>) {
  if (!isCloudSqlConfigured()) return;
  try {
    await sqlDb
      .insert(portalSnapshots)
      .values({
        id: 'primary',
        payload: snapshot,
        updatedAt: new Date()
      })
      .onConflictDoUpdate({
        target: portalSnapshots.id,
        set: {
          payload: snapshot,
          updatedAt: new Date()
        }
      });
  } catch (error) {
    console.error('Database snapshot sync failed:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function recordSqlAuditEvent(params: {
  userId?: number | null;
  actorUid?: string | null;
  action: string;
  entityType: string;
  details?: string;
}) {
  if (!isCloudSqlConfigured()) return;
  try {
    await sqlDb.insert(sqlAuditLogs).values({
      userId: params.userId ?? null,
      actorUid: params.actorUid ?? null,
      action: params.action,
      entityType: params.entityType,
      details: params.details ?? null
    });
  } catch (error) {
    console.error('Database audit log insert failed:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}
