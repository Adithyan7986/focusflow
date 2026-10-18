
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

function createWindow() {
  const indexPath = path.resolve(
    __dirname,
    'frontend-dist',
    'index.html'
  );

  console.log('App packaged:', app.isPackaged);
  console.log('__dirname:', __dirname);
  console.log('Frontend path:', indexPath);
  console.log('HTML exists:', fs.existsSync(indexPath));

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 650,
    title: 'FocusFlow',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });


  win.webContents.on('did-fail-load', (_event, code, description, url) => {
    console.error('LOAD FAILED:', code, description, url);
  });

  win.webContents.on('did-finish-load', () => {
    console.log('PAGE LOADED:', win.webContents.getURL());
  });

  win.webContents.on('will-navigate', (_event, url) => {
    console.log('NAVIGATION:', url);
  });

  win.webContents.on('console-message', (_event, details) => {
    console.log('BROWSER CONSOLE:', details.message);
  });

  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('RENDERER EXITED:', details);
  });

  if (app.isPackaged) {
    win.loadFile(indexPath).catch(console.error);
  } else {
    win.loadURL('http://localhost:5173').catch(console.error);
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
