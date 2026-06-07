// ExtensionContext factory — provides the context object passed to extension.activate().

import { Disposable } from "./event-emitter.js";
import { Uri } from "./uri.js";

function makeMementoAdapter(map) {
  return {
    get(key, defaultValue) { return map.has(key) ? map.get(key) : defaultValue; },
    update(key, value) { map.set(key, value); return Promise.resolve(); },
    keys() { return [...map.keys()]; },
    // VS Code 1.68+
    setKeysForSync(keys) {},
  };
}

function makeSecretsAdapter(extensionId) {
  const _store = new Map();
  return {
    get(key) { return Promise.resolve(_store.get(key)); },
    store(key, value) { _store.set(key, value); return Promise.resolve(); },
    delete(key) { _store.delete(key); return Promise.resolve(); },
    onDidChange: { event: () => new Disposable(() => {}) },
  };
}

export function makeExtensionContext(extensionId, globalStateMap, workspaceStateMap) {
  const subscriptions = [];
  const extensionPath = `/extensions/${extensionId}`;

  return {
    subscriptions,

    extensionPath,
    extensionUri: Uri.file(extensionPath),
    storagePath: `/extensions/${extensionId}/storage`,
    globalStoragePath: `/extensions/${extensionId}/global`,
    storageUri: Uri.file(`/extensions/${extensionId}/storage`),
    globalStorageUri: Uri.file(`/extensions/${extensionId}/global`),
    logPath: `/extensions/${extensionId}/logs`,
    logUri: Uri.file(`/extensions/${extensionId}/logs`),

    extensionMode: 1, // ExtensionMode.Production

    globalState: makeMementoAdapter(globalStateMap ?? new Map()),
    workspaceState: makeMementoAdapter(workspaceStateMap ?? new Map()),
    secrets: makeSecretsAdapter(extensionId),

    environmentVariableCollection: {
      persistent: false,
      replace() {}, append() {}, prepend() {},
      get() { return undefined; },
      forEach() {},
      delete() {},
      clear() {},
      [Symbol.iterator]() { return [][Symbol.iterator](); },
    },

    asAbsolutePath(relativePath) {
      return `${extensionPath}/${relativePath}`;
    },

    extension: {
      id: extensionId,
      isActive: true,
      exports: undefined,
      extensionUri: Uri.file(extensionPath),
      extensionPath,
      extensionKind: 1, // ExtensionKind.UI
      packageJSON: {},
    },
  };
}
