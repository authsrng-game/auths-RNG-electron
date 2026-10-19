const {
  app,
  BrowserWindow,
  protocol,
  net,
  shell,
  Menu,
  session,
} = require("electron");
const path = require("path");
const fs = require("fs");
const { Readable } = require("stream");
const { pathToFileURL } = require("url");

const ROOT = path.join(__dirname, "game");

const MIME = {
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

app.setPath("userData", path.join(app.getPath("appData"), "auths-rng"));
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);

if (!app.requestSingleInstanceLock()) app.quit();

let win;
const ALLOWED_HOSTS = new Set(["cataas.com"]);

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: "#000000",
    title: "auth's RNG",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  if (!app.isPackaged || process.env.AUTHS_DEBUG) {
    win.webContents.on("before-input-event", (e, input) => {
      if (input.type !== "keyDown") return;
      if (
        input.key === "F12" ||
        (input.control && input.shift && input.key.toLowerCase() === "i")
      ) {
        win.webContents.toggleDevTools();
      }
    });
  }
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (url.startsWith("app://")) return;
    e.preventDefault();
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
  });
  win.loadURL("app://game/index.html");
}

async function serve(req) {
  let rel = decodeURIComponent(new URL(req.url).pathname);
  if (rel === "/") rel = "/index.html";
  if (rel === "/service-worker.js") {
    return new Response("", { headers: { "Content-Type": "text/javascript" } });
  }
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT + path.sep))
    return new Response("forbidden", { status: 403 });
  const range = req.headers.get("range");
  const type = MIME[path.extname(file).toLowerCase()];
  if (!range || !type) {
    try {
      return await net.fetch(pathToFileURL(file).toString());
    } catch (e) {
      console.log("miss", rel);
      return new Response("not found", { status: 404 });
    }
  }
  let stat;
  try {
    stat = await fs.promises.stat(file);
  } catch (e) {
    console.log("miss", rel);
    return new Response("not found", { status: 404 });
  }
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  let start = m && m[1] ? parseInt(m[1], 10) : 0;
  let end = m && m[2] ? parseInt(m[2], 10) : stat.size - 1;
  if (m && !m[1] && m[2]) {
    start = Math.max(stat.size - parseInt(m[2], 10), 0);
    end = stat.size - 1;
  }
  end = Math.min(end, stat.size - 1);
  if (start > end) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${stat.size}` },
    });
  }
  return new Response(
    Readable.toWeb(fs.createReadStream(file, { start, end })),
    {
      status: 206,
      headers: {
        "Content-Type": type,
        "Content-Length": String(end - start + 1),
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
      },
    },
  );
}

app.whenReady().then(() => {
  app.setAppUserModelId("xyz.authsrng.Game");
  Menu.setApplicationMenu(null);
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const u = details.url;
    let ok =
      u.startsWith("app://") ||
      u.startsWith("devtools://") ||
      u.startsWith("data:") ||
      u.startsWith("blob:") ||
      u.startsWith("file://");
    if (!ok) {
      try {
        const url = new URL(u);
        ok = url.protocol === "https:" && ALLOWED_HOSTS.has(url.hostname);
      } catch (e) {
        ok = false;
      }
    }
    callback({ cancel: !ok });
  });
  protocol.handle("app", serve);
  createWindow();
});

app.on("second-instance", () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.on("window-all-closed", () => app.quit());
