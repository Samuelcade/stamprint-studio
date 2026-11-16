const { spawn } = require("node:child_process");
const path = require("node:path");
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const child = spawn(path.resolve(__dirname, "../installers/windows/win-unpacked/Stamprint Studio.exe"), ["--remote-debugging-port=19324"], { stdio: "ignore" });
  let socket;
  try {
    let pages;
    for (let i = 0; i < 60; i++) {
      try { pages = await (await fetch("http://127.0.0.1:19324/json/list")).json(); if (pages.some(page => page.type === "page")) break; } catch {}
      await wait(1000);
    }
    const page = pages?.find(page => page.type === "page");
    if (!page) throw new Error("No se pudo abrir la ventana de Windows.");
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let id = 0;
    const evaluate = expression => new Promise((resolve, reject) => {
      const current = ++id;
      const handler = event => {
        const response = JSON.parse(event.data);
        if (response.id !== current) return;
        socket.removeEventListener("message", handler);
        if (response.error || response.result.exceptionDetails) reject(new Error(JSON.stringify(response)));
        else resolve(response.result.result.value);
      };
      socket.addEventListener("message", handler);
      socket.send(JSON.stringify({ id: current, method: "Runtime.evaluate", params: { expression, returnByValue: true, awaitPromise: true } }));
    });
    await wait(3000);
    const text = await evaluate("document.body.innerText");
    if (!text?.includes("Simulador 3D")) throw new Error("La interfaz no cargó: " + text);
    await evaluate("[...document.querySelectorAll('button')].find(b => b.textContent.includes('Simulador 3D'))?.click()");
    let ready = false;
    for (let i = 0; i < 45; i++) {
      ready = await evaluate("document.body.innerText.includes('Camiseta 3D lista') && !!document.querySelector('.three-canvas canvas')");
      if (ready) break;
      await wait(1000);
    }
    if (!ready) throw new Error("El modelo 3D no cargó: " + await evaluate("document.body.innerText"));
    console.log("Windows: interfaz, simulador y modelo 3D cargados correctamente.");
    await evaluate("[...document.querySelectorAll('button')].find(b => b.textContent.includes('Crear y descargar video'))?.click()");
    await wait(1000);
    if (!await evaluate("document.body.innerText.includes('Cancelar grabación')")) throw new Error("La grabación de video no inició.");
    await evaluate("[...document.querySelectorAll('button')].find(b => b.textContent.includes('Cancelar grabación'))?.click()");
    console.log("Windows: grabación 360° iniciada y cancelada correctamente.");
  } finally { socket?.close(); child.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
