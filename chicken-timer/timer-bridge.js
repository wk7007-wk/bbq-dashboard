(function (global) {
  function createBridge(target) {
    const env = target || global;
    let audioContext = null;
    let lastWebAlertAt = 0;
    let lastWebMoveCueAt = 0;

    function callNative(method, ...args) {
      try {
        if (env.ChickenTimerNative && typeof env.ChickenTimerNative[method] === "function") {
          env.ChickenTimerNative[method](...args);
          return true;
        }
      } catch (_) {}
      return false;
    }

    function vibrate(pattern) {
      if (!env.navigator || typeof env.navigator.vibrate !== "function") return;
      try {
        env.navigator.vibrate(pattern);
      } catch (_) {}
    }

    function isPageForeground() {
      return !env.document || env.document.visibilityState !== "hidden";
    }

    function playWebAlertTone() {
      const AudioContextCtor = env.AudioContext || env.webkitAudioContext;
      if (!AudioContextCtor || !isPageForeground()) return;
      const nowAt = Date.now();
      if (nowAt - lastWebAlertAt < 2500) return;
      lastWebAlertAt = nowAt;

      try {
        if (!audioContext) {
          audioContext = new AudioContextCtor();
        }
        if (audioContext.state === "suspended" && typeof audioContext.resume === "function") {
          audioContext.resume().catch(() => {});
        }

        const baseTime = audioContext.currentTime + 0.02;
        const pulseGap = 0.36;
        const pulseLength = 0.13;

        Array.from({ length: 8 }).forEach((_, index) => {
          const oscillator = audioContext.createOscillator();
          const gainNode = audioContext.createGain();
          const startAt = baseTime + index * pulseGap;
          const stopAt = startAt + pulseLength;

          oscillator.type = "sine";
          oscillator.frequency.setValueAtTime(1480, startAt);
          gainNode.gain.setValueAtTime(0.0001, startAt);
          gainNode.gain.exponentialRampToValueAtTime(0.06, startAt + 0.015);
          gainNode.gain.exponentialRampToValueAtTime(0.025, stopAt - 0.03);
          gainNode.gain.exponentialRampToValueAtTime(0.0001, stopAt);

          oscillator.connect(gainNode);
          gainNode.connect(audioContext.destination);
          oscillator.start(startAt);
          oscillator.stop(stopAt + 0.02);
        });
      } catch (_) {}
    }

    function playWebMoveCueTone() {
      const AudioContextCtor = env.AudioContext || env.webkitAudioContext;
      if (!AudioContextCtor || !isPageForeground()) return;
      const nowAt = Date.now();
      if (nowAt - lastWebMoveCueAt < 180) return;
      lastWebMoveCueAt = nowAt;

      try {
        if (!audioContext) {
          audioContext = new AudioContextCtor();
        }
        if (audioContext.state === "suspended" && typeof audioContext.resume === "function") {
          audioContext.resume().catch(() => {});
        }

        const startAt = audioContext.currentTime + 0.02;
        const stopAt = startAt + 0.085;
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.type = "triangle";
        oscillator.frequency.setValueAtTime(760, startAt);
        oscillator.frequency.exponentialRampToValueAtTime(620, stopAt);
        gainNode.gain.setValueAtTime(0.0001, startAt);
        gainNode.gain.exponentialRampToValueAtTime(0.075, startAt + 0.012);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, stopAt);

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.start(startAt);
        oscillator.stop(stopAt + 0.02);
      } catch (_) {}
    }

    return {
      vibrateTap() {
        if (callNative("vibrateTap")) return;
        vibrate([0, 58, 24, 74]);
      },
      vibrateMove() {
        if (callNative("vibrateMove")) return;
        vibrate([0, 36, 28, 50]);
      },
      vibrateConfirm() {
        if (callNative("vibrateConfirm")) return;
        vibrate([0, 88, 34, 118, 44, 158]);
      },
      vibrateAlert() {
        if (callNative("vibrateAlert")) return;
        vibrate([220, 90, 300, 90, 380, 120, 460]);
      },
      playAlert() {
        if (callNative("playAlert")) return;
        if (!isPageForeground()) return;
        this.vibrateAlert();
        playWebAlertTone();
      },
      playMoveCue() {
        if (callNative("playMoveCue")) return;
        if (!isPageForeground()) return;
        this.vibrateMove();
        playWebMoveCueTone();
      },
      playTouchCue(cue) {
        if (callNative("playTouchCue", String(cue || ""))) return true;
        if (!isPageForeground()) return false;
        this.vibrateTap();
        playWebMoveCueTone();
        return true;
      },
      reportBoardMotion(hasMovingTimers) {
        callNative("reportBoardMotion", Boolean(hasMovingTimers));
      },
      reportBoardState(hasActiveTimers, hasMovingTimers) {
        if (callNative("reportBoardState", Boolean(hasActiveTimers), Boolean(hasMovingTimers))) return;
        callNative("reportBoardMotion", Boolean(hasMovingTimers));
      },
    };
  }

  global.ChickenTimerBridge = {
    createBridge,
  };
})(window);
