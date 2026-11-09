import { afterEach, describe, expect, it } from "vitest"
import { getShippingPrices } from "../lib/shipping"

const originalValues = {
  economic: process.env.SHIPPING_ECONOMIC_CENTS,
  standard: process.env.SHIPPING_STANDARD_CENTS,
  express: process.env.SHIPPING_EXPRESS_CENTS,
}

afterEach(() => {
  if (originalValues.economic === undefined) delete process.env.SHIPPING_ECONOMIC_CENTS
  else process.env.SHIPPING_ECONOMIC_CENTS = originalValues.economic

  if (originalValues.standard === undefined) delete process.env.SHIPPING_STANDARD_CENTS
  else process.env.SHIPPING_STANDARD_CENTS = originalValues.standard

  if (originalValues.express === undefined) delete process.env.SHIPPING_EXPRESS_CENTS
  else process.env.SHIPPING_EXPRESS_CENTS = originalValues.express
})

describe("getShippingPrices", () => {
  it("reads integer BRL cents from server configuration", () => {
    process.env.SHIPPING_ECONOMIC_CENTS = "800"
    process.env.SHIPPING_STANDARD_CENTS = "1500"
    process.env.SHIPPING_EXPRESS_CENTS = "2500"

    expect(getShippingPrices()).toEqual({ economic: 800, standard: 1500, express: 2500 })
  })

  it("fails explicitly for missing or non-integer prices", () => {
    delete process.env.SHIPPING_ECONOMIC_CENTS
    process.env.SHIPPING_STANDARD_CENTS = "15.00"
    process.env.SHIPPING_EXPRESS_CENTS = "-1"

    expect(() => getShippingPrices()).toThrow("SHIPPING_ECONOMIC_CENTS")
  })
})
