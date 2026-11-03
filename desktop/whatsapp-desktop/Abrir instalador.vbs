' Duplo clique. Não pede comando ao operador.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("Wscript.Shell")

' O atalho de 32 bits não enxerga o Node em "Program Files" nem o winget.
If InStr(1, WScript.FullName, "SysWOW64", vbTextCompare) > 0 Then
  sh.Run """" & sh.ExpandEnvironmentStrings("%SystemRoot%") & "\Sysnative\wscript.exe"" //nologo """ & WScript.ScriptFullName & """", 1, True
  WScript.Quit 0
End If

pastaScript = fso.GetParentFolderName(WScript.ScriptFullName)
If fso.FileExists(pastaScript & "\conector.mjs") Then
  pasta = pastaScript
  pacote = pastaScript & "\conector.mjs"
Else
  pasta = fso.GetParentFolderName(fso.GetParentFolderName(pastaScript))
  pacote = pasta & "\desktop\whatsapp-desktop\conector.mjs"
End If
sh.CurrentDirectory = pasta

Function AcharNode()
  Dim lista, item
  lista = Array( _
    sh.ExpandEnvironmentStrings("%ProgramFiles%") & "\nodejs\node.exe", _
    sh.ExpandEnvironmentStrings("%ProgramW6432%") & "\nodejs\node.exe", _
    "C:\Program Files\nodejs\node.exe", _
    sh.ExpandEnvironmentStrings("%LocalAppData%") & "\Programs\nodejs\node.exe" _
  )
  For Each item In lista
    If item <> "" And fso.FileExists(item) Then
      AcharNode = item
      Exit Function
    End If
  Next
  AcharNode = ""
End Function

node = AcharNode()
If node = "" Then
  powershell = sh.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\WindowsPowerShell\v1.0\powershell.exe"
  scriptNode = pastaScript & "\instalar-node.ps1"
  If Not fso.FileExists(scriptNode) Then scriptNode = pasta & "\desktop\whatsapp-desktop\instalar-node.ps1"
  If fso.FileExists(scriptNode) Then
    sh.Run """" & powershell & """ -NoProfile -ExecutionPolicy Bypass -File """ & scriptNode & """", 1, True
    node = AcharNode()
  End If
End If
If node = "" Then
  MsgBox "O Node.js não foi instalado. O assistente tentou o winget e o pacote oficial. Feche outros instaladores e execute este atalho de novo.", vbExclamation, "Grupo TM SEG"
  WScript.Quit 1
End If
If Not fso.FileExists(pacote) Then
  MsgBox "O pacote do conector ainda não foi gerado nesta pasta. Abra o sistema e use Atualizar aplicativo depois que a equipe entregar o pacote.", vbExclamation, "Grupo TM SEG"
  WScript.Quit 1
End If
sh.Run """" & node & """ """ & pacote & """", 0, False
WScript.Sleep 1200
sh.Run "http://127.0.0.1:47321/"
