@echo off
rem Abre la aplicacion en modo demostracion (datos ficticios, sin Supabase).
rem Doble clic en este archivo. Para detenerla, cierra esta ventana.
cd /d "%~dp0app"
if not exist node_modules (
  echo Instalando dependencias por primera vez...
  call npm install --no-fund --no-audit
)
start "" http://localhost:5173
call npm run dev -- --port 5173 --strictPort
pause
