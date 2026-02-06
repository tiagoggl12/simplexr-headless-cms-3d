import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export interface DatabaseConfig {
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
}

/**
 * Get or create the database connection pool
 * Connection pooling is reused across requests for efficiency
 */
export function getPool(config?: DatabaseConfig): pg.Pool {
  if (!pool) {
    pool = new Pool(config || {
      connectionString: process.env.DATABASE_URL,
    });

    // Handle pool errors
    pool.on('error', (err) => {
      console.error('Unexpected database pool error:', err);
    });
  }

  return pool;
}

/**
 * Close the database connection pool
 * Call this when shutting down the application
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Execute a SQL query with parameters
 * This is a convenience wrapper around pool.query
 */
export async function query<T = unknown>(
  sql: string,
  params?: unknown[]
): Promise<{ rows: T[]; rowCount: number | null; command: string; fields: any[] }> {
  const poolInstance = getPool();
  const result = await poolInstance.query(sql, params);
  return {
    rows: result.rows as T[],
    rowCount: result.rowCount,
    command: result.command,
    fields: result.fields,
  };
}
