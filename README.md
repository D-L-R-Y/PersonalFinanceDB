# Personal Finance Database

A modern, standalone personal finance tracker running as a desktop app, powered by a real **SQLite database** stored entirely on your local machine.

<img width="929" height="977" alt="demo" src="https://github.com/user-attachments/assets/46008b44-0088-4444-ac1b-d81b9106dd51" />


---

## How to Install and Run

### Option 1: Direct Download (Recommended)
The easiest way to get started is to download the pre-built desktop app. No installation or coding experience required.

1. Go to the [Releases](../../releases/latest) page.
2. Download the `FinanceDB Setup.exe` file.
3. Double-click the downloaded file to install and run the app.

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

### Option 3: Run in Development Mode
To test the app locally without building the `.exe`:
```bash
npm install
npm start
```

Since the core uses Web technologies, you can still just double-click `index.html` in your file explorer to open it in Chrome/Edge, though the desktop app provides a more integrated experience.

---

## Features

| Feature | Description |
|---|---|
| 📊 Dashboard | Summary cards + donut chart of spending by category |
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

This application is fundamentally a web app packaged into a desktop executable. Here is how the pieces fit together:

1. **In-Memory Database**: Instead of running a traditional database server, the app uses `sql.js` (SQLite compiled to WebAssembly). This allows a fully functional, relational SQL database to run directly inside the app's memory.
2. **Local Persistence**: Every time you add or delete a transaction, the app takes a snapshot of the active database and saves it directly to your computer's local storage. When you open the app again, it reloads that snapshot back into memory.
3. **100% Offline & Private**: Because it runs entirely through Electron (which bundles a browser engine into a `.exe`), all your financial data stays securely on your device. There is no cloud sync, no tracking, and no internet connection required.
4. **Data Portability**: The database operates as a standard SQLite format. The "Export .db" feature lets you download your data as a real `.db` file that can be opened in any standard SQLite database viewer or imported back into the app later.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Desktop Framework| Electron + electron-builder |
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
