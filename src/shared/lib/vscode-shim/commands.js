// vscode.commands namespace shim.

import { Disposable } from "./event-emitter.js";
import { COMMANDS, registerCommand as shellRegisterCommand, runCommand } from "../../../shell/commands.js";
import { useExtensionStore } from "../../stores/extensionStore.js";

export function createCommandsNamespace() {
  return {
    registerCommand(id, handler, thisArg) {
      const fn = thisArg ? handler.bind(thisArg) : handler;
      // Register in the shell palette.
      const d = shellRegisterCommand(id, fn);
      return d;
    },

    registerTextEditorCommand(id, callback, thisArg) {
      return this.registerCommand(id, (...args) => callback.call(thisArg, undefined, ...args));
    },

    executeCommand(id, ...args) {
      // Try shell COMMANDS first.
      const found = runCommand(id);
      if (found) return Promise.resolve(undefined);

      // Try extension-contributed commands.
      const handler = useExtensionStore.getState().extCommands[id];
      if (handler) return Promise.resolve(handler(...args));

      return _handleBuiltinCommand(id, ...args);
    },

    async getCommands() {
      return COMMANDS.map((c) => c.id);
    },
  };
}

function _handleBuiltinCommand(id) {
  switch (id) {
    case "workbench.action.closeActiveEditor": {
      import("../../stores/tabStore.js").then(({ useTabStore }) => {
        const active = useTabStore.getState().activeTab();
        if (active) useTabStore.getState().closeTab(active.id);
      });
      break;
    }
    case "workbench.action.showCommands": {
      import("../../stores/uiStore.js").then(({ useUiStore }) => {
        useUiStore.getState().openPalette();
      });
      break;
    }
  }
  return Promise.resolve(undefined);
}
