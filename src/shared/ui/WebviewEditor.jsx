import { useEffect, useRef } from "react";
import { useExtensionStore } from "../stores/extensionStore.js";

// Renders the iframe for a tab of type "webview" and relays postMessage traffic
// between the iframe and the WebviewPanel shim in extensionStore.
export default function WebviewEditor({ tabId }) {
  const iframeRef = useRef(null);
  const panel = useExtensionStore((s) => s.webviewPanels[tabId]);

  // When panel.webview.html is set, push it into the iframe via srcdoc.
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.tabId !== tabId) return;
      if (iframeRef.current) {
        const html = _prepareWebviewHtml(e.detail.html, tabId);
        iframeRef.current.srcdoc = html;
      }
    };
    window.addEventListener("vscode-webview-html-update", handler);
    return () => window.removeEventListener("vscode-webview-html-update", handler);
  }, [tabId]);

  // Relay messages FROM iframe TO extension's onDidReceiveMessage handler.
  // Origin is null for srcdoc iframes — we validate by contentWindow reference instead.
  useEffect(() => {
    const handler = (e) => {
      if (e.source !== iframeRef.current?.contentWindow) return;
      if (e.data?.type === "vscode-webview-message") {
        window.dispatchEvent(new CustomEvent("vscode-webview-message-from-frame", {
          detail: { tabId, message: e.data.message, source: "webview" },
        }));
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [tabId]);

  // Relay messages FROM extension TO iframe via postMessage.
  // Target origin is "*" because srcdoc iframes have a null origin.
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.tabId !== tabId) return;
      iframeRef.current?.contentWindow?.postMessage(e.detail.message, "*");
    };
    window.addEventListener("vscode-webview-post-message", handler);
    return () => window.removeEventListener("vscode-webview-post-message", handler);
  }, [tabId]);

  if (!panel) {
    return (
      <div className="placeholder-editor">
        <p>Webview panel loading…</p>
      </div>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      className="webview-editor-frame"
      // allow-same-origin is intentionally omitted for third-party extension HTML
      // to prevent the iframe from accessing the parent's localStorage/cookies.
      // Extensions that need storage should use acquireVsCodeApi().setState().
      sandbox="allow-scripts allow-forms"
      title={panel.title ?? "Extension Webview"}
      style={{ width: "100%", height: "100%", border: "none", background: "var(--editor-bg)" }}
    />
  );
}

// ── HTML preparation ──────────────────────────────────────────────────────────

function _prepareWebviewHtml(html, tabId) {
  let result = html;

  // 1. Inject acquireVsCodeApi() shim.
  const apiScript = _acquireVsCodeApiScript(tabId);

  // 2. Inject a permissive CSP that allows blob: and data: URIs for assets,
  //    but blocks navigation and object embeds.
  const cspMeta = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob:; style-src 'unsafe-inline' blob: data:; img-src blob: data: https:; font-src blob: data:; connect-src https: wss:;">`;

  if (result.includes("<head>")) {
    result = result.replace("<head>", `<head>${cspMeta}${apiScript}`);
  } else if (result.includes("<body>")) {
    result = result.replace("<body>", `${cspMeta}${apiScript}<body>`);
  } else {
    result = cspMeta + apiScript + result;
  }

  return result;
}

function _acquireVsCodeApiScript(tabId) {
  return `<script>
(function(){
  var __state = {};
  window.acquireVsCodeApi = function() {
    return {
      postMessage: function(msg) {
        window.parent.postMessage({ type: 'vscode-webview-message', message: msg }, '*');
      },
      setState: function(s) { __state = s; },
      getState: function() { return __state; }
    };
  };
  // VS Code extension host message relay (for extensions that listen on window.onmessage).
  window.addEventListener('message', function(e) {
    if (e.data && e.data.__vscodeTargetOrigin === undefined) return;
  });
})();
<\/script>`;
}
