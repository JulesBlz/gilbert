# Ce qui joue (Spotify ou tout autre lecteur) et les commandes de lecture (Windows 10/11),
# via les contrôles multimédias du système.
#   powershell -File win-music.ps1 [status|playpause|next|previous] → JSON { player, playing, title, artist, album }
param([string]$Cmd = 'status')
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]
function Await($op, [Type]$type) {
  $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
  $task.Wait(-1) | Out-Null
  $task.Result
}
$manager = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$session = $manager.GetCurrentSession()
if (-not $session) { '{"player":"","playing":false,"title":"","artist":"","album":""}'; exit }
switch ($Cmd) {
  'playpause' { Await ($session.TryTogglePlayPauseAsync()) ([bool]) | Out-Null; Start-Sleep -Milliseconds 400 }
  'next' { Await ($session.TrySkipNextAsync()) ([bool]) | Out-Null; Start-Sleep -Milliseconds 600 }
  'previous' { Await ($session.TrySkipPreviousAsync()) ([bool]) | Out-Null; Start-Sleep -Milliseconds 600 }
}
$props = Await ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
$info = $session.GetPlaybackInfo()
$player = $session.SourceAppUserModelId -replace '\.exe$', '' -replace '^.*[\\!]', ''
@{
  player = $player; playing = ($info.PlaybackStatus -eq 'Playing')
  title = $props.Title; artist = $props.Artist; album = $props.AlbumTitle
} | ConvertTo-Json -Compress
