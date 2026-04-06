import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import path from "path"

const backendPort = process.env.BACKEND_PORT || "3100"
const frontendPort = parseInt(process.env.FRONTEND_PORT || "3101")
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: frontendPort,
    strictPort: true,
    host: "0.0.0.0",
    proxy: {
      "/api": `http://localhost:${backendPort}`,
    },
  },
  build: {
    outDir: "dist",
  },
})
