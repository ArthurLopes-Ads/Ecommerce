import "server-only";
import { Pool } from "pg";

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }

  pool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  return pool;
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const result = await getPool().query<{ attempts: number; window_started_at: Date }>(
    `INSERT INTO rate_limits (key, window_started_at, attempts)
     VALUES ($1, now(), 1)
     ON CONFLICT (key) DO UPDATE SET
       attempts = CASE
         WHEN rate_limits.window_started_at <= now() - ($2 * interval '1 millisecond') THEN 1
         ELSE rate_limits.attempts + 1
       END,
       window_started_at = CASE
         WHEN rate_limits.window_started_at <= now() - ($2 * interval '1 millisecond') THEN now()
         ELSE rate_limits.window_started_at
       END
     RETURNING attempts, window_started_at`,
    [key, windowMs],
  );
  const { attempts, window_started_at: startedAt } = result.rows[0];
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((startedAt.getTime() + windowMs - Date.now()) / 1000),
  );

  return { allowed: attempts <= limit, retryAfterSeconds };
}
