"use client"

import type React from "react"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { MapPin, Truck, CreditCard, Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface CartItem {
  id: number
  name: string
  price: number
  image: string
  quantity: number
  selectedSize: string
}

interface CheckoutDialogProps {
  isOpen: boolean
  onClose: () => void
  cart: CartItem[]
  totalPrice: number
}

interface Address {
  cep: string
  logradouro: string
  complemento: string
  bairro: string
  localidade: string
  uf: string
  erro?: boolean
}

interface FakeStoreUser {
  id: number
  email: string
  username: string
  password: string
  name: {
    firstname: string
    lastname: string
  }
  address: {
    city: string
    street: string
    number: number
    zipcode: string
    geolocation: {
      lat: string
      long: string
    }
  }
  phone: string
}

export default function CheckoutDialog({ isOpen, onClose, cart, totalPrice }: CheckoutDialogProps) {
  const [step, setStep] = useState(1)
  const [cep, setCep] = useState("")
  const [address, setAddress] = useState<Address | null>(null)
  const [loading, setLoading] = useState(false)
  const [fakeStoreData, setFakeStoreData] = useState<FakeStoreUser | null>(null)
  const [deliveryOption, setDeliveryOption] = useState("standard")
  const [paymentMethod, setPaymentMethod] = useState("credit")
  const { toast } = useToast()

  const [customerData, setCustomerData] = useState({
    name: "",
    email: "",
    phone: "",
    number: "",
    complement: "",
  })

  const fetchAddressByCep = async (cepValue: string) => {
    setLoading(true)
    try {
      const cleanCep = cepValue.replace(/\D/g, "")

      if (cleanCep.length !== 8) {
        throw new Error("CEP deve ter 8 dígitos")
      }

      // Consulta ViaCEP para endereço brasileiro
      const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`)
      const data = await response.json()

      if (data.erro) {
        throw new Error("CEP não encontrado")
      }

      setAddress(data)

      // Simular busca de dados do usuário na Fake Store API
      const fakeStoreResponse = await fetch("https://fakestoreapi.com/users/1")
      const userData = await fakeStoreResponse.json()
      setFakeStoreData(userData)

      toast({
        title: "Endereço encontrado!",
        description: `${data.logradouro}, ${data.bairro} - ${data.localidade}/${data.uf}`,
      })

      setStep(2)
    } catch (error) {
      toast({
        title: "Erro ao buscar CEP",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const formatCep = (value: string) => {
    const cleanValue = value.replace(/\D/g, "")
    if (cleanValue.length <= 5) {
      return cleanValue
    }
    return `${cleanValue.slice(0, 5)}-${cleanValue.slice(5, 8)}`
  }

  const handleCepChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCep(e.target.value)
    setCep(formatted)
  }

  const getDeliveryPrice = () => {
    switch (deliveryOption) {
      case "express":
        return 25.0
      case "standard":
        return 15.0
      case "economic":
        return 8.0
      default:
        return 15.0
    }
  }

  const getDeliveryTime = () => {
    switch (deliveryOption) {
      case "express":
        return "1-2 dias úteis"
      case "standard":
        return "3-5 dias úteis"
      case "economic":
        return "7-10 dias úteis"
      default:
        return "3-5 dias úteis"
    }
  }

  const finalTotal = totalPrice + getDeliveryPrice()

  const handleFinishOrder = () => {
    toast({
      title: "Pedido realizado com sucesso!",
      description: `Seu pedido será entregue em ${getDeliveryTime()}`,
    })
    onClose()
    setStep(1)
    setCep("")
    setAddress(null)
    setCustomerData({
      name: "",
      email: "",
      phone: "",
      number: "",
      complement: "",
    })
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
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
                    <Input id="cep" placeholder="00000-000" value={cep} onChange={handleCepChange} maxLength={9} />
                    <Button onClick={() => fetchAddressByCep(cep)} disabled={loading || cep.length < 9}>
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar"}
                    </Button>
                  </div>
                </div>

                {fakeStoreData && (
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <h4 className="font-medium text-blue-900 mb-2">Dados do Cliente (Fake Store API)</h4>
                    <p className="text-sm text-blue-700">
                      <strong>Nome:</strong> {fakeStoreData.name.firstname} {fakeStoreData.name.lastname}
                    </p>
                    <p className="text-sm text-blue-700">
                      <strong>Email:</strong> {fakeStoreData.email}
                    </p>
                    <p className="text-sm text-blue-700">
                      <strong>Telefone:</strong> {fakeStoreData.phone}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Resumo do Pedido</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {cart.map((item) => (
                    <div key={`${item.id}-${item.selectedSize}`} className="flex justify-between text-sm">
                      <span>
                        {item.name} (Tam. {item.selectedSize}) x{item.quantity}
                      </span>
                      <span>R$ {(item.price * item.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                  <Separator />
                  <div className="flex justify-between font-medium">
                    <span>Subtotal</span>
                    <span>R$ {totalPrice.toFixed(2)}</span>
                  </div>
                </div>
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
                <div className="p-4 bg-green-50 rounded-lg">
                  <p className="font-medium">{address.logradouro}</p>
                  <p>
                    {address.bairro} - {address.localidade}/{address.uf}
                  </p>
                  <p>CEP: {address.cep}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="number">Número</Label>
                    <Input
                      id="number"
                      value={customerData.number}
                      onChange={(e) => setCustomerData({ ...customerData, number: e.target.value })}
                      placeholder="123"
                    />
                  </div>
                  <div>
                    <Label htmlFor="complement">Complemento</Label>
                    <Input
                      id="complement"
                      value={customerData.complement}
                      onChange={(e) => setCustomerData({ ...customerData, complement: e.target.value })}
                      placeholder="Apto 45"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="name">Nome Completo</Label>
                  <Input
                    id="name"
                    value={customerData.name}
                    onChange={(e) => setCustomerData({ ...customerData, name: e.target.value })}
                    placeholder="Seu nome completo"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={customerData.email}
                      onChange={(e) => setCustomerData({ ...customerData, email: e.target.value })}
                      placeholder="seu@email.com"
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone">Telefone</Label>
                    <Input
                      id="phone"
                      value={customerData.phone}
                      onChange={(e) => setCustomerData({ ...customerData, phone: e.target.value })}
                      placeholder="(11) 99999-9999"
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
                {[
                  { id: "economic", name: "Econômica", price: 8.0, time: "7-10 dias úteis" },
                  { id: "standard", name: "Padrão", price: 15.0, time: "3-5 dias úteis" },
                  { id: "express", name: "Expressa", price: 25.0, time: "1-2 dias úteis" },
                ].map((option) => (
                  <div
                    key={option.id}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                      deliveryOption === option.id ? "border-blue-500 bg-blue-50" : "border-gray-200"
                    }`}
                    onClick={() => setDeliveryOption(option.id)}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-medium">{option.name}</p>
                        <p className="text-sm text-gray-600">{option.time}</p>
                      </div>
                      <p className="font-medium">R$ {option.price.toFixed(2)}</p>
                    </div>
                  </div>
                ))}
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
                {[
                  { id: "credit", name: "Cartão de Crédito", desc: "Visa, Mastercard, Elo" },
                  { id: "debit", name: "Cartão de Débito", desc: "Débito à vista" },
                  { id: "pix", name: "PIX", desc: "Pagamento instantâneo" },
                ].map((option) => (
                  <div
                    key={option.id}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                      paymentMethod === option.id ? "border-blue-500 bg-blue-50" : "border-gray-200"
                    }`}
                    onClick={() => setPaymentMethod(option.id)}
                  >
                    <p className="font-medium">{option.name}</p>
                    <p className="text-sm text-gray-600">{option.desc}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Resumo Final</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Subtotal dos produtos</span>
                    <span>R$ {totalPrice.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Frete ({getDeliveryTime()})</span>
                    <span>R$ {getDeliveryPrice().toFixed(2)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-bold text-lg">
                    <span>Total</span>
                    <span>R$ {finalTotal.toFixed(2)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                Voltar
              </Button>
              <Button onClick={handleFinishOrder} className="flex-1">
                Finalizar Pedido
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
