import type { Plugin } from "vite"

const hmrToggleScript = `
(function () {
  var storageKey = "opsiforce.hmr"
  var hmrOff = false
  try { hmrOff = localStorage.getItem(storageKey) === "off" } catch (e) {}

  if (hmrOff) {
    var NativeWebSocket = window.WebSocket
    var inertSocket = {
      readyState: 0, CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3,
      addEventListener: function () {}, removeEventListener: function () {},
      send: function () {}, close: function () {},
    }
    window.WebSocket = new Proxy(NativeWebSocket, {
      construct: function (target, args) {
        return args[1] === "vite-hmr" ? inertSocket : Reflect.construct(target, args)
      },
    })
  }

  window.addEventListener("keydown", function (event) {
    var isU = event.code === "KeyU" || (event.key || "").toLowerCase() === "u"
    if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || !isU) return
    event.preventDefault()
    try {
      if (hmrOff) localStorage.removeItem(storageKey)
      else localStorage.setItem(storageKey, "off")
    } catch (e) {}
    location.reload()
  }, true)
})()
`

export function hmrToggle(): Plugin {
  return {
    name: "opsiforce-hmr-toggle",
    apply: "serve",
    transformIndexHtml: () => [{ tag: "script", children: hmrToggleScript, injectTo: "head-prepend" }],
  }
}
