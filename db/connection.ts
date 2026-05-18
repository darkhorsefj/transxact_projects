import "dotenv/config";
import { drizzle } from "drizzle-orm/libsql";
import { sql } from "drizzle-orm";

const db = drizzle(process.env.DB_FILE_NAME!);

type ColumnDefinition = {
  name: string;
  sqlType: string;
};

const compatibilityColumns: Record<string, ColumnDefinition[]> = {
  user: [
    { name: "role", sqlType: "text DEFAULT 'member' NOT NULL" },
    { name: "codeExpiresAt", sqlType: "text" },
    { name: "codeAttemptCount", sqlType: "integer DEFAULT 0 NOT NULL" },
    { name: "codeLastRequestedAt", sqlType: "text" },
    { name: "invitedByUserId", sqlType: "integer" },
    { name: "invitationAcceptedAt", sqlType: "text" },
    { name: "firstLoginCompletedAt", sqlType: "text" },
  ],
  project: [
    { name: "createdByUserId", sqlType: "integer" },
    { name: "deletedAt", sqlType: "text" },
  ],
  task: [
    { name: "assigneeUserId", sqlType: "integer" },
    { name: "dueAt", sqlType: "text" },
    { name: "createdByUserId", sqlType: "integer" },
    { name: "deletedAt", sqlType: "text" },
    { name: "overdueNotifiedAt", sqlType: "text" },
  ],
  issue: [
    { name: "taskId", sqlType: "integer" },
    { name: "assigneeUserId", sqlType: "integer" },
    { name: "createdByUserId", sqlType: "integer" },
    { name: "deletedAt", sqlType: "text" },
  ],
  notification: [{ name: "inAppVisible", sqlType: "integer DEFAULT 1 NOT NULL" }],
};

const compatibilityTableStatements: string[] = [];

const compatibilityIndexStatements: string[] = [];

type TableInfoRow = {
  name: string;
};

let ensureDbSchemaPromise: Promise<void> | null = null;

async function tableExists(tableName: string): Promise<boolean> {
  const rows = await db.all<{ name: string }>(
    sql.raw(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}' LIMIT 1`,
    ),
  );
  return rows.length > 0;
}

async function getColumns(tableName: string): Promise<Set<string>> {
  const rows = await db.all<TableInfoRow>(
    sql.raw(`PRAGMA table_info('${tableName}')`),
  );
  return new Set(rows.map((row) => row.name));
}

async function addColumn(
  tableName: string,
  definition: ColumnDefinition,
): Promise<void> {
  await db.run(
    sql.raw(
      `ALTER TABLE "${tableName}" ADD COLUMN "${definition.name}" ${definition.sqlType}`,
    ),
  );
}

async function ensureCompatibilityColumns(): Promise<void> {
  for (const [tableName, definitions] of Object.entries(compatibilityColumns)) {
    if (!(await tableExists(tableName))) {
      continue;
    }

    const existingColumns = await getColumns(tableName);
    for (const definition of definitions) {
      if (!existingColumns.has(definition.name)) {
        await addColumn(tableName, definition);
      }
    }
  }
}

async function ensureCompatibilityTables(): Promise<void> {
  for (const statement of compatibilityTableStatements) {
    await db.run(sql.raw(statement));
  }
}

async function ensureCompatibilityIndexes(): Promise<void> {
  for (const statement of compatibilityIndexStatements) {
    await db.run(sql.raw(statement));
  }
}

export async function ensureDbSchema(): Promise<void> {
  if (!ensureDbSchemaPromise) {
    ensureDbSchemaPromise = (async () => {
      await ensureCompatibilityTables();
      await ensureCompatibilityColumns();
      await ensureCompatibilityIndexes();
    })().catch((error) => {
      ensureDbSchemaPromise = null;
      throw error;
    });
  }

  await ensureDbSchemaPromise;
}

export default db;
