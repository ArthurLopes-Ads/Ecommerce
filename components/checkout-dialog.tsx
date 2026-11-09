"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import { CreditCard, Loader2, MapPin, Truck } from "lucide-react"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { useToast } from "@/hooks/use-toast"

interface CartItem {
  id: number
  name: string
  priceCents: number
  quantity: number
  selectedSize: string
}

interface CheckoutDialogProps {
  isOpen: boolean
  onClose: () => void
  cart: CartItem[]
}

interface ShippingOption {
  id: "economic" | "standard" | "express"
  name: string
  days: string
  priceCents: number
}

interface Address {
  cep: string
  street: string
  complement: string
  district: string
  city: string
  state: string
}

const addressResponseSchema = z.object({
  cep: z.string(),
  logradouro: z.string(),
  complemento: z.string(),
  bairro: z.string(),
  localidade: z.string(),
  uf: z.string(),
  erro: z.boolean().optional(),
})

const shippingOptionsSchema = z.array(
  z.object({
    id: z.enum(["economic", "standard", "express"]),
    name: z.string(),
    days: z.string(),
    priceCents: z.number().int().nonnegative(),
  }),
)

const customerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(8).max(30),
  number: z.string().trim().min(1).max(20),
  complement: z.string().trim().max(120),
})

function formatPrice(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100)
}

function isMercadoPagoUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      url.protocol === "https:" &&
      (url.hostname === "mercadopago.com.br" ||
        url.hostname.endsWith(".mercadopago.com.br") ||
        url.hostname === "mercadopago.com" ||
        url.hostname.endsWith(".mercadopago.com"))
    )
  } catch {
    return false
  }
}

export default function CheckoutDialog({ isOpen, onClose, cart }: CheckoutDialogProps) {
  const [step, setStep] = useState(1)
  const [cep, setCep] = useState("")
  const [address, setAddress] = useState<Address | null>(null)
  const [loadingAddress, setLoadingAddress] = useState(false)
  const [savingOrder, setSavingOrder] = useState(false)
  const [loadingShipping, setLoadingShipping] = useState(false)
  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>([])
  const [shippingError, setShippingError] = useState("")
  const [deliveryOption, setDeliveryOption] = useState<ShippingOption["id"]>("standard")
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "card">("pix")
  const attempt = useRef<{ payload: string; key: string } | null>(null)
  const { toast } = useToast()

  const [customerData, setCustomerData] = useState({
    name: "",
    email: "",
    phone: "",
    number: "",
    complement: "",
  })

  useEffect(() => {
    if (!isOpen) return
    const controller = new AbortController()
    setShippingError("")
    setShippingOptions([])
    setLoadingShipping(true)

    fetch("/api/shipping", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const body: unknown = await response.json()
        if (!response.ok) {
          const message = (body as { error?: string }).error
          throw new Error(message ?? "Frete indisponível.")
        }
        const parsed = shippingOptionsSchema.safeParse(body)
        if (!parsed.success) throw new Error("O servidor retornou opções de frete inválidas.")
        setShippingOptions(parsed.data)
        if (parsed.data.length > 0) setDeliveryOption(parsed.data[0].id)
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return
        setShippingError(error instanceof Error ? error.message : "Não foi possível carregar o frete.")
        console.error("Shipping options request failed.", error)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingShipping(false)
      })

    return () => controller.abort()
  }, [isOpen])

  const fetchAddressByCep = async () => {
    setLoadingAddress(true)
    setShippingError("")

    try {
      const cleanCep = cep.replace(/\D/g, "")
      if (cleanCep.length !== 8) throw new Error("CEP deve ter 8 dígitos.")

      const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`, { cache: "no-store" })
      if (!response.ok) throw new Error("Serviço de CEP indisponível. Tente novamente.")
      const parsed = addressResponseSchema.safeParse(await response.json())
      if (!parsed.success || parsed.data.erro) throw new Error("CEP não encontrado.")

      setAddress({
        cep: cleanCep,
        street: parsed.data.logradouro,
        complement: parsed.data.complemento,
        district: parsed.data.bairro,
        city: parsed.data.localidade,
        state: parsed.data.uf,
      })
      setStep(2)
    } catch (error) {
      toast({
        title: "Erro ao buscar CEP",
        description: error instanceof Error ? error.message : "Não foi possível consultar o CEP.",
        variant: "destructive",
      })
    } finally {
      setLoadingAddress(false)
    }
  }

  const formatCep = (value: string) => {
    const cleanValue = value.replace(/\D/g, "").slice(0, 8)
    return cleanValue.length <= 5 ? cleanValue : `${cleanValue.slice(0, 5)}-${cleanValue.slice(5)}`
  }

  const handleCepChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setCep(formatCep(event.target.value))
  }

  const handleFinishOrder = async () => {
    const customer = customerSchema.safeParse(customerData)
    if (!customer.success || !address || cart.length === 0) {
      toast({
        title: "Confira seus dados",
        description: "Preencha os dados de entrega e contato antes de continuar.",
        variant: "destructive",
      })
      return
    }

    const payload = {
      items: cart.map((item) => ({
        productId: item.id,
        size: item.selectedSize,
        quantity: item.quantity,
      })),
      customer: {
        name: customer.data.name,
        email: customer.data.email,
        phone: customer.data.phone,
      },
      address: {
        ...address,
        number: customer.data.number,
        complement: customer.data.complement || address.complement,
      },
      shippingMethod: deliveryOption,
      paymentMethod,
    }
    const serializedPayload = JSON.stringify(payload)
    if (!attempt.current || attempt.current.payload !== serializedPayload) {
      attempt.current = { payload: serializedPayload, key: crypto.randomUUID() }
    }

    setSavingOrder(true)
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": attempt.current.key,
        },
        body: serializedPayload,
      })
      const body: unknown = await response.json()
      if (!response.ok) {
        const message = typeof body === "object" && body !== null && "error" in body
          ? String(body.error)
          : "Não foi possível iniciar o pagamento."
        throw new Error(message)
      }

      const checkoutUrl =
        typeof body === "object" && body !== null && "checkoutUrl" in body
          ? body.checkoutUrl
          : undefined
      if (typeof checkoutUrl !== "string" || !isMercadoPagoUrl(checkoutUrl)) {
        throw new Error("O serviço de pagamento retornou um endereço inválido.")
      }

      window.location.assign(checkoutUrl)
    } catch (error) {
      toast({
        title: "Não foi possível finalizar a compra",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      })
    } finally {
      setSavingOrder(false)
    }
  }

  const selectedShipping = shippingOptions.find((option) => option.id === deliveryOption)
  const subtotalCents = cart.reduce((total, item) => total + item.priceCents * item.quantity, 0)

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !savingOrder) onClose()
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Finalizar Compra</DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Endereço de Entrega
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="cep">CEP</Label>
                  <div className="flex gap-2">
                    <Input
                      id="cep"
                      inputMode="numeric"
                      autoComplete="postal-code"
                      placeholder="00000-000"
                      value={cep}
                      onChange={handleCepChange}
                      maxLength={9}
                    />
                    <Button onClick={fetchAddressByCep} disabled={loadingAddress || cep.replace(/\D/g, "").length !== 8}>
                      {loadingAddress ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar"}
                    </Button>
                  </div>
                </div>
                {shippingError && <p role="alert" className="text-sm text-red-600">{shippingError}</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Resumo do Pedido</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {cart.map((item) => (
                  <div key={`${item.id}-${item.selectedSize}`} className="flex justify-between text-sm">
                    <span>{item.name} (Tam. {item.selectedSize}) x{item.quantity}</span>
                    <span>{formatPrice(item.priceCents * item.quantity)}</span>
                  </div>
                ))}
                <Separator />
                <div className="flex justify-between font-medium">
                  <span>Subtotal estimado</span>
                  <span>{formatPrice(subtotalCents)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  O valor final será confirmado pelo servidor com os preços atuais do catálogo.
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {step === 2 && address && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Confirmar Endereço</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg bg-green-50 p-4 text-sm">
                  <p>{address.city}/{address.state} - CEP {formatCep(address.cep)}</p>
                </div>

                <div>
                  <Label htmlFor="street">Logradouro</Label>
                  <Input
                    id="street"
                    autoComplete="address-line1"
                    value={address.street}
                    onChange={(event) => setAddress({ ...address, street: event.target.value })}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="district">Bairro</Label>
                    <Input
                      id="district"
                      autoComplete="address-level3"
                      value={address.district}
                      onChange={(event) => setAddress({ ...address, district: event.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="city">Cidade</Label>
                    <Input
                      id="city"
                      autoComplete="address-level2"
                      value={address.city}
                      onChange={(event) => setAddress({ ...address, city: event.target.value })}
                      required
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="state">Estado (UF)</Label>
                  <Input
                    id="state"
                    autoComplete="address-level1"
                    value={address.state}
                    maxLength={2}
                    onChange={(event) => setAddress({ ...address, state: event.target.value.toUpperCase() })}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="number">Número</Label>
                    <Input
                      id="number"
                      autoComplete="address-line2"
                      value={customerData.number}
                      onChange={(event) => setCustomerData({ ...customerData, number: event.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="complement">Complemento</Label>
                    <Input
                      id="complement"
                      autoComplete="address-line3"
                      value={customerData.complement}
                      onChange={(event) => setCustomerData({ ...customerData, complement: event.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="name">Nome Completo</Label>
                  <Input
                    id="name"
                    autoComplete="name"
                    value={customerData.name}
                    onChange={(event) => setCustomerData({ ...customerData, name: event.target.value })}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      value={customerData.email}
                      onChange={(event) => setCustomerData({ ...customerData, email: event.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone">Telefone</Label>
                    <Input
                      id="phone"
                      type="tel"
                      autoComplete="tel"
                      value={customerData.phone}
                      onChange={(event) => setCustomerData({ ...customerData, phone: event.target.value })}
                      required
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Truck className="h-5 w-5" />
                  Opções de Entrega
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {shippingOptions.map((option) => (
                  <label
                    key={option.id}
                    className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 ${
                      deliveryOption === option.id ? "border-blue-500 bg-blue-50" : "border-gray-200"
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="shipping-method"
                        value={option.id}
                        checked={deliveryOption === option.id}
                        onChange={() => setDeliveryOption(option.id)}
                      />
                      <span>
                        <span className="block font-medium">{option.name}</span>
                        <span className="text-sm text-gray-600">{option.days}</span>
                      </span>
                    </span>
                    <span className="font-medium">{formatPrice(option.priceCents)}</span>
                  </label>
                ))}
                {loadingShipping && <p className="text-sm text-muted-foreground">Carregando fretes...</p>}
                {shippingError && <p role="alert" className="text-sm text-red-600">{shippingError}</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Forma de Pagamento
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {([
                  { id: "pix", name: "Pix" },
                  { id: "card", name: "Cartão de crédito" },
                ] as const).map((option) => (
                  <label
                    key={option.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${
                      paymentMethod === option.id ? "border-blue-500 bg-blue-50" : "border-gray-200"
                    }`}
                  >
                    <input
                      type="radio"
                      name="payment-method"
                      value={option.id}
                      checked={paymentMethod === option.id}
                      onChange={() => setPaymentMethod(option.id)}
                    />
                    <span>{option.name} pelo checkout seguro do Mercado Pago</span>
                  </label>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Resumo Final</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Subtotal estimado</span>
                  <span>{formatPrice(subtotalCents)}</span>
                </div>
                {selectedShipping && (
                  <div className="flex justify-between text-sm">
                    <span>Frete ({selectedShipping.days})</span>
                    <span>{formatPrice(selectedShipping.priceCents)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-semibold">
                  <span>Total estimado</span>
                  <span>
                    {selectedShipping
                      ? formatPrice(subtotalCents + selectedShipping.priceCents)
                      : "—"}
                  </span>
                </div>
                <Separator />
                <p className="text-xs text-muted-foreground">
                  O total definitivo será recalculado no servidor antes de gerar o pagamento.
                </p>
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1" disabled={savingOrder}>
                Voltar
              </Button>
              <Button
                onClick={handleFinishOrder}
                className="flex-1"
                disabled={savingOrder || loadingShipping || !selectedShipping || !!shippingError}
              >
                {savingOrder ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Ir para pagamento
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
