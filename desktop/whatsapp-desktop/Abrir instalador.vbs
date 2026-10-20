' Duplo clique. Não pede comando ao operador.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("Wscript.Shell")
pastaScript = fso.GetParentFolderName(WScript.ScriptFullName)
If fso.FileExists(pastaScript & "\conector.mjs") Then
  pasta = pastaScript
  pacote = pastaScript & "\conector.mjs"
Else
  pasta = fso.GetParentFolderName(fso.GetParentFolderName(pastaScript))
  pacote = pasta & "\desktop\whatsapp-desktop\conector.mjs"
End If
sh.CurrentDirectory = pasta
node = ""
For Each candidato In Array(sh.ExpandEnvironmentStrings("%ProgramFiles%") & "\nodejs\node.exe", sh.ExpandEnvironmentStrings("%LocalAppData%") & "\Programs\nodejs\node.exe")
  If fso.FileExists(candidato) Then node = candidato
Next
If node = "" Then
  sh.Run "winget install --id OpenJS.NodeJS.LTS -e --scope user --accept-package-agreements --accept-source-agreements --disable-interactivity", 1, True
  For Each candidato In Array(sh.ExpandEnvironmentStrings("%ProgramFiles%") & "\nodejs\node.exe", sh.ExpandEnvironmentStrings("%LocalAppData%") & "\Programs\nodejs\node.exe")
    If fso.FileExists(candidato) Then node = candidato
  Next
End If
If node = "" Then
  MsgBox "O Node.js não foi instalado. O assistente precisa dele para continuar e instalar Python e WhatsApp. Abra o canal oficial e execute este atalho de novo.", vbExclamation, "Grupo TM SEG"
  sh.Run "https://nodejs.org/en/download"
  WScript.Quit 1
End If
If Not fso.FileExists(pacote) Then
  MsgBox "O pacote do conector ainda não foi gerado nesta pasta. Abra o sistema e use Atualizar aplicativo depois que a equipe entregar o pacote.", vbExclamation, "Grupo TM SEG"
  WScript.Quit 1
End If
sh.Run """" & node & """ """ & pacote & """", 0, False
WScript.Sleep 1200
sh.Run "http://127.0.0.1:47321/"
