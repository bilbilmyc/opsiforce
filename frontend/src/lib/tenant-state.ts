import { createSignal, onCleanup, type Accessor } from "solid-js";
import { useQueryClient } from "@tanstack/solid-query";

export function createTenantState(): [
  Accessor<string>,
  (name: string) => void,
] {
  const queryClient = useQueryClient();
  const [tenant, setTenantSignal] = createSignal(
    localStorage.getItem("tenant") ?? "",
  );

  const handler = (e: StorageEvent) => {
    if (e.key === "tenant") {
      setTenantSignal(e.newValue ?? "");
    }
  };
  window.addEventListener("storage", handler);
  onCleanup(() => window.removeEventListener("storage", handler));

  const setTenant = (name: string) => {
    if (name === tenant()) return;

    queryClient.cancelQueries();
    queryClient.removeQueries();

    localStorage.setItem("tenant", name);
    setTenantSignal(name);
    window.dispatchEvent(
      new StorageEvent("storage", { key: "tenant", newValue: name }),
    );

    queryClient.invalidateQueries();
  };

  return [tenant, setTenant];
}
