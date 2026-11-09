import { NextResponse } from "next/server"
import { getPool } from "@/lib/server/db"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error("CRON_SECRET is not configured.")
    return NextResponse.json({ error: "Job não configurado." }, { status: 503 })
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 })
  }

  const client = await getPool().connect()
  try {
    await client.query("BEGIN")
    const expired = await client.query<{ id: string }>(
      `SELECT id FROM orders
       WHERE status = 'pending_payment' AND mp_payment_id IS NULL
         AND expires_at <= now()
       ORDER BY expires_at
       LIMIT 100
       FOR UPDATE SKIP LOCKED`,
    )

    for (const order of expired.rows) {
      const cancelled = await client.query(
        `UPDATE orders SET status = 'cancelled', updated_at = now()
         WHERE id = $1 AND status = 'pending_payment'
         RETURNING id`,
        [order.id],
      )
      if (cancelled.rowCount !== 1) continue

      await client.query(
        `UPDATE product_variants variant
         SET stock = variant.stock + items.quantity
         FROM (
           SELECT product_id, size, sum(quantity)::integer AS quantity
           FROM order_items
           WHERE order_id = $1
           GROUP BY product_id, size
         ) AS items
         WHERE variant.product_id = items.product_id AND variant.size = items.size`,
        [order.id],
      )
    }

    await client.query(
      "DELETE FROM rate_limits WHERE window_started_at < now() - interval '24 hours'",
    )
    await client.query("COMMIT")
    return NextResponse.json({ expiredOrders: expired.rowCount })
  } catch (error) {
    await client.query("ROLLBACK")
    console.error("Expired order cleanup failed.", error)
    return NextResponse.json({ error: "Falha ao expirar pedidos." }, { status: 500 })
  } finally {
    client.release()
  }
}
