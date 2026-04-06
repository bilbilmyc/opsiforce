import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import path from "path"

const appPort = parseInt(process.env.APP_PORT || "3000")
const backendPort = 3100

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: appPort,
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
