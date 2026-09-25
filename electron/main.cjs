const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 800,
    minHeight: 550,
    backgroundColor: '#0a0d17',
    title: 'C2 Sub Auto AI - Manga OCR & Translation Studio',
    icon: path.join(__dirname, '../public/icon.ico'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // Allows cross-origin API requests and local resource loading seamlessly
      spellcheck: false, // Disables memory-heavy background spellchecker
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Check if running in development mode
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Open external links in user's default browser instead of Electron window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Periodically clear unreferenced image/decoded cache to keep RAM footprint minimal
  const cacheCleanupInterval = setInterval(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.session.clearCache().catch(() => {});
    }
  }, 3 * 60 * 1000);

  mainWindow.on('closed', () => {
    clearInterval(cacheCleanupInterval);
    mainWindow = null;
  });
}

// Single instance lock to prevent multiple apps opening simultaneously
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
