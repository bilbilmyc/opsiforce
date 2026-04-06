import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Zap, Database, Layout, ArrowRight } from "lucide-react"

interface Item {
  id: number
  title: string
  description: string | null
  status: string
  created_at: string
}

export default function Home() {
  const { data: items = [] } = useQuery<Item[]>({
    queryKey: ["items"],
    queryFn: () => fetch("/api/items").then((r) => r.json()),
  })

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-6 py-16">
        <div className="mb-12 text-center">
          <Badge variant="secondary" className="mb-4">
            Ready to build
          </Badge>
          <h1 className="mb-3 text-4xl font-bold tracking-tight text-foreground">
            Your App
          </h1>
          <p className="text-lg text-muted-foreground">
            A modern web application built with React, Tailwind, and NestJS.
          </p>
        </div>

        <div className="mb-12 grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <Layout className="h-8 w-8 text-primary" />
              <CardTitle>React + shadcn/ui</CardTitle>
              <CardDescription>
                Beautiful UI components with Tailwind CSS
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <Zap className="h-8 w-8 text-primary" />
              <CardTitle>NestJS Backend</CardTitle>
              <CardDescription>
                Structured API with controllers and services
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <Database className="h-8 w-8 text-primary" />
              <CardTitle>SQLite Database</CardTitle>
              <CardDescription>
                Lightweight persistence with migrations
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sample Items</CardTitle>
            <CardDescription>
              Data from the API — {items.length} items loaded
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div>
                    <p className="font-medium">{item.title}</p>
                    {item.description && (
                      <p className="text-sm text-muted-foreground">
                        {item.description}
                      </p>
                    )}
                  </div>
                  <Badge variant="outline">{item.status}</Badge>
                </div>
              ))}
              {items.length === 0 && (
                <p className="py-8 text-center text-muted-foreground">
                  No items yet. The agent will build your app here.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="mt-8 text-center">
          <Button variant="outline" size="lg" disabled>
            Tell the agent what to build
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
