' Duplo clique. Não pede comando ao operador.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("Wscript.Shell")
pasta = fso.GetParentFolderName(fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName)))
sh.CurrentDirectory = pasta
node = ""
For Each candidato In Array(sh.ExpandEnvironmentStrings("%ProgramFiles%") & "\nodejs\node.exe", sh.ExpandEnvironmentStrings("%LocalAppData%") & "\Programs\nodejs\node.exe")
  If fso.FileExists(candidato) Then node = candidato
Next
If node = "" Then
  MsgBox "Este computador ainda não tem o Node.js necessário para o conector. O assistente não instala Python e não pede comando. Instale o Node.js 22 ou superior pelo canal oficial e abra este atalho de novo.", vbExclamation, "Grupo TM SEG"
  sh.Run "https://nodejs.org/en/download"
  WScript.Quit 1
End If
pacote = pasta & "\desktop\whatsapp-desktop\conector.mjs"
If Not fso.FileExists(pacote) Then
  MsgBox "O pacote do conector ainda não foi gerado nesta pasta. Abra o sistema e use Atualizar aplicativo depois que a equipe entregar o pacote.", vbExclamation, "Grupo TM SEG"
  WScript.Quit 1
End If
sh.Run """" & node & """ """ & pacote & """", 0, False
WScript.Sleep 1200
sh.Run "http://127.0.0.1:47321/"
