import { defineConfig, type Plugin } from "vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import solidPlugin from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "fs";

const OC = (pkg: string) =>
  path.resolve(import.meta.dirname, "opencode/packages", pkg, "src");
const OC_APP_SRC = OC("app");
const OC_UI_SRC = OC("ui");
const OC_UTIL_SRC = OC("util");
const OC_SDK_SRC = path.resolve(import.meta.dirname, "opencode/packages/sdk/js/src");

function opencodeResolver(): Plugin {
  const uiExportMap: Array<{ pattern: string; target: string }> = [
    { pattern: "context/*", target: "src/context/*.tsx" },
    { pattern: "context", target: "src/context/index.ts" },
    { pattern: "hooks", target: "src/hooks/index.ts" },
    { pattern: "pierre/*", target: "src/pierre/*.ts" },
    { pattern: "pierre", target: "src/pierre/index.ts" },
    { pattern: "styles", target: "src/styles/index.css" },
    { pattern: "styles/tailwind", target: "src/styles/tailwind/index.css" },
    { pattern: "theme", target: "src/theme/index.ts" },
    { pattern: "theme/*", target: "src/theme/*.ts" },
    { pattern: "theme/context", target: "src/theme/context.tsx" },
    {
      pattern: "icons/provider",
      target: "src/components/provider-icons/types.ts",
    },
    {
      pattern: "icons/file-type",
      target: "src/components/file-icons/types.ts",
    },
    { pattern: "icons/app", target: "src/components/app-icons/types.ts" },
    { pattern: "font-loader", target: "src/font-loader.ts" },
    { pattern: "fonts/*", target: "src/assets/fonts/*" },
    { pattern: "audio/*", target: "src/assets/audio/*" },
    { pattern: "i18n/*", target: "src/i18n/*.ts" },
    { pattern: "*", target: "src/components/*.tsx" },
  ];

  function resolveUiImport(subpath: string): string | null {
    const uiRoot = path.resolve(import.meta.dirname, "opencode/packages/ui");

    for (const { pattern, target } of uiExportMap) {
      if (pattern === "*") continue;

      if (pattern.includes("*")) {
        const prefix = pattern.replace("*", "");
        if (subpath.startsWith(prefix)) {
          const rest = subpath.slice(prefix.length);
          const resolved = path.join(uiRoot, target.replace("*", rest));
          if (fs.existsSync(resolved)) return resolved;
        }
      } else if (subpath === pattern) {
        const resolved = path.join(uiRoot, target);
        if (fs.existsSync(resolved)) return resolved;
      }
    }

    const catchAll = path.join(uiRoot, "src/components", subpath + ".tsx");
    if (fs.existsSync(catchAll)) return catchAll;

    const catchAllTs = path.join(uiRoot, "src/components", subpath + ".ts");
    if (fs.existsSync(catchAllTs)) return catchAllTs;

    const catchAllIndex = path.join(
      uiRoot,
      "src/components",
      subpath,
      "index.tsx",
    );
    if (fs.existsSync(catchAllIndex)) return catchAllIndex;

    return null;
  }

  return {
    name: "opencode-resolver",
    enforce: "pre",
    resolveId(source) {
      if (source.startsWith("@opencode-ai/ui/")) {
        const subpath = source.slice("@opencode-ai/ui/".length);
        const resolved = resolveUiImport(subpath);
        if (resolved) return resolved;
      }

      if (source.startsWith("@opencode-ai/util/")) {
        const subpath = source.slice("@opencode-ai/util/".length);
        const tsFile = path.join(OC_UTIL_SRC, subpath + ".ts");
        if (fs.existsSync(tsFile)) return tsFile;
        const tsxFile = path.join(OC_UTIL_SRC, subpath + ".tsx");
        if (fs.existsSync(tsxFile)) return tsxFile;
        const indexFile = path.join(OC_UTIL_SRC, subpath, "index.ts");
        if (fs.existsSync(indexFile)) return indexFile;
      }

      if (source === "@opencode-ai/sdk") {
        return path.join(OC_SDK_SRC, "index.ts");
      }
      if (source.startsWith("@opencode-ai/sdk/")) {
        const subpath = source.slice("@opencode-ai/sdk/".length);
        const tsFile = path.join(OC_SDK_SRC, subpath + ".ts");
        if (fs.existsSync(tsFile)) return tsFile;
        const indexFile = path.join(OC_SDK_SRC, subpath, "index.ts");
        if (fs.existsSync(indexFile)) return indexFile;
      }

      if (source.startsWith("@opencode-ai/app/")) {
        const subpath = source.slice("@opencode-ai/app/".length);
        const tsxFile = path.join(OC_APP_SRC, subpath + ".tsx");
        if (fs.existsSync(tsxFile)) return tsxFile;
        const tsFile = path.join(OC_APP_SRC, subpath + ".ts");
        if (fs.existsSync(tsFile)) return tsFile;
        const indexFile = path.join(OC_APP_SRC, subpath, "index.ts");
        if (fs.existsSync(indexFile)) return indexFile;
        const indexTsxFile = path.join(OC_APP_SRC, subpath, "index.tsx");
        if (fs.existsSync(indexTsxFile)) return indexTsxFile;
      }

      return null;
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [
    opencodeResolver(),
    tanstackRouter({
      target: "solid",
      autoCodeSplitting: mode !== "production",
    }),
    solidPlugin(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@/": OC_APP_SRC + "/",
      "~/": path.resolve(import.meta.dirname, "src") + "/",
      "@opencode-ai/ui/styles/tailwind": path.resolve(
        import.meta.dirname,
        "opencode/packages/ui/src/styles/tailwind/index.css",
      ),
      "@opencode-ai/ui/styles": path.resolve(
        import.meta.dirname,
        "opencode/packages/ui/src/styles/index.css",
      ),
    },
  },
  server: {
    port: 8084,
    allowedHosts: ["host.minikube.internal", ".opsiforce.localtest.me"],
    proxy: {
      "/api": {
        target: "http://localhost:3010",
        changeOrigin: true,
        ws: true,
      },
      "/ms-api": {
        target: process.env.VITE_USER_MS_URL || "http://localhost:4112",
        changeOrigin: true,
      },
      "/ms-assets": {
        target: process.env.VITE_USER_MS_URL || "http://localhost:4112",
        changeOrigin: true,
        ws: true,
      },
    },
  },
  worker: {
    format: "es",
  },
  build: {
    target: "esnext",
    outDir: "dist",
    emptyOutDir: true,
  },
}));
