import { For } from "solid-js";
import type { ProjectAuthOidcConfig } from "~/api/client";
import { FieldWithTooltip, TextInput } from "./field-with-tooltip";

type FieldKey = keyof ProjectAuthOidcConfig;
type InputType = "text" | "password" | "url";

interface FieldDef {
  key: Exclude<FieldKey, "assertClaims">;
  label: string;
  tooltip: string;
  required?: boolean;
  type?: InputType;
  placeholder?: string;
  column: "left" | "right";
}

const FIELDS: FieldDef[] = [
  {
    key: "clientId",
    label: "Client Id",
    tooltip: "The OAuth client ID provided by your identity provider",
    required: true,
    placeholder: "Enter client id",
    column: "left",
  },
  {
    key: "clientSecret",
    label: "Client Secret",
    tooltip:
      "The OAuth client secret provided by your identity provider (keep this confidential)",
    type: "password",
    placeholder: "Enter client secret",
    column: "right",
  },
  {
    key: "discoveryUrl",
    label: "Discovery Url",
    tooltip: "OIDC discovery endpoint URL (if supported by your provider)",
    type: "url",
    placeholder: "Enter discovery url",
    column: "left",
  },
  {
    key: "scope",
    label: "Scope",
    tooltip: "OAuth scopes (openid, email, profile are commonly used)",
    placeholder: "openid email profile",
    column: "right",
  },
];

export interface OidcFormProps {
  value: ProjectAuthOidcConfig;
  onChange: (next: ProjectAuthOidcConfig) => void;
  disabled?: boolean;
  secretAlreadySet?: boolean;
}

export function OidcForm(props: OidcFormProps) {
  const left = FIELDS.filter((f) => f.column === "left");
  const right = FIELDS.filter((f) => f.column === "right");

  const fieldValue = (key: FieldDef["key"]) =>
    (props.value[key] as string | undefined) ?? "";
  const setField = (key: FieldDef["key"], v: string) =>
    props.onChange({ ...props.value, [key]: v });

  const placeholderFor = (f: FieldDef): string | undefined => {
    if (f.key === "clientSecret" && props.secretAlreadySet) {
      return "Leave blank to keep current";
    }
    return f.placeholder;
  };

  const renderField = (f: FieldDef) => (
    <FieldWithTooltip label={f.label} tooltip={f.tooltip} required={f.required}>
      <TextInput
        value={fieldValue(f.key)}
        onInput={(v) => setField(f.key, v)}
        placeholder={placeholderFor(f)}
        type={f.type ?? "text"}
        disabled={props.disabled}
      />
    </FieldWithTooltip>
  );

  return (
    <form
      class="grid grid-cols-2 gap-x-3 gap-y-3"
      autocomplete="off"
      onSubmit={(e) => e.preventDefault()}
    >
      <div class="space-y-3">
        <For each={left}>{renderField}</For>
      </div>
      <div class="space-y-3">
        <For each={right}>{renderField}</For>
      </div>
    </form>
  );
}
