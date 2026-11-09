import { NextResponse } from "next/server";
import { getShippingPrices, shippingOptions } from "@/lib/shipping";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const prices = getShippingPrices();

    return NextResponse.json(
      Object.entries(shippingOptions).map(([id, option]) => ({
        id,
        name: option.name,
        days: option.days,
        priceCents: prices[id as keyof typeof prices],
      })),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Shipping configuration is invalid.", error);
    return NextResponse.json({ error: "Opções de frete indisponíveis." }, { status: 503 });
  }
}
