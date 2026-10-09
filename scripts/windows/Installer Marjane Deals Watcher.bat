@echo off
chcp 65001 >nul
title Marjane Deals Watcher
echo.
echo === Marjane Deals Watcher : installation et demarrage (version optimisee) ===
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERREUR] Node.js est introuvable. Installez Node.js 22 LTS : https://nodejs.org puis relancez ce fichier.
  pause
  exit /b 1
)
for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set NODEMAJOR=%%v
echo Node.js detecte : version %NODEMAJOR%
if %NODEMAJOR% LSS 22 (
  echo [ERREUR] Node.js 22 ou plus recent est requis. Installez la version LTS : https://nodejs.org
  pause
  exit /b 1
)

where git >nul 2>nul
if errorlevel 1 (
  echo [ERREUR] Git est introuvable. Installez Git : https://git-scm.com/download/win puis relancez ce fichier.
  pause
  exit /b 1
)

set "APPDIR=%USERPROFILE%\MJ_Scrap"
if not exist "%APPDIR%\.git" (
  echo Telechargement du projet dans %APPDIR% ...
  git clone https://github.com/trotinat/MJ_Scrap.git "%APPDIR%"
  if errorlevel 1 ( echo [ERREUR] git clone a echoue. & pause & exit /b 1 )
) else (
  echo Recherche de mises a jour ...
  git -C "%APPDIR%" pull --ff-only
)
cd /d "%APPDIR%"

where pnpm >nul 2>nul
if errorlevel 1 (
  echo Installation de pnpm ...
  call npm install -g pnpm@10.28.0
  if errorlevel 1 ( echo [ERREUR] installation de pnpm impossible. & pause & exit /b 1 )
)

echo.
echo Installation des dependances ...
call pnpm install
if errorlevel 1 ( echo [ERREUR] pnpm install a echoue. & pause & exit /b 1 )

echo.
echo Verification de Chromium pour le scraper ...
call pnpm setup:browser
if errorlevel 1 ( echo [ATTENTION] Chromium non installe : les listes filtrees ne pourront pas etre lues. )

echo.
echo Demarrage de la version optimisee :
echo  - la premiere fois (et apres chaque mise a jour) l'application est compilee : 2 a 5 minutes ;
echo  - ensuite elle demarre en quelques secondes.
echo Le navigateur s'ouvre tout seul sur http://localhost:3000 quand l'application est prete.
echo Identifiants : affiches ci-dessous au premier lancement, et dans %APPDIR%\.env
echo Fermez cette fenetre ou Ctrl+C pour arreter.
echo.
set OPEN_BROWSER=1
call pnpm start:prod
pause
