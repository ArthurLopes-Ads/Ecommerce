import { NextResponse } from "next/server"
import { z } from "zod"
import { isCurrentAdmin } from "@/lib/server/admin"
import { getPool } from "@/lib/server/db"
import { isTrustedOrigin } from "@/lib/server/origin"

function isSafeImageUrl(value: string): boolean {
  if (value.startsWith("/") && !value.startsWith("//")) return true

  try {
    return new URL(value).protocol === "https:"
  } catch {
    return false
  }
}

const productSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().min(1).max(2000),
  priceCents: z.number().int().min(0).max(2_147_483_647),
  image: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .refine(isSafeImageUrl, "A imagem precisa ser um caminho local ou URL HTTPS."),
  active: z.boolean(),
  variants: z
    .array(
      z.object({
        size: z.string().trim().min(1).max(10),
        stock: z.number().int().min(0).max(100_000),
      }),
    )
    .max(30),
})

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    if (!(await isCurrentAdmin())) {
      return NextResponse.json({ error: "Acesso não autorizado." }, { status: 403 })
    }

    const result = await getPool().query<{
      id: number
      name: string
      description: string
      price_cents: number
      image_url: string
      active: boolean
      variants: { size: string; stock: number }[] | null
    }>(
      `SELECT p.id, p.name, p.description, p.price_cents, p.image_url, p.active,
              json_agg(json_build_object('size', v.size, 'stock', v.stock) ORDER BY v.size)
                FILTER (WHERE v.active = true) AS variants
       FROM products p
       LEFT JOIN product_variants v ON v.product_id = p.id
       GROUP BY p.id
       ORDER BY p.name`,
    )

    return NextResponse.json(
      result.rows.map((product) => ({
        id: product.id,
        name: product.name,
        description: product.description,
        priceCents: product.price_cents,
        image: product.image_url,
        active: product.active,
        variants: product.variants ?? [],
      })),
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    console.error("Admin product list failed.", error)
    return NextResponse.json({ error: "Não foi possível carregar os produtos." }, { status: 500 })
  }
}

export async function POST(request: Request) {
  if (!isTrustedOrigin(request)) {
    return NextResponse.json({ error: "Origem da solicitação inválida." }, { status: 403 })
  }

  if (!(await isCurrentAdmin())) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 403 })
  }

  const body: unknown = await request.json().catch(() => null)
  const parsed = productSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados do produto inválidos." }, { status: 400 })
  }
  if (new Set(parsed.data.variants.map((variant) => variant.size)).size !== parsed.data.variants.length) {
    return NextResponse.json({ error: "Os tamanhos não podem se repetir." }, { status: 400 })
  }

  const pool = getPool()
  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    let productId: number
    if (parsed.data.id) {
      const updated = await client.query(
        `UPDATE products
         SET name = $1, description = $2, price_cents = $3, image_url = $4, active = $5, updated_at = now()
         WHERE id = $6
         RETURNING id`,
        [
          parsed.data.name,
          parsed.data.description,
          parsed.data.priceCents,
          parsed.data.image,
          parsed.data.active,
          parsed.data.id,
        ],
      )
      if (updated.rowCount !== 1) {
        await client.query("ROLLBACK")
        return NextResponse.json({ error: "Produto não encontrado." }, { status: 404 })
      }
      productId = parsed.data.id
    } else {
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO products (name, description, price_cents, image_url, active)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [
          parsed.data.name,
          parsed.data.description,
          parsed.data.priceCents,
          parsed.data.image,
          parsed.data.active,
        ],
      )
      productId = inserted.rows[0].id
    }

    for (const variant of parsed.data.variants) {
      await client.query(
        "SELECT id FROM product_variants WHERE product_id = $1 AND size = $2 FOR UPDATE",
        [productId, variant.size],
      )
      const reservations = await client.query(
        `SELECT o.id
         FROM orders o
         JOIN order_items item ON item.order_id = o.id
         WHERE o.status = 'pending_payment' AND o.expires_at > now()
           AND item.product_id = $1 AND item.size = $2`,
        [productId, variant.size],
      )
      if (reservations.rowCount && reservations.rowCount > 0) {
        await client.query("ROLLBACK")
        return NextResponse.json(
          { error: `Não é possível editar o estoque do tamanho ${variant.size} enquanto há pedidos pendentes.` },
          { status: 409 },
        )
      }

      await client.query(
        `INSERT INTO product_variants (product_id, size, stock)
         VALUES ($1, $2, $3)
         ON CONFLICT (product_id, size) DO UPDATE
         SET stock = EXCLUDED.stock, active = true`,
        [productId, variant.size, variant.stock],
      )
    }
    if (parsed.data.variants.length === 0) {
      await client.query("UPDATE product_variants SET active = false WHERE product_id = $1", [productId])
    } else {
      await client.query(
        "UPDATE product_variants SET active = false WHERE product_id = $1 AND NOT (size = ANY($2::text[]))",
        [productId, parsed.data.variants.map((variant) => variant.size)],
      )
    }

    await client.query("COMMIT")
    return NextResponse.json({ id: productId }, { status: parsed.data.id ? 200 : 201 })
  } catch (error) {
    await client.query("ROLLBACK")
    console.error("Admin product save failed.", error)
    return NextResponse.json({ error: "Não foi possível salvar o produto." }, { status: 500 })
  } finally {
    client.release()
  }
}
