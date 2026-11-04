(() => {
  const card = document.querySelector("#install-card");
  const button = document.querySelector("#install-app");
  const help = document.querySelector("#install-help");
  const instructions = document.querySelector("#install-instructions");
  const updateBanner = document.querySelector("#update-banner");
  const updateMessage = document.querySelector("#update-message");
  const updateButton = document.querySelector("#update-now");
  const updateLater = document.querySelector("#update-later");
  const standalone = window.matchMedia("(display-mode: standalone)");
  const scriptUrl = document.currentScript.src;
  let installPrompt = null;
  let installed = false;

  function renderInstall() {
    card.hidden = !window.isSecureContext || installed || standalone.matches ||
      window.navigator.standalone === true;
    button.hidden = !installPrompt;
    help.hidden = Boolean(installPrompt);
  }

  const userAgent = window.navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(userAgent) ||
    (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);

  if (isIOS) {
    instructions.textContent =
      "In Safari, open the Share menu, choose Add to Home Screen, then tap Add. If shown, keep Open as Web App enabled.";
  } else if (/Android/.test(userAgent)) {
    instructions.textContent =
      "Open your browser menu and choose Install app or Add to Home screen. If unavailable, open this page in Chrome.";
  } else if (/Macintosh/.test(userAgent) && /Safari/.test(userAgent) && !/Chrome|Chromium|Edg/.test(userAgent)) {
    instructions.textContent =
      "In Safari 17 or later, choose File → Add to Dock. You can also install Reader using Chrome or Edge.";
  } else {
    instructions.textContent =
      "In Chrome or Edge, use the install icon in the address bar or the browser menu to install this page as an app. If your browser does not offer installation, open this page in Chrome or Edge.";
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    renderInstall();
  });

  button.addEventListener("click", async () => {
    const prompt = installPrompt;
    if (!prompt) return;
    button.disabled = true;

    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") installed = true;
    } catch (error) {
      console.warn("The installation prompt was unavailable. Use the browser menu instead.", error);
    } finally {
      installPrompt = null;
      button.disabled = false;
      renderInstall();
    }
  });

  window.addEventListener("appinstalled", () => {
    installed = true;
    installPrompt = null;
    renderInstall();
  });
  standalone.addEventListener("change", renderInstall);
  renderInstall();

  if ("serviceWorker" in window.navigator && window.isSecureContext) {
    const serviceWorker = window.navigator.serviceWorker;
    let registration = null;
    let controller = serviceWorker.controller;
    let updatedController = null;
    let dismissedUpdate = null;
    let applying = false;
    let prepared = false;
    let reloading = false;
    let updateTimer = 0;

    function renderUpdate(message = "Update available.") {
      const update = registration?.waiting || updatedController;
      updateBanner.hidden = !update || update === dismissedUpdate;
      updateMessage.textContent = message;
      updateButton.disabled = applying;
      updateLater.disabled = applying;
    }

    function reloadReader() {
      if (reloading) return;
      reloading = true;
      window.clearTimeout(updateTimer);
      window.location.reload();
    }

    function updateFailed(message) {
      window.clearTimeout(updateTimer);
      applying = false;
      prepared = false;
      window.readerUpdates?.cancel();
      renderUpdate(message);
    }

    // Another Reader window may activate the update. Offer a restart here too,
    // but never reload a book in a window that has not chosen Update now.
    serviceWorker.addEventListener("controllerchange", () => {
      const previous = controller;
      controller = serviceWorker.controller;
      if (!previous || controller === previous) return;
      updatedController = controller;
      if (applying && prepared) reloadReader();
      else if (!applying) renderUpdate();
    });

    updateLater.addEventListener("click", () => {
      dismissedUpdate = registration?.waiting || updatedController;
      renderUpdate();
    });

    updateButton.addEventListener("click", async () => {
      if (applying) return;
      applying = true;
      renderUpdate("Saving your place…");
      try {
        await window.readerUpdates?.prepare();
        prepared = true;
        if (updatedController) {
          reloadReader();
          return;
        }
        const waiting = registration?.waiting;
        if (!waiting) throw new Error("The update is no longer ready. Please reopen Reader to check again.");
        renderUpdate("Updating Reader…");
        updateTimer = window.setTimeout(() => {
          updateFailed("The update did not finish. Your book is still open; try again.");
        }, 15000);
        waiting.postMessage({ type: "READER_ACTIVATE_UPDATE" });
      } catch (error) {
        updateFailed(error.message || "Could not update Reader. Please try again.");
      }
    });

    window.addEventListener("load", async () => {
      try {
        registration = await serviceWorker.register(
          new URL("sw.js", scriptUrl),
          { scope: new URL("./", scriptUrl).href, updateViaCache: "none" },
        );
        const watchInstalling = () => {
          const installing = registration.installing;
          installing?.addEventListener("statechange", () => {
            if (!applying) renderUpdate();
          });
        };
        registration.addEventListener("updatefound", watchInstalling);
        watchInstalling();
        renderUpdate();
        // Check again when returning to a long-lived reader, without reloading a book.
        let lastUpdateCheck = Date.now();
        window.addEventListener("focus", () => {
          if (Date.now() - lastUpdateCheck < 60 * 60 * 1000) return;
          lastUpdateCheck = Date.now();
          void registration.update().catch(() => {});
        });
      } catch (error) {
        console.warn("Offline Reader setup failed; online reading is still available.", error);
      }
    });
  }
})();
