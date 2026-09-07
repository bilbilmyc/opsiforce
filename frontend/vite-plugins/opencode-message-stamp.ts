import path from "path";
import type { Plugin } from "vite";

import { OC_PACKAGES_ROOT } from "./opencode-packages.ts";

const MESSAGE_CONTENT_MODULE = path.join(OC_PACKAGES_ROOT, "session-ui/src/message/message-content.tsx");
const MESSAGE_STAMP_TIME_ONLY = `new Intl.DateTimeFormat(i18n.locale(), { timeStyle: "short" })`;
const MESSAGE_STAMP_WITH_DATE = `new Intl.DateTimeFormat(i18n.locale(), { dateStyle: "medium", timeStyle: "short" })`;

export function opencodeMessageStamp(): Plugin {
  let bundling = false;
  let stamped = false;

  return {
    name: "opencode-message-stamp",
    enforce: "pre",
    configResolved(config) {
      bundling = config.command === "build";
    },
    transform(code, id) {
      if (id.split("?")[0] !== MESSAGE_CONTENT_MODULE) return null;
      if (!code.includes(MESSAGE_STAMP_TIME_ONLY)) {
        this.warn(`${MESSAGE_CONTENT_MODULE} no longer formats the message stamp with { timeStyle: "short" }`);
        return null;
      }
      stamped = true;
      return { code: code.replace(MESSAGE_STAMP_TIME_ONLY, MESSAGE_STAMP_WITH_DATE), map: null };
    },
    buildEnd(error) {
      if (error || !bundling || stamped) return;
      this.warn(`${MESSAGE_CONTENT_MODULE} was never transformed, message stamps keep the upstream time-only format`);
    },
  };
}
