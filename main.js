const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

// Disable GPU compositing — prevents blank/invisible windows on some GPU drivers
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');

// Keep a global reference to prevent garbage collection
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width:  1280,
    height: 820,
    minWidth:  900,
    minHeight: 600,
    center: true,                   // always center on primary monitor
    title: 'FinanceDB',
    icon: path.join(__dirname, 'icon.png'),
    backgroundColor: '#0F172A',   // match app background — no white flash on load
    webPreferences: {
      nodeIntegration: false,       // security: keep Node out of renderer
      contextIsolation: true,
      sandbox: true,
      webSecurity: false,           // allow file:// to file:// fetch for .wasm
    },
    // Clean frameless-style title bar on Windows
    titleBarStyle: 'default',
    show: false,                    // wait for ready-to-show to avoid blank flash
  });

  // Load the app
  mainWindow.loadFile('index.html');

  // Show window only when fully rendered
  mainWindow.once('ready-to-show', () => {
    mainWindow.center();
    mainWindow.show();
    mainWindow.focus();
  });

  // Open external links in the system browser, not in Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  // macOS: re-open window when dock icon is clicked and no windows are open
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
