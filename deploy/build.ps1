#requires -Version 5.1
<#
在可联网的 Windows 上构建测试环境的全部镜像，默认推送到内网仓库。
需要 Docker Desktop 处于 Linux 容器模式。
在项目根目录执行：powershell -ExecutionPolicy Bypass -File .\deploy\build.ps1
构建和推送不需要节点 IP，节点地址只在部署时填写。
加 -Mode export 只导出 images.tar；加 -Mode both 同时推送和导出。
#>
[CmdletBinding()]
param(
    [ValidateSet('push', 'export', 'both')]
    [string]$Mode = 'push',
    [string]$Registry = 'sealos.hub:5000/opsiforce',
    [ValidatePattern('^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$')]
    [string]$Tag = 'local',
    [ValidateSet('linux/amd64', 'linux/arm64')]
    [string]$Platform = 'linux/amd64'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Archive = Join-Path $PSScriptRoot 'images.tar'
$PartialArchive = "$Archive.partial"
$SourceRegistry = 'registry.cn-beijing.aliyuncs.com/mayc'

# PowerShell 5.1 不会因外部命令失败而自动停止，逐条检查 Docker 退出码。
function Invoke-Docker {
    param([string[]]$DockerArgs)
    & docker @DockerArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Docker 命令失败（退出码 $LASTEXITCODE），已停止。修复上方错误后重跑即可复用构建缓存。"
    }
}

try {
    $Registry = $Registry.TrimEnd('/')
    if ($Registry -cnotmatch '^[a-z0-9][a-z0-9.-]*(:[0-9]+)?(/[a-z0-9][a-z0-9._-]*)+$') {
        throw 'Registry 请填写 主机[:端口]/命名空间，不要包含 http(s)://。'
    }
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw '未找到 Docker，请先安装并启动 Docker Desktop。'
    }
    $Engine = Invoke-Docker -DockerArgs @('info', '--format', '{{.OSType}}')
    if (($Engine -join '').Trim() -ne 'linux') {
        throw '请将 Docker Desktop 切换到 Linux 容器模式。'
    }

    $Images = @()
    $Components = @('backend', 'frontend', 'runtime-proxy', 'agent')
    foreach ($Component in $Components) {
        # 先使用统一的本地标签，推送时再按目标仓库打标签。
        $Image = "opsiforce/opsiforce-${Component}:$Tag"
        Write-Host "构建镜像：$Image"
        $BuildArgs = @('buildx', 'build', '--load', '--platform', $Platform,
            '-t', $Image, '-f', (Join-Path $PSScriptRoot "docker/Dockerfile.$Component"))
        Invoke-Docker -DockerArgs ($BuildArgs + @($ProjectRoot))
        $Images += $Image
    }

    # 将第三方运行镜像一并准备好，内网不需要再执行 sync。
    $Dependencies = @('nginx:1.28.0-alpine', 'bifrost:v2.0.0',
        'gotenberg:8.36.0-libreoffice', 'postgres:16.4-alpine', 'redis:7.4.1-alpine')
    foreach ($Dependency in $Dependencies) {
        Write-Host "准备运行镜像：$Dependency"
        Invoke-Docker -DockerArgs @('pull', '--platform', $Platform, "$SourceRegistry/$Dependency")
        Invoke-Docker -DockerArgs @('tag', "$SourceRegistry/$Dependency", "opsiforce/$Dependency")
        $Images += "opsiforce/$Dependency"
    }

    if ($Mode -eq 'export' -or $Mode -eq 'both') {
        Write-Host '正在导出全部 9 个镜像，镜像包较大，请等待完成。'
        # 使用 --output 写二进制包，避免 PowerShell 重定向损坏文件。
        Invoke-Docker -DockerArgs (@('save', '--output', $PartialArchive) + $Images)
        Move-Item -LiteralPath $PartialArchive -Destination $Archive -Force
        Write-Host "打包完成：$Archive"
    }

    if ($Mode -eq 'push' -or $Mode -eq 'both') {
        foreach ($Image in $Images) {
            $TargetImage = "$Registry/" + $Image.Substring('opsiforce/'.Length)
            Write-Host "推送镜像：$TargetImage"
            Invoke-Docker -DockerArgs @('tag', $Image, $TargetImage)
            Invoke-Docker -DockerArgs @('push', $TargetImage)
        }
        Write-Host "全部 9 个镜像已推送到：$Registry"
    }

    $TagPrefix = ''
    if ($Tag -ne 'local') { $TagPrefix = "TAG=$Tag " }
    $RegistryOption = ''
    if ($Registry -ne 'sealos.hub:5000/opsiforce') { $RegistryOption = " --registry $Registry" }
    Write-Host '将 deploy 目录复制到内网虚拟机，在该目录执行：'
    if ($Mode -eq 'export') {
        Write-Host '  请一并复制 images.tar，然后执行：'
        Write-Host "  docker login $($Registry.Split('/')[0])"
        Write-Host "  ${TagPrefix}bash deploy.sh import$RegistryOption"
    }
    Write-Host '  将下面的“节点IP”替换成 Kubernetes 节点地址：'
    Write-Host "  ${TagPrefix}bash deploy.sh deploy --node-ip 节点IP$RegistryOption"
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
} finally {
    if (Test-Path -LiteralPath $PartialArchive) {
        Remove-Item -LiteralPath $PartialArchive -Force
    }
}
