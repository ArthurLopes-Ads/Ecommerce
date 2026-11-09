import { createHmac, timingSafeEqual } from "node:crypto";
import { Resend } from "resend";
import { NextResponse } from "next/server";
import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";

type MercadoPagoNotification = {
  type?: unknown;
  action?: unknown;
  data?: { id?: unknown };
};

type MercadoPagoPayment = {
  id?: number | string;
  status?: string;
  currency_id?: string;
  transaction_amount?: number;
  external_reference?: string;
};

function isValidSignature(
  signatureHeader: string | null,
  requestId: string | null,
  paymentId: string,
  secret: string,
): boolean {
  if (!signatureHeader || !requestId) return false;

  const fields = new Map(
    signatureHeader.split(",").map((part) => {
      const separator = part.indexOf("=");
      return separator < 0
        ? ["", ""]
        : [part.slice(0, separator).trim(), part.slice(separator + 1).trim()];
    }),
  );
  const timestamp = fields.get("ts");
  const receivedSignature = fields.get("v1");
  if (!timestamp || !receivedSignature || !/^[a-f0-9]{64}$/i.test(receivedSignature)) return false;

  const manifest = `id:${paymentId.toLowerCase()};request-id:${requestId};ts:${timestamp};`;
  const expected = createHmac("sha256", secret).update(manifest).digest();
  const received = Buffer.from(receivedSignature, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

export async function POST(request: Request) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!secret || !accessToken) {
    console.error("Mercado Pago webhook is missing required credentials.");
    return NextResponse.json({ error: "Webhook não configurado." }, { status: 503 });
  }

  let notification: MercadoPagoNotification;
  try {
    notification = (await request.json()) as MercadoPagoNotification;
  } catch {
    return NextResponse.json({ error: "Notificação inválida." }, { status: 400 });
  }

  const url = new URL(request.url);
  const rawPaymentId = url.searchParams.get("data.id") ?? notification.data?.id;
  const paymentId = typeof rawPaymentId === "string" || typeof rawPaymentId === "number"
    ? String(rawPaymentId)
    : "";
  const eventType = url.searchParams.get("type") ?? notification.type;

  if (eventType !== "payment" && !(typeof notification.action === "string" && notification.action.startsWith("payment."))) {
    return NextResponse.json({ received: true });
  }
  if (!paymentId || !isValidSignature(request.headers.get("x-signature"), request.headers.get("x-request-id"), paymentId, secret)) {
    return NextResponse.json({ error: "Assinatura inválida." }, { status: 401 });
  }

  try {
    const paymentResponse = await fetch(
      `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" },
    );
    if (!paymentResponse.ok) {
      throw new Error(`Mercado Pago payment lookup failed with status ${paymentResponse.status}.`);
    }

    const payment = (await paymentResponse.json()) as MercadoPagoPayment;
    if (payment.status !== "approved") return NextResponse.json({ received: true });

    const externalReference = payment.external_reference;
    if (String(payment.id) !== paymentId) {
      return NextResponse.json({ error: "Identificador de pagamento divergente." }, { status: 400 });
    }
    const amountCents =
      typeof payment.transaction_amount === "number"
        ? Math.round(payment.transaction_amount * 100)
        : Number.NaN;
    if (
      !externalReference ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(externalReference) ||
      payment.currency_id !== "BRL" ||
      !Number.isSafeInteger(amountCents) ||
      amountCents < 0
    ) {
      return NextResponse.json({ error: "Dados de pagamento inválidos." }, { status: 400 });
    }

    const pool = getPool();
    const updated = await pool.query(
      `UPDATE orders
       SET status = 'paid', mp_payment_id = $1, updated_at = now()
       WHERE id = $2 AND total_cents = $3 AND status = 'pending_payment'
       RETURNING id`,
      [paymentId, externalReference, amountCents],
    );

    if (updated.rowCount === 0) {
      const existing = await pool.query(
        "SELECT status, mp_payment_id FROM orders WHERE id = $1 AND total_cents = $2",
        [externalReference, amountCents],
      );
      if (existing.rows[0]?.status !== "paid" || existing.rows[0]?.mp_payment_id !== paymentId) {
        console.error("Approved Mercado Pago payment does not match a pending order.", {
          paymentId,
          externalReference,
        });
        return NextResponse.json({ error: "Pedido não encontrado ou divergente." }, { status: 409 });
      }
    }

    const orderResult = await pool.query<{
      customer_name: string;
      customer_email: string;
      total_cents: number;
      email_sent_at: Date | null;
    }>(
      `SELECT customer_name, customer_email, total_cents, email_sent_at
       FROM orders WHERE id = $1`,
      [externalReference],
    );
    const order = orderResult.rows[0];
    if (!order) return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });
    if (order.email_sent_at) return NextResponse.json({ received: true });

    const emailApiKey = process.env.RESEND_API_KEY;
    const emailFrom = process.env.EMAIL_FROM;
    if (!emailApiKey || !emailFrom) {
      console.error("Order confirmation email is not configured.");
      return NextResponse.json({ error: "Email de confirmação não configurado." }, { status: 503 });
    }

    const itemsResult = await pool.query<{
      product_name: string;
      size: string;
      unit_price_cents: number;
      quantity: number;
    }>(
      `SELECT product_name, size, unit_price_cents, quantity
       FROM order_items WHERE order_id = $1 ORDER BY id`,
      [externalReference],
    );
    const itemLines = itemsResult.rows.map(
      (item) =>
        `${item.product_name} (Tam. ${item.size}) x${item.quantity} - R$ ${(
          (item.unit_price_cents * item.quantity) /
          100
        ).toFixed(2)}`,
    );
    const resend = new Resend(emailApiKey);
    const emailResult = await resend.emails.send(
      {
        from: emailFrom,
        to: order.customer_email,
        subject: "Pagamento confirmado - JeansStore",
        text: `Olá, ${order.customer_name}!\n\nSeu pagamento foi confirmado.\n\n${itemLines.join(
          "\n",
        )}\n\nTotal: R$ ${(order.total_cents / 100).toFixed(2)}`,
        html: `<p>Olá, ${escapeHtml(order.customer_name)}!</p>
          <p>Seu pagamento foi confirmado.</p>
          <ul>${itemsResult.rows
            .map(
              (item) =>
                `<li>${escapeHtml(item.product_name)} (Tam. ${escapeHtml(item.size)}) x${
                  item.quantity
                }</li>`,
            )
            .join("")}</ul>
          <p>Total: R$ ${(order.total_cents / 100).toFixed(2)}</p>`,
      },
      { idempotencyKey: `order-confirmation-${externalReference}` },
    );

    if (emailResult.error) {
      console.error("Order confirmation email failed.", emailResult.error);
      return NextResponse.json({ error: "Falha ao enviar confirmação do pedido." }, { status: 503 });
    }

    await pool.query(
      "UPDATE orders SET email_sent_at = now(), updated_at = now() WHERE id = $1 AND email_sent_at IS NULL",
      [externalReference],
    );

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Mercado Pago webhook processing failed.", error);
    return NextResponse.json({ error: "Falha ao processar notificação." }, { status: 500 });
  }
}
