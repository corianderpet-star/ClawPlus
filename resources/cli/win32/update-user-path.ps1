param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('add', 'remove')]
  [string]$Action,

  [Parameter(Mandatory = $true)]
  [string]$CliDir
)

$ErrorActionPreference = 'Stop'

# Normalize a PATH entry for comparison only.
# Expands %VAR% references so that "%APPDATA%\npm" matches "C:\Users\...\npm".
# The original (unexpanded) value is preserved separately for writing back.
function Normalize-PathEntry {
  param([string]$Value)

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return ''
  }

  $cleaned = $Value.Trim().Trim('"')
  $expanded = [Environment]::ExpandEnvironmentVariables($cleaned)
  return $expanded.TrimEnd('\').ToLowerInvariant()
}

# ── Read raw PATH from the registry WITHOUT expanding %VAR% references ──
# Using direct registry API instead of [Environment]::GetEnvironmentVariable
# to preserve REG_EXPAND_SZ type and unexpanded variable references.
$current = ''
$valueKind = [Microsoft.Win32.RegistryValueKind]::ExpandString

$regKey = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment', $false)
if ($null -ne $regKey) {
  try {
    $current = $regKey.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
    $valueKind = $regKey.GetValueKind('Path')
  }
  catch {
    $current = ''
  }
  $regKey.Close()
}

$entries = @()
if (-not [string]::IsNullOrWhiteSpace($current)) {
  $entries = $current -split ';' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
}

$target = Normalize-PathEntry $CliDir
$seen = [System.Collections.Generic.HashSet[string]]::new()
$nextEntries = New-Object System.Collections.Generic.List[string]
$targetAlreadyPresent = $false

foreach ($entry in $entries) {
  $normalized = Normalize-PathEntry $entry
  if ([string]::IsNullOrWhiteSpace($normalized)) {
    continue
  }

  # Track whether the target was already in the PATH
  if ($normalized -eq $target) {
    $targetAlreadyPresent = $true
    continue
  }

  if ($seen.Add($normalized)) {
    # Preserve the original entry (may contain %VAR% references)
    $nextEntries.Add($entry.Trim().Trim('"'))
  }
}

# Determine if the PATH actually needs to change
$duplicatesRemoved = ($entries.Count -gt ($nextEntries.Count + $(if ($targetAlreadyPresent) { 1 } else { 0 })))
$status = 'already-present'

if ($Action -eq 'add') {
  $nextEntries.Add($CliDir)
  if (-not $targetAlreadyPresent -or $duplicatesRemoved) {
    $status = 'updated'
  }
}
else {
  # remove action
  if ($targetAlreadyPresent -or $duplicatesRemoved) {
    $status = 'updated'
  }
}

# ── Only write to the registry when something actually changed ──
# Skipping redundant writes avoids broadcasting WM_SETTINGCHANGE unnecessarily,
# which can disrupt Explorer's environment variable expansion (e.g. nvm's
# %NVM_SYMLINK% in the System PATH) and cause tools like npm to "disappear".
if ($status -eq 'updated') {
  $regKeyW = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment', $true)
  if ($null -eq $regKeyW) {
    $regKeyW = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Environment')
  }

  if ($nextEntries.Count -eq 0) {
    try { $regKeyW.DeleteValue('Path', $false) } catch { }
  }
  else {
    $newPath = $nextEntries -join ';'
    # Preserve the original registry value kind (REG_EXPAND_SZ / REG_SZ).
    # This prevents converting REG_EXPAND_SZ → REG_SZ which would permanently
    # destroy %VAR% references (e.g. %APPDATA%\npm, %NVM_HOME%) in the PATH.
    $regKeyW.SetValue('Path', $newPath, $valueKind)
  }
  $regKeyW.Close()

  # NOTE: WM_SETTINGCHANGE broadcast is intentionally NOT done here.
  # Broadcasting from PowerShell causes two issues:
  #   1) Add-Type C# compilation fails on non-English locale systems (encoding
  #      mismatch between the C# compiler and PowerShell's temp file handling).
  #   2) When Explorer receives WM_SETTINGCHANGE and rebuilds PATH, environment
  #      variable references like %NVM_HOME% in System PATH may not be expanded
  #      correctly (Windows environment-reload ordering race condition), causing
  #      tools like node/python to "disappear" from PATH.
  # The NSIS installer broadcasts natively via SendMessage after calling this
  # script.  Runtime calls (autoInstallCliIfNeeded) skip the broadcast entirely
  # — the registry change takes effect for new sessions after next login.
}

Write-Output $status
