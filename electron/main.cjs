const { app, BrowserWindow, protocol, net, shell, dialog } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

protocol.registerSchemesAsPrivileged([{ scheme: "stamprint", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

function openWindow() {
  const window = new BrowserWindow({
    width: 1440, height: 960, minWidth: 800, minHeight: 600,
    title: "Stamprint Studio", backgroundColor: "#151c27",
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  window.setMenuBarVisibility(false);
  window.webContents.session.on("will-download", (event, item, contents) => {
    if (contents !== window.webContents) return;
    const filename = path.basename(item.getFilename());
    const extension = path.extname(filename).slice(1).toLowerCase();
    const filters = extension === "png" ? [{ name: "Imagen PNG", extensions: ["png"] }] : extension === "pdf" ? [{ name: "Documento PDF", extensions: ["pdf"] }] : undefined;
    const destination = dialog.showSaveDialogSync(window, { title: "Guardar archivo", defaultPath: path.join(app.getPath("downloads"), filename), filters });
    if (!destination) { item.cancel(); return; }
    item.setSavePath(destination);
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("stamprint://studio/")) event.preventDefault();
  });
  window.loadURL("stamprint://studio/index.html");
}

app.whenReady().then(() => {
  const root = path.join(__dirname, "../dist");
  protocol.handle("stamprint", request => {
    const url = new URL(request.url);
    const file = path.resolve(root, "." + decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname));
    if (url.host !== "studio" || !file.startsWith(root + path.sep)) return new Response("Not found", { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  openWindow();
  app.on("activate", () => { if (!BrowserWindow.getAllWindows().length) openWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
