@echo off
chcp 65001 >nul
title Cashflow Infosys
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo No se encontro Node.js / npm. Instalalo desde https://nodejs.org
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Instalando dependencias, puede tardar unos minutos...
  call npm install
  if errorlevel 1 (
    echo Fallo la instalacion de dependencias.
    pause
    exit /b 1
  )
)

echo Levantando Cashflow Infosys en http://localhost:3005
echo Para cerrarla, cerra esta ventana o apreta Ctrl+C.
start "" cmd /c "timeout /t 4 /nobreak >nul & start http://localhost:3005"
call npx vite --port=3005 --host=0.0.0.0 --strictPort

echo.
echo La app se detuvo. Si dice que el puerto 3005 esta ocupado, probablemente ya esta abierta en otra ventana.
pause
