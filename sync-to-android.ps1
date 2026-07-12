# ============================================================
#  sync-to-android.ps1
#  Syncs web assets from "Personal Finance Database" into
#  the FinanceDB Capacitor Android project.
#
#  Usage (run from D:\Personal Finance Database\):
#    .\sync-to-android.ps1
#
#  Optional flags:
#    -SkipCapSync   Copy files only, skip "npx cap sync android"
#    -Force         Copy all files even if unchanged (no hash check)
# ============================================================

param (
    [switch]$SkipCapSync,
    [switch]$Force
)

# ── Configuration ────────────────────────────────────────────
$SOURCE = $PSScriptRoot                   # D:\Personal Finance Database
$TARGET = "D:\FinanceDB_Android"
$WWW    = "$TARGET\www"

# Files to sync from source root -> www root
$ROOT_FILES = @(
    "index.html",
    "style.css",
    "app.js",
    "icon.png"
)

# Subfolders to sync completely
$SYNC_DIRS = @( "vendor" )
# ─────────────────────────────────────────────────────────────

function Write-Header  { param($msg) Write-Host "`n$msg" -ForegroundColor Cyan }

function Get-FileHashSafe {
    param([string]$Path)
    if (Test-Path $Path) { return (Get-FileHash -Path $Path -Algorithm MD5).Hash }
    return $null
}

$script:nCopied  = 0
$script:nUpdated = 0
$script:nSkipped = 0

function Sync-File {
    param([string]$Src, [string]$Dst)
    $leaf = Split-Path $Dst -Leaf
    if (-not (Test-Path $Src)) {
        Write-Host "  [MISSING]  $leaf" -ForegroundColor Red; return
    }
    $dstDir = Split-Path $Dst -Parent
    if (-not (Test-Path $dstDir)) { New-Item -ItemType Directory -Path $dstDir -Force | Out-Null }

    if (-not $Force) {
        if ((Get-FileHashSafe $Src) -eq (Get-FileHashSafe $Dst)) {
            Write-Host "  [skipped]  $leaf" -ForegroundColor DarkGray
            $script:nSkipped++; return
        }
    }
    $isUpdate = Test-Path $Dst
    Copy-Item -Path $Src -Destination $Dst -Force
    if ($isUpdate) {
        Write-Host "  [UPDATED]  $leaf" -ForegroundColor Yellow; $script:nUpdated++
    } else {
        Write-Host "  [COPIED]   $leaf" -ForegroundColor Green;  $script:nCopied++
    }
}

# ── Validate ─────────────────────────────────────────────────
if (-not (Test-Path $TARGET)) { Write-Host "[ERROR] Android project not found: $TARGET" -ForegroundColor Red; exit 1 }
if (-not (Test-Path $WWW))    { New-Item -ItemType Directory -Path $WWW -Force | Out-Null }

# ── Step 1: Root files ────────────────────────────────────────
Write-Header "Step 1/3 — Syncing web assets to $WWW"
foreach ($file in $ROOT_FILES) { Sync-File -Src "$SOURCE\$file" -Dst "$WWW\$file" }

# ── Step 2: Sub-directories ───────────────────────────────────
foreach ($dir in $SYNC_DIRS) {
    $srcDir = "$SOURCE\$dir"
    $dstDir = "$WWW\$dir"
    if (-not (Test-Path $srcDir)) { Write-Host "  [MISSING dir] $dir\" -ForegroundColor Red; continue }
    Write-Host "`n  Syncing folder: $dir\" -ForegroundColor DarkCyan
    Get-ChildItem -Path $srcDir -Recurse -File | ForEach-Object {
        $rel = $_.FullName.Substring($srcDir.Length + 1)
        Sync-File -Src $_.FullName -Dst "$dstDir\$rel"
    }
}

# ── Summary ───────────────────────────────────────────────────
Write-Header "Step 2/3 — Summary"
Write-Host ("  New      : {0}" -f $script:nCopied)  -ForegroundColor Green
Write-Host ("  Updated  : {0}" -f $script:nUpdated) -ForegroundColor Yellow
Write-Host ("  Skipped  : {0}" -f $script:nSkipped) -ForegroundColor DarkGray

if (($script:nCopied + $script:nUpdated) -eq 0) {
    Write-Host "`n  Android www is already up-to-date." -ForegroundColor Cyan
}

# ── Step 3: Capacitor sync ────────────────────────────────────
Write-Header "Step 3/3 — Capacitor sync"
if ($SkipCapSync) {
    Write-Host "  -SkipCapSync set. Run manually:" -ForegroundColor DarkGray
    Write-Host "    cd '$TARGET' ; npx cap sync android" -ForegroundColor DarkGray
} else {
    Push-Location $TARGET
    npx cap sync android
    $code = $LASTEXITCODE
    Pop-Location
    if ($code -ne 0) { Write-Host "`n  [ERROR] cap sync failed (exit $code)" -ForegroundColor Red; exit 1 }
    Write-Host "`n  Done! Open Android Studio to build / run." -ForegroundColor Cyan
}
Write-Host ""
