(function (global) {
  if (global.Element && global.Element.prototype && typeof global.Element.prototype.replaceChildren !== "function") {
    global.Element.prototype.replaceChildren = function replaceChildrenFallback() {
      while (this.firstChild) {
        this.removeChild(this.firstChild);
      }
      for (var i = 0; i < arguments.length; i += 1) {
        var child = arguments[i];
        if (typeof child === "string") {
          child = document.createTextNode(child);
        }
        if (child) {
          this.appendChild(child);
        }
      }
    };
  }

  if (typeof global.URLSearchParams !== "function") {
    global.URLSearchParams = function URLSearchParamsFallback(search) {
      this._items = {};
      var source = String(search || "");
      if (source.charAt(0) === "?") source = source.slice(1);
      if (!source) return;
      var pairs = source.split("&");
      for (var i = 0; i < pairs.length; i += 1) {
        var pair = pairs[i];
        if (!pair) continue;
        var eq = pair.indexOf("=");
        var rawKey = eq >= 0 ? pair.slice(0, eq) : pair;
        var rawValue = eq >= 0 ? pair.slice(eq + 1) : "";
        var key = decodeQueryPart(rawKey);
        if (!Object.prototype.hasOwnProperty.call(this._items, key)) {
          this._items[key] = decodeQueryPart(rawValue);
        }
      }
    };

    global.URLSearchParams.prototype.get = function get(name) {
      var key = String(name);
      return Object.prototype.hasOwnProperty.call(this._items, key) ? this._items[key] : null;
    };
  }

  function decodeQueryPart(value) {
    try {
      return decodeURIComponent(String(value || "").replace(/\+/g, " "));
    } catch (_) {
      return String(value || "");
    }
  }
})(window);
