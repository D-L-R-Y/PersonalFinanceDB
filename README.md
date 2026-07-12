# Personal Finance Database

A modern, offline-first personal finance tracker for **Windows, Android, and iOS**, powered by a real **SQLite database** stored entirely on your local machine.

<img width="929" height="977" alt="demo" src="https://github.com/user-attachments/assets/46008b44-0088-4444-ac1b-d81b9106dd51" />


---

## How to Install and Run

### Option 1: Direct Download (Recommended)
The easiest way to get started is to download the pre-built app. No installation or coding experience required.

1. Go to the [Releases](../../releases/latest) page.
2. Choose your platform:
   - **For Windows**: Download the `FinanceDB.Setup.exe` file and double-click to install.
   - **For Android**: Download the `FinanceDB.apk` file directly on your phone and tap to install it. *(You may need to allow "Installation from unknown sources" in your settings since it's not from the Google Play Store).*
   - **For iOS (iPhone/iPad)**: Visit the live app at `https://D-L-R-Y.github.io/PersonalFinanceDB/` in Safari. Tap the **Share** button at the bottom of the screen, then select **"Add to Home Screen"**. It will install as a native-feeling app and (thanks to PWA Service Workers) will work 100% offline!

### Option 2: Build from Source (For Developers)
If you want to modify the code or build the app yourself:

1. Ensure you have [Node.js](https://nodejs.org/) installed.
2. Clone this repository and open a terminal in the project folder.
3. Run the following commands:
   ```bash
   npm install
   npm run build
   ```
4. Find the generated installer inside the `dist/` folder and double-click to install.

### Option 3: Run Locally in Browser (No Build Required)
If you don't want to install Node.js or build the `.exe`, you can still run the app directly in your browser.

However, modern browsers block local files (`file://`) from loading WebAssembly (`.wasm`), which prevents the SQLite database from starting if you just double-click `index.html`. 

To bypass this restriction easily:
- Double-click **`Open FinanceDB.bat`**
- This script automatically launches a secure, isolated Chrome window with the `--allow-file-access-from-files` flag enabled so the database engine can load locally.

Alternatively, you can test via Node.js by running:
```bash
npm install
npm start
```
Or simply host the repository on GitHub Pages to run it as a PWA.
---

## Features

| Feature | Description |
|---|---|
| 📊 Dashboard | Summary cards + donut chart of spending by category |
| 🧮 Calculator | Built-in arithmetic evaluator for splitting bills and calculating exact cuts inline |
| ⚙️ Custom Settings | Personalize your app headline, currency symbol, and category colors/names |
| ➕ Add Spending | Log expenses with customized categories |
| ➕ Add Income | Log income |
| 📅 Month View | Filter by current month with prev/next navigation |
| 🌐 All Time View | Toggle to see all-time totals |
| 🗑️ Delete | Remove any transaction from the list |
| 💾 Auto-Save | Data is saved to your local storage automatically |
| 📤 Export Data | Download your transactions as `.db`, `.csv`, or `.json` |
| 📥 Import Data | Restore from `.db`, or append new data from `.csv`/`.json` |

---

## How It Works

This application is fundamentally a web app packaged natively for multiple platforms (Electron for Windows, Capacitor for Android, PWA for iOS). Here is how the pieces fit together:

1. **In-Memory Database**: Instead of running a traditional database server, the app uses `sql.js` (SQLite compiled to WebAssembly). This allows a fully functional, relational SQL database to run directly inside the app's memory.
2. **Local Persistence**: Every time you add or delete a transaction, the app takes a snapshot of the active database and saves it directly to your computer's local storage. When you open the app again, it reloads that snapshot back into memory.
3. **100% Offline & Private**: Whether it runs through Electron (Windows), Capacitor (Android), or as a PWA (iOS), all your financial data stays securely on your device. There is no cloud sync, no tracking, and no internet connection required after the first load.
4. **Data Portability**: The database operates as a standard SQLite format. The "Export .db" feature lets you download your data as a real `.db` file that can be opened in any standard SQLite database viewer or imported back into the app later.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Desktop Framework| Electron + electron-builder |
| Mobile Framework | Capacitor (Android) / PWA Service Workers (iOS) |
| UI | HTML5 + Vanilla CSS + JavaScript (ES6+) |
| Database | SQLite via `sql.js` (WebAssembly) |
| Charts | Chart.js 4 |
| Icons | Inline SVG (Lucide-style) |

---

## Project Structure

```text
Personal Finance Database/
├── index.html     ← App shell, modals, layout
├── style.css      ← Dark OLED design system
├── app.js         ← Core logic: SQL, charts, UI, Settings
├── main.js        ← Electron main process
├── package.json   ← npm and build configuration
├── icon.png       ← App icon
├── demo.webp      ← Demo preview
└── README.md      ← This file
```
