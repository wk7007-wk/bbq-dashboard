(function (global) {
  const AUTH_STORAGE_KEY = "chicken-timer-web-auth-v1";
  const AUTH_VERSION = "web-pin-2345-v1";
  const PIN_CODE = "2345";
  const APP_SOURCES = {
    android: true,
    "android-fallback": true,
  };

  function createGate(options) {
    const storage = options && options.storage ? options.storage : null;
    const location = options && options.location ? options.location : global.location || {};
    const search = options && typeof options.search === "string"
      ? options.search
      : String((location && location.search) || "");
    const params = new URLSearchParams(search);
    const source = String(params.get("source") || "").trim().toLowerCase();

    function hasTrustedNativeBridge() {
      const bridge = global.ChickenTimerNative;
      if (!bridge || typeof bridge.getBridgeVersion !== "function") return false;
      try {
        return String(bridge.getBridgeVersion()) === "chicken-timer-native-v1";
      } catch (_) {
        return false;
      }
    }

    function isBypassed() {
      return Boolean(APP_SOURCES[source]) && hasTrustedNativeBridge();
    }

    function readRecord() {
      if (!storage) return null;
      try {
        const raw = storage.getItem(AUTH_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.version !== AUTH_VERSION || parsed.granted !== true) return null;
        return parsed;
      } catch (_) {
        return null;
      }
    }

    function isAuthorized() {
      if (isBypassed()) return true;
      return Boolean(readRecord());
    }

    function authorize(pinInput) {
      const pin = String(pinInput || "").replace(/\s+/g, "");
      if (pin !== PIN_CODE) return false;
      if (storage) {
        try {
          storage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
            version: AUTH_VERSION,
            granted: true,
            grantedAt: Date.now(),
          }));
        } catch (_) {}
      }
      return true;
    }

    function mount(config) {
      if (isAuthorized()) {
        if (config && typeof config.onUnlock === "function") config.onUnlock();
        return null;
      }

      const document = global.document;
      if (!document || !document.body || typeof document.createElement !== "function") {
        return null;
      }

      document.body.dataset.authState = "locked";

      const overlay = document.createElement("section");
      overlay.className = "auth-gate";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-label", "웹 접근 PIN 인증");

      const panel = document.createElement("div");
      panel.className = "auth-panel";
      overlay.appendChild(panel);

      const title = document.createElement("h1");
      title.className = "auth-title";
      title.textContent = "웹 PIN";
      panel.appendChild(title);

      const hint = document.createElement("p");
      hint.className = "auth-hint";
      hint.textContent = "등록된 기기만 사용";
      panel.appendChild(hint);

      const input = document.createElement("input");
      input.className = "auth-pin-input";
      input.type = "password";
      input.inputMode = "numeric";
      input.autocomplete = "one-time-code";
      input.maxLength = 4;
      input.placeholder = "PIN 4자리";
      input.setAttribute("aria-label", "PIN 4자리 입력");
      panel.appendChild(input);

      const error = document.createElement("div");
      error.className = "auth-error";
      error.hidden = true;
      error.textContent = "PIN 불일치";
      panel.appendChild(error);

      const submit = document.createElement("button");
      submit.type = "button";
      submit.className = "auth-submit";
      submit.textContent = "확인";
      panel.appendChild(submit);

      function clearError() {
        error.hidden = true;
      }

      function unlock() {
        if (!authorize(input.value)) {
          error.hidden = false;
          if (typeof input.focus === "function") {
            input.focus();
          }
          return false;
        }
        document.body.dataset.authState = "unlocked";
        if (overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
        if (config && typeof config.onUnlock === "function") {
          config.onUnlock();
        }
        return true;
      }

      input.addEventListener("input", clearError);
      input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        unlock();
      });
      submit.addEventListener("click", (event) => {
        event.preventDefault();
        unlock();
      });

      document.body.appendChild(overlay);
      if (typeof input.focus === "function") {
        input.focus();
      }
      return overlay;
    }

    return {
      AUTH_STORAGE_KEY,
      AUTH_VERSION,
      hasTrustedNativeBridge,
      isBypassed,
      isAuthorized,
      authorize,
      mount,
    };
  }

  global.ChickenTimerAuth = {
    AUTH_STORAGE_KEY,
    AUTH_VERSION,
    createGate,
  };

  const gate = createGate({
    location: global.location,
    search: global.location && global.location.search ? global.location.search : "",
    storage: global.localStorage,
  });

  if (gate.isAuthorized()) {
    if (global.document && global.document.body) {
      global.document.body.dataset.authState = "unlocked";
    }
    return;
  }

  if (global.document && typeof global.document.getElementById === "function") {
    const originalGetElementById = global.document.getElementById.bind(global.document);
    global.document.getElementById = function getElementById(id) {
      if (id === "board") return null;
      return originalGetElementById(id);
    };
  }

  gate.mount({
    onUnlock() {
      if (global.location && typeof global.location.reload === "function") {
        global.location.reload();
      }
    },
  });
})(window);
