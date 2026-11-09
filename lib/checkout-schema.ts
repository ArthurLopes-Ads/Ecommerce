import { z } from "zod";

export const checkoutSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        size: z.string().trim().min(1).max(10),
        quantity: z.number().int().min(1).max(20),
      }),
    )
    .min(1)
    .max(30),
  customer: z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(254),
    phone: z.string().trim().min(8).max(30),
  }),
  address: z.object({
    cep: z.string().regex(/^\d{8}$/),
    street: z.string().trim().min(1).max(160),
    number: z.string().trim().min(1).max(20),
    complement: z.string().trim().max(120),
    district: z.string().trim().min(1).max(120),
    city: z.string().trim().min(1).max(120),
    state: z.string().trim().length(2),
  }),
  shippingMethod: z.enum(["economic", "standard", "express"]),
  paymentMethod: z.enum(["pix", "card"]),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
