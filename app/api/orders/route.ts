import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { checkoutSchema } from "@/lib/checkout-schema";
import { checkRateLimit, getPool } from "@/lib/server/db";
import { isTrustedOrigin } from "@/lib/server/origin";
import { getShippingPrices, shippingOptions } from "@/lib/shipping";

export const runtime = "nodejs";

function getSiteUrl(): string {
  const rawUrl = process.env.SITE_URL;
  if (!rawUrl) throw new Error("SITE_URL is not configured.");
  const url = new URL(rawUrl);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("SITE_URL must use HTTPS in production.");
  }
  return url.origin;
}

export async function POST(request: Request) {
  if (!isTrustedOrigin(request)) {
    return NextResponse.json({ error: "Origem da solicitação inválida." }, { status: 403 });
  }

  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey || !/^[0-9a-f-]{36}$/i.test(idempotencyKey)) {
    return NextResponse.json({ error: "Chave de compra inválida." }, { status: 400 });
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Confira os dados do pedido." }, { status: 400 });
  }

  const rateLimit = await checkRateLimit(
    `checkout:${parsed.data.customer.email.toLowerCase()}`,
    12,
    60 * 60 * 1000,
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas de checkout. Tente novamente mais tarde." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  const paymentToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!paymentToken) {
    return NextResponse.json({ error: "Pagamento ainda não está configurado." }, { status: 503 });
  }

  let siteUrl: string;
  let shippingPrices: ReturnType<typeof getShippingPrices>;
  try {
    siteUrl = getSiteUrl();
    shippingPrices = getShippingPrices();
  } catch (error) {
    console.error("Checkout configuration is invalid.", error);
    return NextResponse.json({ error: "Checkout indisponível." }, { status: 503 });
  }

  const aggregatedItems = new Map<string, { productId: number; size: string; quantity: number }>();
  for (const item of parsed.data.items) {
    const key = `${item.productId}:${item.size}`;
    const previous = aggregatedItems.get(key);
    const quantity = (previous?.quantity ?? 0) + item.quantity;
    if (quantity > 20) {
      return NextResponse.json({ error: "Quantidade máxima por tamanho excedida." }, { status: 400 });
    }
    aggregatedItems.set(key, { ...item, quantity });
  }
  const requestHash = createHash("sha256")
    .update(
      JSON.stringify({
        items: [...aggregatedItems.values()].sort(
          (left, right) => left.productId - right.productId || left.size.localeCompare(right.size),
        ),
        customer: { ...parsed.data.customer, email: parsed.data.customer.email.toLowerCase() },
        address: parsed.data.address,
        shippingMethod: parsed.data.shippingMethod,
        paymentMethod: parsed.data.paymentMethod,
      }),
    )
    .digest("hex");

  const session = await getServerSession(authOptions);
  const pool = getPool();
  const client = await pool.connect();
  let order:
    | {
        id: string;
        status: string;
        mp_init_point: string | null;
        customer_email: string;
        total_cents: number;
        request_hash: string;
        shipping_method: keyof typeof shippingOptions;
        payment_method: "pix" | "card";
        shipping_cents: number;
        expires_at: Date;
      }
    | undefined;
  let created = false;

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [idempotencyKey]);

    const existing = await client.query(
      `SELECT id, status, mp_init_point, customer_email, total_cents,
              request_hash, shipping_method, payment_method, shipping_cents, expires_at
       FROM orders WHERE idempotency_key = $1 FOR UPDATE`,
      [idempotencyKey],
    );
    order = existing.rows[0];

    if (!order) {
      const lineItems: Array<{
        productId: number;
        productName: string;
        size: string;
        unitPriceCents: number;
        quantity: number;
      }> = [];
      let subtotalCents = 0;

      for (const item of aggregatedItems.values()) {
        const variant = await client.query<{
          product_name: string;
          price_cents: number;
          stock: number;
        }>(
          `SELECT p.name AS product_name, p.price_cents, v.stock
           FROM products p
           JOIN product_variants v ON v.product_id = p.id
           WHERE p.id = $1 AND v.size = $2 AND v.active = true AND p.active = true
           FOR UPDATE OF v`,
          [item.productId, item.size],
        );
        const product = variant.rows[0];

        if (!product || product.stock < item.quantity) {
          await client.query("ROLLBACK");
          return NextResponse.json(
            { error: "Um ou mais itens estão indisponíveis ou sem estoque." },
            { status: 409 },
          );
        }

        subtotalCents += product.price_cents * item.quantity;
        if (!Number.isSafeInteger(subtotalCents)) {
          throw new Error("Order subtotal exceeds the supported amount.");
        }
        lineItems.push({
          productId: item.productId,
          productName: product.product_name,
          size: item.size,
          unitPriceCents: product.price_cents,
          quantity: item.quantity,
        });
      }

      const shippingCents = shippingPrices[parsed.data.shippingMethod];
      const totalCents = subtotalCents + shippingCents;
      if (!Number.isSafeInteger(totalCents) || totalCents > 2_147_483_647) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "O valor do pedido excede o limite permitido." }, { status: 400 });
      }
      const inserted = await client.query(
        `INSERT INTO orders (
           idempotency_key, request_hash, user_id, customer_name, customer_email, customer_phone,
           shipping_address, shipping_method, payment_method, subtotal_cents,
           shipping_cents, total_cents, expires_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now() + interval '24 hours')
         RETURNING id, status, mp_init_point, customer_email, total_cents,
                   request_hash, shipping_method, payment_method, shipping_cents, expires_at`,
        [
          idempotencyKey,
          requestHash,
          session?.user.id ?? null,
          parsed.data.customer.name,
          parsed.data.customer.email.toLowerCase(),
          parsed.data.customer.phone,
          JSON.stringify(parsed.data.address),
          parsed.data.shippingMethod,
          parsed.data.paymentMethod,
          subtotalCents,
          shippingCents,
          totalCents,
        ],
      );
      const insertedOrder = inserted.rows[0];
      order = insertedOrder;
      created = true;

      for (const item of lineItems) {
        const updated = await client.query(
          `UPDATE product_variants
           SET stock = stock - $1
           WHERE product_id = $2 AND size = $3 AND stock >= $1`,
          [item.quantity, item.productId, item.size],
        );
        if (updated.rowCount !== 1) throw new Error("Inventory changed during checkout.");
        await client.query(
          `INSERT INTO order_items (order_id, product_id, product_name, size, unit_price_cents, quantity)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [insertedOrder.id, item.productId, item.productName, item.size, item.unitPriceCents, item.quantity],
        );
      }
    }

    const activeOrder = order;
    if (!activeOrder) throw new Error("Order creation did not return an order.");
    if (activeOrder.request_hash !== requestHash) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "A chave de compra já foi usada para outros dados." },
        { status: 409 },
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Order creation failed.", error);
    return NextResponse.json({ error: "Não foi possível criar o pedido." }, { status: 500 });
  } finally {
    client.release();
  }

  const finalizedOrder = order;
  if (!finalizedOrder) {
    return NextResponse.json({ error: "Não foi possível criar o pedido." }, { status: 500 });
  }
  if (finalizedOrder.status !== "pending_payment") {
    return NextResponse.json({ error: "Este pedido não pode ser pago novamente." }, { status: 409 });
  }
  if (finalizedOrder.expires_at.getTime() <= Date.now()) {
    return NextResponse.json(
      { error: "Este pedido expirou. Inicie uma nova compra." },
      { status: 409 },
    );
  }
  if (finalizedOrder.mp_init_point) {
    return NextResponse.json({ checkoutUrl: finalizedOrder.mp_init_point });
  }

  try {
    const itemsResult = await pool.query<{
      product_name: string;
      size: string;
      unit_price_cents: number;
      quantity: number;
    }>(
      `SELECT product_name, size, unit_price_cents, quantity
       FROM order_items WHERE order_id = $1 ORDER BY id`,
      [finalizedOrder.id],
    );
    const orderItems = itemsResult.rows;
    const shippingMethod = finalizedOrder.shipping_method;
    const paymentMethod = finalizedOrder.payment_method;
    const preferenceResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paymentToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": finalizedOrder.id,
      },
      body: JSON.stringify({
        items: orderItems.map((item, index) => ({
          id: `${finalizedOrder.id}-${index + 1}`,
          title: `${item.product_name} (Tam. ${item.size})`,
          quantity: item.quantity,
          currency_id: "BRL",
          unit_price: item.unit_price_cents / 100,
        })),
        shipments: { cost: finalizedOrder.shipping_cents / 100, mode: "not_specified" },
        payer: { email: finalizedOrder.customer_email },
        external_reference: finalizedOrder.id,
        expires: true,
        expiration_date_from: new Date().toISOString(),
        expiration_date_to: finalizedOrder.expires_at.toISOString(),
        notification_url: `${siteUrl}/api/webhooks/mercadopago`,
        back_urls: {
          success: `${siteUrl}/?payment=success`,
          pending: `${siteUrl}/?payment=pending`,
          failure: `${siteUrl}/?payment=failure`,
        },
        payment_methods: {
          excluded_payment_types:
            paymentMethod === "pix"
              ? [{ id: "credit_card" }, { id: "debit_card" }, { id: "ticket" }]
              : [{ id: "bank_transfer" }, { id: "ticket" }],
        },
      }),
      cache: "no-store",
    });

    const preference: unknown = await preferenceResponse.json();
    if (!preferenceResponse.ok || typeof preference !== "object" || preference === null) {
      throw new Error(`Mercado Pago preference request failed with status ${preferenceResponse.status}.`);
    }

    const preferenceData = preference as { id?: unknown; init_point?: unknown };
    if (typeof preferenceData.id !== "string" || typeof preferenceData.init_point !== "string") {
      throw new Error("Mercado Pago returned an invalid checkout preference.");
    }

    await pool.query(
      `UPDATE orders
       SET mp_preference_id = $1, mp_init_point = $2, updated_at = now()
       WHERE id = $3 AND status = 'pending_payment'`,
      [preferenceData.id, preferenceData.init_point, finalizedOrder.id],
    );

    return NextResponse.json({ checkoutUrl: preferenceData.init_point }, { status: created ? 201 : 200 });
  } catch (error) {
    console.error("Payment preference creation failed.", error);
    return NextResponse.json(
      { error: "Não foi possível iniciar o pagamento. Tente novamente usando o mesmo pedido." },
      { status: 502 },
    );
  }
}
