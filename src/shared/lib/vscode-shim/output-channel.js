// OutputChannel shim — backed by outputStore.js.
// Extensions call channel.appendLine("...") and we push lines into the store so
// the bottom Output panel can display them.

import { useOutputStore } from "../../stores/outputStore.js";

const store = () => useOutputStore.getState();

export function createOutputChannel(name, languageId) {
  store().ensureChannel(name);

  const channel = {
    name,

    append(value) {
      // Append to the last line without a newline.
      store().addLine(name, value);
    },

    appendLine(value) {
      store().addLine(name, value);
    },

    replace(value) {
      store().clearChannel(name);
      store().addLine(name, value);
    },

    clear() {
      store().clearChannel(name);
    },

    show(preserveFocus) {
      // Switch the bottom panel to the Output tab and select this channel.
      // We import the uiStore lazily to avoid circular dep at module load time.
      import("../../stores/uiStore.js").then(({ useUiStore }) => {
        useUiStore.getState().setBottomTab("output");
      });
      store().setActiveChannel(name);
    },

    hide() {
      // No-op: we don't hide individual channels.
    },

    dispose() {
      store().removeChannel(name);
    },
  };

  return channel;
}
