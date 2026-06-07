// vscode.extensions namespace shim.

import { EventEmitter } from "./event-emitter.js";
import { useExtensionStore } from "../../stores/extensionStore.js";
import { Uri } from "./uri.js";

export const _onDidChangeExtensionsEmitter = new EventEmitter();

export function createExtensionsNamespace() {
  return {
    getExtension(extensionId) {
      const desc = useExtensionStore.getState().getExtension(extensionId);
      if (!desc) return undefined;
      return _wrap(desc);
    },

    get all() {
      return useExtensionStore.getState().extensions.map(_wrap);
    },

    get onDidChange() {
      return _onDidChangeExtensionsEmitter.event;
    },
  };
}

function _wrap(desc) {
  return {
    id: desc.id,
    extensionUri: Uri.file(`/extensions/${desc.id}`),
    extensionPath: `/extensions/${desc.id}`,
    isActive: true,
    packageJSON: desc.manifest ?? {},
    extensionKind: 1,
    exports: desc.api ?? undefined,
    activate() { return Promise.resolve(desc.api ?? undefined); },
  };
}
