# Form Studio 一键启动脚本
# ---------------------------------------------------------------------------
# 用途：更新依赖、启动本地后台，并自动打开浏览器进入作者工作台。
#       双击项目根目录的 start-form-studio.bat 即可；它会把参数转发到本脚本。
#
# 维护语义（“定期维护可更新”）：
#   · git pull：配置了远端时才拉取，否则明确跳过而不报错
#   · npm install：按 package.json / package-lock.json 内容指纹判断，仅变化时重装
#   · 可选 npm run check：结构 + 行为回归
#   · 每次启动 / 退出写一行到 logs/form-studio-YYYYMMDD.log（按天自动轮换）
#
# 行为约定：
#   · 端口已运行同一源码与模式 → 复用；源码或模式已变化 → 核实进程身份后自动重启
#   · 端口被其它程序占用 → 明确报错退出
#   · 首次启动 → 延迟 2 秒自动打开浏览器（等服务器就绪）
#
# 用法（在 .bat 后追加参数，或直接运行本脚本）：
#   start-form-studio.bat                    更新并启动 demo（默认）
#   start-form-studio.bat -Mode product      以 product 模式启动
#   start-form-studio.bat -UpdateOnly        只更新，不启动
#   start-form-studio.bat -SkipUpdate        跳过更新，直接启动
#   start-form-studio.bat -Check             启动前先跑 npm run check
#   start-form-studio.bat -NoBrowser         不自动打开浏览器
#   start-form-studio.bat -Loop              服务退出后自动重启
#   start-form-studio.bat -Port 4200         改用 4200 端口
# ---------------------------------------------------------------------------

[CmdletBinding()]
param(
    [ValidateSet("demo", "product")]
    [string]$Mode = "demo",

    [ValidateRange(1, 65535)]
    [int]$Port = 4190,

    [switch]$UpdateOnly,
    [switch]$SkipUpdate,
    [switch]$Check,
    [switch]$NoBrowser,
    [switch]$Loop
)

$ErrorActionPreference = "Stop"

# —— 定位项目根目录（本脚本位于 scripts/ 下）——
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$LogDir  = Join-Path $ProjectRoot "logs"
$LogFile = Join-Path $LogDir ("form-studio-{0}.log" -f (Get-Date -Format "yyyyMMdd"))
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }

try { $Host.UI.RawUI.WindowTitle = "Form Studio ($Mode :$Port)" } catch { }

function Write-Log([string]$Line) {
    $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $LogFile -Value ("{0}  {1}" -f $stamp, $Line)
}

# 依赖指纹：只在 package.json / package-lock.json 内容真正变化时才 npm install
function Get-DepsFingerprint {
    $parts = @()
    foreach ($f in @((Join-Path $ProjectRoot "package.json"), (Join-Path $ProjectRoot "package-lock.json"))) {
        if (Test-Path $f) { $parts += (Get-FileHash -Path $f -Algorithm SHA256).Hash }
        else { $parts += "missing" }
    }
    return ($parts -join "|")
}

# 运行时指纹覆盖服务端、浏览器代码、合同与 canonical mock catalog；SQLite 运行副本不参与。
function Get-RuntimeFingerprint {
    $files = @()
    foreach ($relative in @("server.mjs", "package.json", "package-lock.json", "data/mock-agents.json")) {
        $path = Join-Path $ProjectRoot $relative
        if (Test-Path -LiteralPath $path) { $files += Get-Item -LiteralPath $path }
    }
    foreach ($relative in @("src", "public", "contracts")) {
        $path = Join-Path $ProjectRoot $relative
        if (Test-Path -LiteralPath $path) {
            $files += Get-ChildItem -LiteralPath $path -Recurse -File
        }
    }
    $parts = foreach ($file in @($files | Sort-Object FullName -Unique)) {
        $relativePath = $file.FullName.Substring($ProjectRoot.Length).TrimStart([char[]]"\/").Replace("\", "/")
        "{0}|{1}" -f $relativePath, (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
    }
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [Text.Encoding]::UTF8.GetBytes(($parts -join "`n"))
        return ([BitConverter]::ToString($sha.ComputeHash($bytes)).Replace("-", "").ToLowerInvariant()).Substring(0, 16)
    }
    finally { $sha.Dispose() }
}

function Get-RunningHealth([string]$url) {
    try {
        $health = Invoke-RestMethod -Uri "$url/api/health" -TimeoutSec 3 -ErrorAction Stop
        if ($health.application -eq "form-studio") { return $health }
    }
    catch { }
    return $null
}

function Test-LegacyFormStudio([string]$url) {
    try {
        $response = Invoke-WebRequest -Uri "$url/api/session" -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
        $payload = $response.Content | ConvertFrom-Json
        return $null -ne $payload.mode
    }
    catch {
        if ($_.Exception.Response) {
            try {
                $reader = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
                $payload = $reader.ReadToEnd() | ConvertFrom-Json
                return ($null -ne $payload.mode) -or ($payload.errorCode -eq "identity_provider_unconfigured")
            }
            catch { }
        }
    }
    return $false
}

function Invoke-Update {
    Write-Host ""
    Write-Host "== 更新 Form Studio ==" -ForegroundColor Cyan

    # 1) git pull（仅当配置了远端）
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        Write-Host "  [跳过] 未找到 git，跳过拉取" -ForegroundColor Yellow
    }
    else {
        $remote = @(git remote 2>$null)
        if (-not $remote) {
            Write-Host "  [跳过] 未配置 git 远端，跳过拉取（本地版本照常启动）" -ForegroundColor Yellow
        }
        else {
            Write-Host "  git pull --ff-only" -ForegroundColor DarkGray
            git pull --ff-only
            if ($LASTEXITCODE -ne 0) {
                Write-Host "  [警告] git pull 失败，继续使用当前本地版本" -ForegroundColor Yellow
            }
        }
    }

    # 2) 依赖刷新（按内容指纹）
    $nmPath    = Join-Path $ProjectRoot "node_modules"
    $sentinel  = Join-Path $nmPath ".form-studio-deps.sentinel"
    $fingerprint = Get-DepsFingerprint
    $saved     = if (Test-Path $sentinel) { (Get-Content -Raw $sentinel).Trim() } else { "" }
    $needInstall = (-not (Test-Path $nmPath)) -or ($saved -ne $fingerprint)

    if ($needInstall) {
        Write-Host "  npm install（依赖已变化）" -ForegroundColor DarkGray
        npm install
        if ($LASTEXITCODE -ne 0) { throw "npm install 失败，终止启动" }
        Set-Content -Path $sentinel -Value $fingerprint -NoNewline
    }
    else {
        Write-Host "  [跳过] 依赖无变化" -ForegroundColor DarkGray
    }

    # 3) 可选：结构 + 行为回归
    if ($Check) {
        Write-Host "  npm run check" -ForegroundColor DarkGray
        npm run check
        if ($LASTEXITCODE -ne 0) { throw "npm run check 未通过，终止启动" }
    }

    Write-Host "== 更新完成 ==" -ForegroundColor Cyan
}

function Invoke-RunServer {
    $serverArgs = @("server.mjs")
    if ($Mode -eq "demo") { $serverArgs += "--demo-mode" }
    $env:FORM_STUDIO_PORT = [string]$Port
    $env:FORM_STUDIO_RUNTIME_REVISION = $RuntimeRevision

    Write-Log "start  mode=$Mode port=$Port"
    # 前台运行：node 的输出实时显示在本窗口；退出码用于判断是否崩溃
    & node @serverArgs
    $code = $LASTEXITCODE
    Write-Log "exit   code=$code"
    return $code
}

# 以独立进程延迟打开浏览器：不随本脚本提前退出而被杀
function Start-DelayedBrowser([string]$url) {
    $inner = "Start-Sleep -Seconds 2; Start-Process '$url'"
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($inner))
    Start-Process -FilePath "powershell.exe" -WindowStyle Hidden -ArgumentList "-NoProfile","-EncodedCommand",$encoded
}

Write-Host ""
Write-Host "Form Studio 启动器" -ForegroundColor Green
Write-Host "  项目：$ProjectRoot"
Write-Host "  模式：$Mode    端口：$Port"
Write-Host "  日志：$LogFile"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host ""
    Write-Host "[错误] 未找到 node。请先安装 Node.js >= 22.13（https://nodejs.org）。" -ForegroundColor Red
    exit 1
}

if ($UpdateOnly) {
    Invoke-Update
    Write-Host ""
    Write-Host "已更新（未启动服务）。" -ForegroundColor Green
    exit 0
}

if (-not $SkipUpdate) { Invoke-Update }

$url = "http://127.0.0.1:$Port"
$RuntimeRevision = Get-RuntimeFingerprint
Write-Host "  运行指纹：$RuntimeRevision" -ForegroundColor DarkGray

# —— 端口占用：只复用同一源码；确认是旧 Form Studio 后自动重启 ——
if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
    $listener = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($listener.Count) {
        $health = Get-RunningHealth $url
        if ($health -and $health.runtimeRevision -eq $RuntimeRevision -and $health.mode -eq $Mode) {
            Write-Host ""
            Write-Host "Form Studio 当前源码已在运行：$url" -ForegroundColor Green
            if (-not $NoBrowser) { Start-Process $url }
            Write-Host "已复用同一运行指纹。" -ForegroundColor DarkGray
            exit 0
        }

        $legacyFormStudio = (-not $health) -and (Test-LegacyFormStudio $url)
        $ownerPid = [int]$listener[0].OwningProcess
        $process = Get-CimInstance Win32_Process -Filter "ProcessId = $ownerPid" -ErrorAction SilentlyContinue
        $verifiedNodeServer = $process -and $process.Name -match '^node(.exe)?$' -and $process.CommandLine -match '(^|[\\/\s])server\.mjs([\s\"'']|$)'
        if (($health -or $legacyFormStudio) -and $verifiedNodeServer) {
            $oldRevision = if ($health) { [string]$health.runtimeRevision } else { "旧版（无健康指纹）" }
            Write-Host ""
            Write-Host "检测到已加载的旧实例：$oldRevision；正在切换到 $RuntimeRevision …" -ForegroundColor Yellow
            Stop-Process -Id $ownerPid -ErrorAction Stop
            for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
                if (-not (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)) { break }
                Start-Sleep -Milliseconds 250
            }
            if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
                throw "旧 Form Studio 未能释放端口 $Port；请关闭旧启动窗口后重试"
            }
            Write-Log "restart stale_pid=$ownerPid old_revision=$oldRevision new_revision=$RuntimeRevision"
        }
        else {
            Write-Host ""
            Write-Host "[错误] 端口 $Port 已被其它程序占用，无法启动。" -ForegroundColor Red
            Write-Host "       未能同时确认健康响应与 node server.mjs 进程，启动器不会强制终止它。" -ForegroundColor Yellow
            exit 1
        }
    }
}

# —— 启动 ——
if (-not $NoBrowser) { Start-DelayedBrowser $url }

Write-Host ""
Write-Host "启动 Form Studio ($Mode) → $url" -ForegroundColor Green
Write-Host "按 Ctrl+C 或关闭本窗口即可停止。" -ForegroundColor DarkGray
Write-Host ""

if ($Loop) {
    while ($true) {
        $code = Invoke-RunServer
        Write-Host ""
        Write-Host "[已退出] 进程退出（代码 $code），3 秒后自动重启（-Loop）..." -ForegroundColor Yellow
        Start-Sleep -Seconds 3
    }
}
else {
    $code = Invoke-RunServer
    Write-Host ""
    if ($code -ne 0) {
        Write-Host "Form Studio 已退出（代码 $code）。" -ForegroundColor Red
    }
    else {
        Write-Host "Form Studio 已停止。" -ForegroundColor Cyan
    }
}
