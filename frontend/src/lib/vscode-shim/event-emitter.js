// Disposable and EventEmitter — VS Code API primitives used throughout the shim.

export class Disposable {
  constructor(fn) {
    this._fn = fn;
    this._disposed = false;
  }
  dispose() {
    if (!this._disposed) {
      this._disposed = true;
      this._fn();
    }
  }
  static from(...items) {
    return new Disposable(() => items.forEach((d) => d?.dispose()));
  }
}

export class EventEmitter {
  constructor() {
    this._listeners = new Set();
    this._disposed = false;
  }

  get event() {
    return (listener, thisArg, disposables) => {
      const fn = thisArg ? listener.bind(thisArg) : listener;
      this._listeners.add(fn);
      const d = new Disposable(() => this._listeners.delete(fn));
      if (Array.isArray(disposables)) disposables.push(d);
      return d;
    };
  }

  fire(data) {
    if (this._disposed) return;
    // Snapshot the set so mutations during iteration don't cause issues.
    for (const fn of [...this._listeners]) {
      try { fn(data); } catch (e) { console.error("[vscode-shim] EventEmitter listener threw:", e); }
    }
  }

  dispose() {
    this._disposed = true;
    this._listeners.clear();
  }
}
