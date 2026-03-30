import { render } from "solid-js/web"
import { RouterProvider, createRouter } from "@tanstack/solid-router"
import { routeTree } from "./routeTree.gen"
import "./index.css"

const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  defaultPendingMs: 200,
  scrollRestoration: true,
  search: {
    strict: true,
  },
})

declare module "@tanstack/solid-router" {
  interface Register {
    router: typeof router
  }
}

const root = document.getElementById("root")
if (root) {
  render(() => <RouterProvider router={router} />, root)
}
