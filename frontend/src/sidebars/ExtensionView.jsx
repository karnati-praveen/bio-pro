import { useEffect, useRef } from "react";
import { useExtensionStore } from "../stores/extensionStore.js";

// Renders a sidebar webview view contributed by an extension via
// vscode.window.registerWebviewViewProvider(viewId, provider).
export default function ExtensionView({ viewId }) {
  const iframeRef = useRef(null);
  const providers = useExtensionStore((s) => s.webviewViewProviders);
  const entry = providers[viewId] ?? providers[viewId.replace("ext:", "")];

  useEffect(() => {
    if (!entry?.provider || !iframeRef.current) return;

    let _html = "";
    const onMessageEmitter_listeners = new Set();

    const webviewView = {
      webview: {
        options: entry.options ?? { enableScripts: true },
        cspSource: "",
        get html() { return _html; },
        set html(value) {
          _html = value;
          if (iframeRef.current) {
            iframeRef.current.srcdoc = _injectAcquireApi(value);
          }
        },
        get onDidReceiveMessage() {
          return (listener) => {
            onMessageEmitter_listeners.add(listener);
            return { dispose() { onMessageEmitter_listeners.delete(listener); } };
          };
        },
        postMessage(message) {
          iframeRef.current?.contentWindow?.postMessage(message, "*");
          return Promise.resolve(true);
        },
        asWebviewUri(uri) { return uri; },
      },
      visible: true,
      onDidChangeVisibility: (listener) => ({ dispose() {} }),
    };

    // Relay iframe → extension messages.
    const msgHandler = (e) => {
      if (e.source !== iframeRef.current?.contentWindow) return;
      if (e.data?.type === "vscode-webview-message") {
        onMessageEmitter_listeners.forEach((fn) => fn(e.data.message));
      }
    };
    window.addEventListener("message", msgHandler);

    try {
      entry.provider.resolveWebviewView(webviewView, {}, { isCancellationRequested: false });
    } catch (e) {
      console.error("[vscode-shim] resolveWebviewView error:", e);
    }

    return () => window.removeEventListener("message", msgHandler);
  }, [viewId, entry]);

  if (!entry) {
    return <div className="ext-view-empty">Extension view not found: {viewId}</div>;
  }

  return (
    <iframe
      ref={iframeRef}
      className="ext-sidebar-frame"
      sandbox="allow-scripts allow-forms allow-same-origin"
      title={viewId}
      style={{ width: "100%", height: "100%", border: "none", background: "var(--card)" }}
    />
  );
}

function _injectAcquireApi(html) {
  const script = `<script>
(function(){
  var __state={};
  window.acquireVsCodeApi=function(){
    return {
      postMessage:function(m){window.parent.postMessage({type:'vscode-webview-message',message:m},'*');},
      setState:function(s){__state=s;},getState:function(){return __state;}
    };
  };
})();
<\/script>`;
  if (html.includes("<head>")) return html.replace("<head>", "<head>" + script);
  if (html.includes("<body>")) return html.replace("<body>", script + "<body>");
  return script + html;
}
