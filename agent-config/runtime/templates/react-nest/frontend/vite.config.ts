import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import path from "path"
import { hmrToggle } from "./hmr-toggle"

const appPort = parseInt(process.env.APP_PORT || "3000")
const backendPort = 3100

export default defineConfig({
  plugins: [hmrToggle(), react(), tailwindcss()],
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
      "/api": {
        target: `http://127.0.0.1:${backendPort}`,
        ws: true,
      },
    },
  },
  preview: {
    port: appPort,
    strictPort: true,
    host: "0.0.0.0",
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${backendPort}`,
        ws: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
})
