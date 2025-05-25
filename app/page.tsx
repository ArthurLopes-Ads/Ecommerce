"use client"

import type React from "react"

import { useState } from "react"
import { ShoppingCart, User, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import CheckoutDialog from "@/components/checkout-dialog"

interface Product {
  id: number
  name: string
  price: number
  image: string
  sizes: string[]
  description: string
}

interface CartItem extends Product {
  quantity: number
  selectedSize: string
}

const products: Product[] = [
  {
    id: 1,
    name: "Calça Jeans Skinny Azul",
    price: 89.9,
    image: "/images/jeans-skinny-azul.png",
    sizes: ["36", "38", "40", "42", "44"],
    description: "Calça jeans skinny de alta qualidade, perfeita para o dia a dia.",
  },
  {
    id: 2,
    name: "Calça Jeans Reta Escura",
    price: 99.9,
    image: "/images/jeans-reta-escura-nova.png",
    sizes: ["36", "38", "40", "42", "44", "46"],
    description: "Calça jeans reta com lavagem escura, ideal para looks mais formais.",
  },
  {
    id: 3,
    name: "Calça Jeans Destroyed",
    price: 79.9,
    image: "/images/jeans-destroyed.png",
    sizes: ["36", "38", "40", "42"],
    description: "Calça jeans com efeito destroyed, para um visual mais despojado.",
  },
  {
    id: 4,
    name: "Calça Jeans Flare",
    price: 109.9,
    image: "/images/jeans-flare.png",
    sizes: ["36", "38", "40", "42", "44"],
    description: "Calça jeans flare, tendência que voltou com tudo.",
  },
  {
    id: 5,
    name: "Calça Jeans Mom",
    price: 94.9,
    image: "/images/jeans-mom.png",
    sizes: ["36", "38", "40", "42", "44"],
    description: "Calça jeans mom, confortável e estilosa.",
  },
  {
    id: 6,
    name: "Calça Jeans Bootcut",
    price: 119.9,
    image: "/images/jeans-bootcut.png",
    sizes: ["36", "38", "40", "42", "44", "46"],
    description: "Calça jeans bootcut, clássica e elegante.",
  },
]

export default function JeansEcommerce() {
  const [cart, setCart] = useState<CartItem[]>([])
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [user, setUser] = useState<{ name: string; email: string } | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [selectedSize, setSelectedSize] = useState("")
  const [showCheckout, setShowCheckout] = useState(false)
  const { toast } = useToast()

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
    if (newQuantity === 0) {
      removeFromCart(id, size)
      return
    }

    setCart(
      cart.map((item) => (item.id === id && item.selectedSize === size ? { ...item, quantity: newQuantity } : item)),
    )
  }

  const getTotalPrice = () => {
    return cart.reduce((total, item) => total + item.price * item.quantity, 0)
  }

  const getTotalItems = () => {
    return cart.reduce((total, item) => total + item.quantity, 0)
  }

  const handleLogin = (email: string, password: string) => {
    // Simulação de login
    setIsLoggedIn(true)
    setUser({ name: "João Silva", email })
    toast({
      title: "Login realizado!",
      description: "Bem-vindo de volta!",
    })
  }

  const handleRegister = (name: string, email: string, password: string) => {
    // Simulação de cadastro
    setIsLoggedIn(true)
    setUser({ name, email })
    toast({
      title: "Cadastro realizado!",
      description: "Sua conta foi criada com sucesso!",
    })
  }

  const handleLogout = () => {
    setIsLoggedIn(false)
    setUser(null)
    setCart([])
    toast({
      title: "Logout realizado",
      description: "Até logo!",
    })
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
            {isLoggedIn ? (
              <div className="flex items-center space-x-2">
                <span className="text-sm">Olá, {user?.name}</span>
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
                  totalPrice={getTotalPrice()}
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProducts.map((product) => (
            <Card key={product.id} className="overflow-hidden hover:shadow-lg transition-shadow">
              <div className="aspect-[3/4] overflow-hidden">
                <img
                  src={product.image || "/placeholder.svg"}
                  alt={product.name}
                  className="w-full h-full object-cover hover:scale-105 transition-transform"
                />
              </div>
              <CardContent className="p-4">
                <h4 className="font-semibold text-lg mb-2">{product.name}</h4>
                <p className="text-gray-600 text-sm mb-3">{product.description}</p>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold text-blue-600">R$ {product.price.toFixed(2)}</span>
                  <div className="text-sm text-gray-500">Tamanhos: {product.sizes.join(", ")}</div>
                </div>
              </CardContent>
              <CardFooter className="p-4 pt-0">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button className="w-full" onClick={() => setSelectedProduct(product)}>
                      Adicionar ao Carrinho
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
        totalPrice={getTotalPrice()}
      />
    </div>
  )
}

function LoginDialog({
  onLogin,
  onRegister,
}: {
  onLogin: (email: string, password: string) => void
  onRegister: (name: string, email: string, password: string) => void
}) {
  const [isLogin, setIsLogin] = useState(true)
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isLogin) {
      onLogin(formData.email, formData.password)
    } else {
      onRegister(formData.name, formData.email, formData.password)
    }
    setFormData({ name: "", email: "", password: "" })
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
              required
            />
          </div>
          <Button type="submit" className="w-full">
            {isLogin ? "Entrar" : "Criar Conta"}
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
      <img
        src={product.image || "/placeholder.svg"}
        alt={product.name}
        className="w-full h-64 object-cover rounded-lg"
      />
      <p className="text-gray-600">{product.description}</p>
      <div className="text-2xl font-bold text-blue-600">R$ {product.price.toFixed(2)}</div>
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
  totalPrice,
  onCheckout,
}: {
  cart: CartItem[]
  updateQuantity: (id: number, size: string, quantity: number) => void
  removeFromCart: (id: number, size: string) => void
  totalPrice: number
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
          <img src={item.image || "/placeholder.svg"} alt={item.name} className="w-16 h-16 object-cover rounded" />
          <div className="flex-1">
            <h4 className="font-medium">{item.name}</h4>
            <p className="text-sm text-gray-500">Tamanho: {item.selectedSize}</p>
            <p className="font-semibold">R$ {item.price.toFixed(2)}</p>
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
          <span>R$ {totalPrice.toFixed(2)}</span>
        </div>
        <Button className="w-full mt-4" size="lg" onClick={onCheckout}>
          Finalizar Compra
        </Button>
      </div>
    </div>
  )
}
