import { NextResponse } from "next/server";
import { getPool } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await getPool().query<{
      id: number;
      name: string;
      description: string;
      price_cents: number;
      image_url: string;
      sizes: string[] | null;
    }>(
      `SELECT p.id, p.name, p.description, p.price_cents, p.image_url,
              array_agg(v.size ORDER BY v.size)
                FILTER (WHERE v.stock > 0 AND v.active = true) AS sizes
       FROM products p
       LEFT JOIN product_variants v ON v.product_id = p.id
       WHERE p.active = true
       GROUP BY p.id
       ORDER BY p.name`,
    );

    return NextResponse.json(
      result.rows.map((product) => ({
        id: product.id,
        name: product.name,
        description: product.description,
        priceCents: product.price_cents,
        image: product.image_url,
        sizes: product.sizes ?? [],
      })),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Product catalog query failed.", error);
    return NextResponse.json({ error: "Catálogo indisponível." }, { status: 503 });
  }
}
