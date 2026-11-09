"use client"

import type React from "react"
import Link from "next/link"
import Image from "next/image"

import { useEffect, useState } from "react"
import { ShoppingCart, User, Search, X } from "lucide-react"
import { signIn, signOut, useSession } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import CheckoutDialog from "@/components/checkout-dialog"
import { z } from "zod"

interface Product {
  id: number
  name: string
  priceCents: number
  image: string
  sizes: string[]
  description: string
}

interface CartItem extends Product {
  quantity: number
  selectedSize: string
}

const productSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  priceCents: z.number().int().nonnegative(),
  image: z.string(),
  sizes: z.array(z.string()),
  description: z.string(),
})
const cartSchema = z.array(
  productSchema.extend({
    quantity: z.number().int().min(1).max(20),
    selectedSize: z.string().min(1),
  }),
)
const productsSchema = z.array(productSchema)

function formatPrice(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100)
}

export default function JeansEcommerce() {
  const [cart, setCart] = useState<CartItem[]>([])
  const [cartReady, setCartReady] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogError, setCatalogError] = useState("")
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [selectedSize, setSelectedSize] = useState("")
  const [showCheckout, setShowCheckout] = useState(false)
  const { toast } = useToast()
  const { data: session, status: sessionStatus } = useSession()

  useEffect(() => {
    const controller = new AbortController()

    fetch("/api/products", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Não foi possível carregar o catálogo.")
        const result = productsSchema.safeParse(await response.json())
        if (!result.success) throw new Error("O servidor retornou um catálogo inválido.")
        return result.data
      })
      .then(setProducts)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return
        setCatalogError("Não foi possível carregar o catálogo. Tente novamente mais tarde.")
        console.error("Catalog request failed.", error)
      })
      .finally(() => setCatalogLoading(false))

    return () => controller.abort()
  }, [])

  useEffect(() => {
    try {
      const savedCart: unknown = JSON.parse(localStorage.getItem("jeans-store-cart-v1") ?? "[]")
      const parsedCart = cartSchema.safeParse(savedCart)
      if (parsedCart.success) setCart(parsedCart.data)
      else if (savedCart !== null) console.error("Saved cart data is invalid and was ignored.")
    } catch (error) {
      console.error("Could not restore the saved cart.", error)
    } finally {
      setCartReady(true)
    }
  }, [])

  useEffect(() => {
    if (!cartReady) return
    try {
      localStorage.setItem("jeans-store-cart-v1", JSON.stringify(cart))
    } catch (error) {
      console.error("Could not persist the cart.", error)
    }
  }, [cart, cartReady])

  const filteredProducts = products.filter((product) => product.name.toLowerCase().includes(searchTerm.toLowerCase()))

  const addToCart = (product: Product, size: string) => {
    if (!size) {
      toast({
        title: "Selecione um tamanho",
        description: "Por favor, escolha um tamanho antes de adicionar ao carrinho.",
        variant: "destructive",
      })
      return
    }

    const existingItem = cart.find((item) => item.id === product.id && item.selectedSize === size)
    if (existingItem && existingItem.quantity >= 20) {
      toast({
        title: "Limite atingido",
        description: "O limite por produto e tamanho é de 20 unidades.",
        variant: "destructive",
      })
      return
    }
    if (!existingItem && cart.length >= 30) {
      toast({
        title: "Carrinho cheio",
        description: "O carrinho suporta até 30 combinações de produto e tamanho.",
        variant: "destructive",
      })
      return
    }

    if (existingItem) {
      setCart(
        cart.map((item) =>
          item.id === product.id && item.selectedSize === size ? { ...item, quantity: item.quantity + 1 } : item,
        ),
      )
    } else {
      setCart([...cart, { ...product, quantity: 1, selectedSize: size }])
    }

    toast({
      title: "Produto adicionado!",
      description: `${product.name} (${size}) foi adicionado ao carrinho.`,
    })
    setSelectedProduct(null)
    setSelectedSize("")
  }

  const removeFromCart = (id: number, size: string) => {
    setCart(cart.filter((item) => !(item.id === id && item.selectedSize === size)))
  }

  const updateQuantity = (id: number, size: string, newQuantity: number) => {
    if (newQuantity > 20) return
    if (newQuantity === 0) {
      removeFromCart(id, size)
      return
    }

    setCart(
      cart.map((item) => (item.id === id && item.selectedSize === size ? { ...item, quantity: newQuantity } : item)),
    )
  }

  const getTotalItems = () => {
    return cart.reduce((total, item) => total + item.quantity, 0)
  }

  const handleLogin = async (email: string, password: string) => {
    try {
      const result = await signIn("credentials", { email, password, redirect: false })
      if (!result || result.error) throw new Error("Email ou senha inválidos.")
      toast({ title: "Login realizado!", description: "Bem-vindo de volta!" })
    } catch (error) {
      toast({
        title: "Não foi possível entrar",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      })
    }
  }

  const handleRegister = async (name: string, email: string, password: string) => {
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      })
      const payload = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível criar a conta.")

      const result = await signIn("credentials", { email, password, redirect: false })
      if (!result || result.error) throw new Error("Conta criada. Entre com seu email e senha.")
      toast({ title: "Cadastro realizado!", description: "Sua conta foi criada com sucesso!" })
    } catch (error) {
      toast({
        title: "Não foi possível cadastrar",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      })
    }
  }

  const handleLogout = async () => {
    await signOut({ redirect: false })
    toast({ title: "Logout realizado", description: "Até logo!" })
  }

  const scrollToProducts = () => {
    const productsSection = document.getElementById("products-section")
    if (productsSection) {
      productsSection.scrollIntoView({ behavior: "smooth" })
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-white sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-blue-600">JeansStore</h1>

          <div className="hidden md:flex items-center space-x-4 flex-1 max-w-md mx-8">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Buscar calças jeans..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {sessionStatus === "loading" ? (
              <span className="text-sm text-gray-500">Carregando conta...</span>
            ) : session?.user ? (
              <div className="flex items-center space-x-2">
                <span className="text-sm">Olá, {session.user.name}</span>
                {session.user.role === "admin" && (
                  <Button asChild size="sm" variant="outline">
                    <Link href="/admin">Admin</Link>
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={handleLogout}>
                  Sair
                </Button>
              </div>
            ) : (
              <LoginDialog onLogin={handleLogin} onRegister={handleRegister} />
            )}

            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="relative">
                  <ShoppingCart className="h-4 w-4" />
                  {getTotalItems() > 0 && (
                    <Badge className="absolute -top-2 -right-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs">
                      {getTotalItems()}
                    </Badge>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Carrinho de Compras</SheetTitle>
                </SheetHeader>
                <CartContent
                  cart={cart}
                  updateQuantity={updateQuantity}
                  removeFromCart={removeFromCart}
                  onCheckout={() => setShowCheckout(true)}
                />
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {/* Mobile Search */}
        <div className="md:hidden px-4 pb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Buscar calças jeans..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-r from-blue-600 to-blue-800 text-white py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-4xl font-bold mb-4">Calças Jeans de Qualidade</h2>
          <p className="text-xl mb-8">Encontre o modelo perfeito para você</p>
          <Button size="lg" variant="secondary" onClick={scrollToProducts}>
            Ver Coleção
          </Button>
        </div>
      </section>

      {/* Products Grid */}
      <section id="products-section" className="container mx-auto px-4 py-12">
        <h3 className="text-2xl font-bold mb-8 text-center">Nossos Produtos</h3>
        {catalogLoading && <p className="text-center text-gray-500">Carregando produtos...</p>}
        {catalogError && (
          <p role="alert" className="mb-6 text-center text-red-600">
            {catalogError}
          </p>
        )}
        {!catalogLoading && !catalogError && filteredProducts.length === 0 && (
          <p className="text-center text-gray-500">
            {products.length === 0 ? "Nenhum produto disponível no momento." : "Nenhum produto encontrado."}
          </p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProducts.map((product) => (
            <Card key={product.id} className="overflow-hidden hover:shadow-lg transition-shadow">
              <div className="relative aspect-[3/4] overflow-hidden">
                <Image
                  src={product.image || "/placeholder.svg"}
                  alt={product.name}
                  fill
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  unoptimized
                  className="w-full h-full object-cover hover:scale-105 transition-transform"
                />
              </div>
              <CardContent className="p-4">
                <h4 className="font-semibold text-lg mb-2">{product.name}</h4>
                <p className="text-gray-600 text-sm mb-3">{product.description}</p>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold text-blue-600">{formatPrice(product.priceCents)}</span>
                  <div className="text-sm text-gray-500">
                    {product.sizes.length > 0 ? `Tamanhos: ${product.sizes.join(", ")}` : "Esgotado"}
                  </div>
                </div>
              </CardContent>
              <CardFooter className="p-4 pt-0">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      className="w-full"
                      disabled={product.sizes.length === 0}
                      onClick={() => setSelectedProduct(product)}
                    >
                      {product.sizes.length > 0 ? "Adicionar ao Carrinho" : "Produto esgotado"}
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{selectedProduct?.name}</DialogTitle>
                    </DialogHeader>
                    {selectedProduct && (
                      <ProductDialog
                        product={selectedProduct}
                        selectedSize={selectedSize}
                        setSelectedSize={setSelectedSize}
                        onAddToCart={addToCart}
                      />
                    )}
                  </DialogContent>
                </Dialog>
              </CardFooter>
            </Card>
          ))}
        </div>
      </section>

      <CheckoutDialog
        isOpen={showCheckout}
        onClose={() => setShowCheckout(false)}
        cart={cart}
      />
    </div>
  )
}

function LoginDialog({
  onLogin,
  onRegister,
}: {
  onLogin: (email: string, password: string) => Promise<void>
  onRegister: (name: string, email: string, password: string) => Promise<void>
}) {
  const [isLogin, setIsLogin] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      if (isLogin) {
        await onLogin(formData.email, formData.password)
      } else {
        await onRegister(formData.name, formData.email, formData.password)
      }
    } finally {
      setIsSubmitting(false)
      setFormData({ name: "", email: "", password: "" })
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <User className="h-4 w-4 mr-2" />
          Entrar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isLogin ? "Fazer Login" : "Criar Conta"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div>
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
          )}
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
            />
          </div>
          <div>
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              minLength={isLogin ? 1 : 12}
              maxLength={72}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Aguarde..." : isLogin ? "Entrar" : "Criar Conta"}
          </Button>
          <Button type="button" variant="link" className="w-full" onClick={() => setIsLogin(!isLogin)}>
          {isLogin ? "Não tem conta? Cadastre-se" : "Já tem conta? Faça login"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ProductDialog({
  product,
  selectedSize,
  setSelectedSize,
  onAddToCart,
}: {
  product: Product
  selectedSize: string
  setSelectedSize: (size: string) => void
  onAddToCart: (product: Product, size: string) => void
}) {
  return (
    <div className="space-y-4">
      <div className="relative h-64 w-full overflow-hidden rounded-lg">
        <Image
          src={product.image || "/placeholder.svg"}
          alt={product.name}
          fill
          sizes="(max-width: 768px) 100vw, 512px"
          unoptimized
          className="object-cover"
        />
      </div>
      <p className="text-gray-600">{product.description}</p>
      <div className="text-2xl font-bold text-blue-600">{formatPrice(product.priceCents)}</div>
      <div>
        <Label className="text-base font-medium">Selecione o tamanho:</Label>
        <div className="flex flex-wrap gap-2 mt-2">
          {product.sizes.map((size) => (
            <Button
              key={size}
              variant={selectedSize === size ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedSize(size)}
            >
              {size}
            </Button>
          ))}
        </div>
      </div>
      <Button className="w-full" onClick={() => onAddToCart(product, selectedSize)} disabled={!selectedSize}>
        Adicionar ao Carrinho
      </Button>
    </div>
  )
}

function CartContent({
  cart,
  updateQuantity,
  removeFromCart,
  onCheckout,
}: {
  cart: CartItem[]
  updateQuantity: (id: number, size: string, quantity: number) => void
  removeFromCart: (id: number, size: string) => void
  onCheckout: () => void
}) {
  if (cart.length === 0) {
    return (
      <div className="text-center py-8">
        <ShoppingCart className="h-12 w-12 mx-auto text-gray-400 mb-4" />
        <p className="text-gray-500">Seu carrinho está vazio</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {cart.map((item) => (
        <div key={`${item.id}-${item.selectedSize}`} className="flex items-center space-x-4 border-b pb-4">
          <Image
            src={item.image || "/placeholder.svg"}
            alt={item.name}
            width={64}
            height={64}
            unoptimized
            className="h-16 w-16 rounded object-cover"
          />
          <div className="flex-1">
            <h4 className="font-medium">{item.name}</h4>
            <p className="text-sm text-gray-500">Tamanho: {item.selectedSize}</p>
            <p className="font-semibold">{formatPrice(item.priceCents)}</p>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => updateQuantity(item.id, item.selectedSize, item.quantity - 1)}
            >
              -
            </Button>
            <span className="w-8 text-center">{item.quantity}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => updateQuantity(item.id, item.selectedSize, item.quantity + 1)}
            >
              +
            </Button>
            <Button size="sm" variant="destructive" onClick={() => removeFromCart(item.id, item.selectedSize)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}

      <div className="border-t pt-4">
        <div className="flex justify-between items-center text-lg font-bold">
          <span>Total:</span>
          <span>{formatPrice(cart.reduce((total, item) => total + item.priceCents * item.quantity, 0))}</span>
        </div>
        <Button className="w-full mt-4" size="lg" onClick={onCheckout}>
          Finalizar Compra
        </Button>
      </div>
    </div>
  )
}
