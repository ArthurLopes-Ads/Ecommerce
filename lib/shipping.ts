export const shippingOptions = {
  economic: { name: "Econômica", days: "7-10 dias úteis", envKey: "SHIPPING_ECONOMIC_CENTS" },
  standard: { name: "Padrão", days: "3-5 dias úteis", envKey: "SHIPPING_STANDARD_CENTS" },
  express: { name: "Expressa", days: "1-2 dias úteis", envKey: "SHIPPING_EXPRESS_CENTS" },
} as const;

export type ShippingMethod = keyof typeof shippingOptions;

export function getShippingPrices(): Record<ShippingMethod, number> {
  return Object.fromEntries(
    Object.entries(shippingOptions).map(([method, option]) => {
      const rawPrice = process.env[option.envKey];
      const price = rawPrice === undefined ? Number.NaN : Number(rawPrice);

      if (!Number.isSafeInteger(price) || price < 0) {
        throw new Error(`${option.envKey} must be a non-negative integer in cents.`);
      }

      return [method, price];
    }),
  ) as Record<ShippingMethod, number>;
}
