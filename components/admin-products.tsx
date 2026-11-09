"use client"

import type React from "react"
import { useCallback, useEffect, useState } from "react"
import { signOut } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface Product {
  id: number
  name: string
  description: string
  priceCents: number
  image: string
  active: boolean
  variants: { size: string; stock: number }[]
}

interface ProductDraft {
  id?: number
  name: string
  description: string
  priceCents: string
  image: string
  active: boolean
  variants: string
}

const emptyDraft: ProductDraft = {
  name: "",
  description: "",
  priceCents: "",
  image: "",
  active: false,
  variants: "",
}

function toDraft(product: Product): ProductDraft {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    priceCents: String(product.priceCents),
    image: product.image,
    active: product.active,
    variants: product.variants.map(({ size, stock }) => `${size}=${stock}`).join(", "),
  }
}

export default function AdminProducts() {
  const [products, setProducts] = useState<Product[]>([])
  const [draft, setDraft] = useState<ProductDraft>(emptyDraft)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")

  const loadProducts = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch("/api/admin/products", { cache: "no-store", signal })
    const body = (await response.json()) as Product[] | { error?: string }
    if (!response.ok || !Array.isArray(body)) {
      throw new Error(!Array.isArray(body) ? body.error ?? "Não foi possível carregar os produtos." : "Resposta inválida.")
    }
    setProducts(body)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    loadProducts(controller.signal)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return
        setMessage(error instanceof Error ? error.message : "Não foi possível carregar os produtos.")
        console.error("Admin catalog request failed.", error)
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [loadProducts])

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setMessage("")

    try {
      const variants = draft.variants.trim()
        ? draft.variants.split(",").map((entry) => {
            const [size, stockText] = entry.split("=").map((part) => part.trim())
            return { size, stock: Number(stockText) }
          })
        : []
      const response = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(draft.id ? { id: draft.id } : {}),
          name: draft.name,
          description: draft.description,
          priceCents: Number(draft.priceCents),
          image: draft.image,
          active: draft.active,
          variants,
        }),
      })
      const body = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(body.error ?? "Não foi possível salvar o produto.")

      await loadProducts()
      setDraft(emptyDraft)
      setMessage("Produto salvo.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar o produto.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="container mx-auto max-w-5xl space-y-8 px-4 py-10">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Administração do catálogo</h1>
          <p className="text-sm text-muted-foreground">Preços são informados em centavos; estoque é controlado por tamanho.</p>
        </div>
        <Button variant="outline" onClick={() => signOut({ callbackUrl: "/" })}>Sair</Button>
      </header>

      <section className="grid gap-8 md:grid-cols-[1fr_2fr]">
        <div className="space-y-2">
          <Button className="w-full" variant="outline" onClick={() => setDraft(emptyDraft)}>Novo produto</Button>
          {loading && <p>Carregando produtos...</p>}
          {products.map((product) => (
            <Button
              key={product.id}
              className="h-auto w-full justify-start py-3 text-left"
              variant={draft.id === product.id ? "default" : "outline"}
              onClick={() => setDraft(toDraft(product))}
            >
              <span>
                <span className="block">{product.name}</span>
                <span className="text-xs opacity-75">{product.active ? "Ativo" : "Inativo"} · ID {product.id}</span>
              </span>
            </Button>
          ))}
        </div>

        <form className="space-y-4 rounded-lg border p-5" onSubmit={handleSave}>
          <h2 className="text-xl font-semibold">{draft.id ? "Editar produto" : "Novo produto"}</h2>
          <div className="space-y-2">
            <Label htmlFor="product-name">Nome</Label>
            <Input id="product-name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="product-description">Descrição</Label>
            <textarea
              id="product-description"
              className="min-h-24 w-full rounded-md border bg-background p-3 text-sm"
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="product-price">Preço em centavos (ex.: 8990 = R$ 89,90)</Label>
            <Input
              id="product-price"
              inputMode="numeric"
              type="number"
              min="0"
              step="1"
              value={draft.priceCents}
              onChange={(event) => setDraft({ ...draft, priceCents: event.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="product-image">Imagem (caminho /images/... ou URL HTTPS)</Label>
            <Input id="product-image" value={draft.image} onChange={(event) => setDraft({ ...draft, image: event.target.value })} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="product-variants">Tamanhos e estoque (ex.: 36=5, 38=2)</Label>
            <Input
              id="product-variants"
              value={draft.variants}
              onChange={(event) => setDraft({ ...draft, variants: event.target.value })}
              placeholder="36=5, 38=2"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} />
            Produto ativo e visível na loja
          </label>
          {message && <p role="status" className="text-sm">{message}</p>}
          <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar produto"}</Button>
        </form>
      </section>
    </main>
  )
}
