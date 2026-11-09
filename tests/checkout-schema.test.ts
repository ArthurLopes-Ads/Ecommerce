import { describe, expect, it } from "vitest"
import { checkoutSchema } from "../lib/checkout-schema"

const validCheckout = {
  items: [{ productId: 1, size: "40", quantity: 2 }],
  customer: { name: "Ana Silva", email: "ana@example.com", phone: "11999999999" },
  address: {
    cep: "01001000",
    street: "Praça da Sé",
    number: "1",
    complement: "",
    district: "Sé",
    city: "São Paulo",
    state: "SP",
  },
  shippingMethod: "standard",
  paymentMethod: "pix",
}

describe("checkoutSchema", () => {
  it("accepts a valid order payload", () => {
    expect(checkoutSchema.safeParse(validCheckout).success).toBe(true)
  })

  it("does not accept a client-supplied price as part of the parsed order", () => {
    const parsed = checkoutSchema.parse({
      ...validCheckout,
      items: [{ productId: 1, size: "40", quantity: 2, price: 0.01 }],
    })

    expect(parsed.items[0]).not.toHaveProperty("price")
  })

  it("rejects invalid quantities", () => {
    expect(
      checkoutSchema.safeParse({
        ...validCheckout,
        items: [{ productId: 1, size: "40", quantity: 21 }],
      }).success,
    ).toBe(false)
  })

  it("rejects unsupported shipping and payment methods", () => {
    expect(
      checkoutSchema.safeParse({
        ...validCheckout,
        shippingMethod: "free",
        paymentMethod: "cash",
      }).success,
    ).toBe(false)
  })
})
