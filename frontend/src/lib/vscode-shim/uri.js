// VS Code Uri class shim — covers the subset used by bio extensions.

export class Uri {
  constructor(scheme, authority, path, query, fragment) {
    this.scheme = scheme || "file";
    this.authority = authority || "";
    this.path = path || "";
    this.query = query || "";
    this.fragment = fragment || "";
    // fsPath: on file URIs expose the path directly (forward slashes)
    this.fsPath = scheme === "file" ? path : path;
  }

  static file(fsPath) {
    // Normalise Windows back-slashes to forward slashes.
    const normalised = fsPath.replace(/\\/g, "/");
    return new Uri("file", "", normalised, "", "");
  }

  static parse(value) {
    try {
      const url = new URL(value);
      return new Uri(url.protocol.replace(":", ""), url.host, decodeURIComponent(url.pathname), url.search.slice(1), url.hash.slice(1));
    } catch {
      // Treat bare paths as file URIs.
      return Uri.file(value);
    }
  }

  static joinPath(uri, ...pathSegments) {
    let base = uri.path;
    if (!base.endsWith("/")) base += "/";
    const joined = base + pathSegments.join("/");
    // Normalise double slashes.
    const clean = joined.replace(/\/+/g, "/");
    return new Uri(uri.scheme, uri.authority, clean, uri.query, uri.fragment);
  }

  with({ scheme, authority, path, query, fragment } = {}) {
    return new Uri(
      scheme ?? this.scheme,
      authority ?? this.authority,
      path ?? this.path,
      query ?? this.query,
      fragment ?? this.fragment,
    );
  }

  toString(skipEncoding = false) {
    if (this.scheme === "file") {
      return `file://${this.authority}${this.path}`;
    }
    const encoded = skipEncoding ? this.path : encodeURI(this.path);
    let result = `${this.scheme}://${this.authority}${encoded}`;
    if (this.query) result += `?${this.query}`;
    if (this.fragment) result += `#${this.fragment}`;
    return result;
  }

  toJSON() {
    return {
      $mid: 1,
      scheme: this.scheme,
      authority: this.authority,
      path: this.path,
      query: this.query,
      fragment: this.fragment,
      fsPath: this.fsPath,
      _formatted: this.toString(),
    };
  }
}
