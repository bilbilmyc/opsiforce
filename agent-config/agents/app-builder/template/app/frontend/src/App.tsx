import { BrowserRouter, Routes, Route, NavLink, Outlet } from "react-router-dom"
import { Toaster } from "sonner"
import { cn } from "./lib/utils"
import Home from "./pages/home"

function Layout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="sticky top-0 z-50 border-b bg-background px-6 py-3 flex items-center gap-4">
        <NavLink
          to="/"
          className={({ isActive }) =>
            cn("text-sm font-medium", isActive ? "text-primary" : "text-muted-foreground hover:text-foreground")
          }
        >
          Home
        </NavLink>
      </nav>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
      <Toaster />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <h1 className="text-4xl font-bold mb-2">404</h1>
      <p className="text-muted-foreground">Page not found</p>
    </div>
  )
}
