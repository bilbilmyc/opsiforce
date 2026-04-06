---
name: auth-patterns
description: Implement authentication patterns — login/register forms, protected routes, session management, password hashing. Use when the app needs user accounts, login pages, sign-up flows, or access control. Uses jose (JWT) and bcryptjs (pre-installed).
---

# Auth Patterns

`jose` (JWT) and `bcryptjs` (password hashing) are pre-installed. No need to `bun add`.

## Database: users table migration

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX idx_users_email ON users(email);
```

## Backend: auth module

### auth.service.ts

```typescript
import { Injectable, UnauthorizedException, ConflictException } from "@nestjs/common"
import { DatabaseService } from "../database/database.service"
import { hash, compare } from "bcryptjs"
import { SignJWT, jwtVerify } from "jose"

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "dev-secret-change-in-production")

interface User { id: number; email: string; password_hash: string; name: string; role: string }

@Injectable()
export class AuthService {
  constructor(private readonly db: DatabaseService) {}

  async register(email: string, password: string, name: string) {
    const existing = this.db.queryOne("SELECT id FROM users WHERE email = ?", [email])
    if (existing) throw new ConflictException("Email already registered")

    const password_hash = await hash(password, 10)
    const result = this.db.run(
      "INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)",
      [email, password_hash, name]
    )
    const user = this.db.queryOne<User>("SELECT * FROM users WHERE id = ?", [result.lastInsertRowid])!
    return { user: { id: user.id, email: user.email, name: user.name, role: user.role }, token: await this.createToken(user) }
  }

  async login(email: string, password: string) {
    const user = this.db.queryOne<User>("SELECT * FROM users WHERE email = ?", [email])
    if (!user) throw new UnauthorizedException("Invalid credentials")

    const valid = await compare(password, user.password_hash)
    if (!valid) throw new UnauthorizedException("Invalid credentials")

    return { user: { id: user.id, email: user.email, name: user.name, role: user.role }, token: await this.createToken(user) }
  }

  async verifyToken(token: string) {
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET)
      return payload as { sub: number; email: string; role: string }
    } catch {
      throw new UnauthorizedException("Invalid token")
    }
  }

  private async createToken(user: User) {
    return new SignJWT({ sub: user.id, email: user.email, role: user.role })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .sign(JWT_SECRET)
  }
}
```

### auth.controller.ts

```typescript
import { Controller, Post, Body, BadRequestException } from "@nestjs/common"
import { AuthService } from "./auth.service"

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  async register(@Body() body: { email: string; password: string; name: string }) {
    if (!body.email || !body.password || !body.name) throw new BadRequestException("All fields required")
    return this.authService.register(body.email, body.password, body.name)
  }

  @Post("login")
  async login(@Body() body: { email: string; password: string }) {
    if (!body.email || !body.password) throw new BadRequestException("Email and password required")
    return this.authService.login(body.email, body.password)
  }
}
```

**CRITICAL:** Register `AuthModule` in `app.module.ts` imports.

## Frontend: auth store (Zustand)

```tsx
import { create } from "zustand"

interface AuthUser { id: number; email: string; name: string; role: string }

interface AuthStore {
  user: AuthUser | null
  token: string | null
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string) => Promise<void>
  logout: () => void
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: JSON.parse(localStorage.getItem("user") || "null"),
  token: localStorage.getItem("token"),

  login: async (email, password) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
    if (!res.ok) { const err = await res.json(); throw new Error(err.message || "Login failed") }
    const { user, token } = await res.json()
    localStorage.setItem("user", JSON.stringify(user))
    localStorage.setItem("token", token)
    set({ user, token })
  },

  register: async (email, password, name) => {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    })
    if (!res.ok) { const err = await res.json(); throw new Error(err.message || "Registration failed") }
    const { user, token } = await res.json()
    localStorage.setItem("user", JSON.stringify(user))
    localStorage.setItem("token", token)
    set({ user, token })
  },

  logout: () => {
    localStorage.removeItem("user")
    localStorage.removeItem("token")
    set({ user: null, token: null })
  },
}))
```

**Note:** This is the one exception to "no localStorage" — auth tokens need to persist across page reloads.

## Frontend: protected route

```tsx
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

// In routes
<Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
```

## Frontend: login page

```tsx
function LoginPage() {
  const { login } = useAuthStore()
  const navigate = useNavigate()
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(z.object({
      email: z.string().email(),
      password: z.string().min(6, "Min 6 characters"),
    })),
  })

  const loginMutation = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) => login(email, password),
    onSuccess: () => navigate("/dashboard"),
    onError: (err) => toast.error(err.message),
  })

  return (
    <div className="flex items-center justify-center min-h-screen">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Login</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit((data) => loginMutation.mutate(data))} className="space-y-4">
            <div>
              <Input {...register("email")} type="email" placeholder="Email" />
              {errors.email && <p className="text-sm text-destructive mt-1">{errors.email.message}</p>}
            </div>
            <div>
              <Input {...register("password")} type="password" placeholder="Password" />
              {errors.password && <p className="text-sm text-destructive mt-1">{errors.password.message}</p>}
            </div>
            <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
              {loginMutation.isPending ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
```

## Include token in API requests

```tsx
function authFetch(url: string, options?: RequestInit) {
  const token = useAuthStore.getState().token
  return fetch(url, {
    ...options,
    headers: { ...options?.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  })
}
```

## Common mistakes

1. **Forgetting to register AuthModule** in `app.module.ts` — routes won't work.
2. **Storing plain-text passwords** — always use `bcryptjs.hash()` with salt rounds (10).
3. **Not handling 401 on frontend** — if token expires, catch 401 and redirect to login.
