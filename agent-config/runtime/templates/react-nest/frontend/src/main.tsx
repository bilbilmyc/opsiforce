import { StrictMode, useEffect } from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query"
import App from "./App"
import "./index.css"

const queryClient = new QueryClient()

function AppTitleSync() {
  const { data } = useQuery({
    queryKey: ["app-meta"],
    queryFn: () => fetch("/api/app-meta").then((res) => res.json()),
  })

  useEffect(() => {
    if (data?.exists && data.name) document.title = data.name
  }, [data])

  return null
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppTitleSync />
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
