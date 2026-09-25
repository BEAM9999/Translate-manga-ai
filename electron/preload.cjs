const { contextBridge } = require('electron');

// Expose safe desktop environment info if needed
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isDesktop: true,
});
