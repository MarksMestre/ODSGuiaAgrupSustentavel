@echo off
setlocal
rem Um duplo clique neste ficheiro reconstrói o site e abre-o.
rem Não é preciso saber programar.

cd /d "%~dp0"

echo.
echo ============================================
echo   Kit Agrupamento Sustentavel
echo ============================================
echo.

rem ---- 1. Python -------------------------------------------------------
where python >nul 2>&1
if errorlevel 1 (
  echo [1/4] Python nao encontrado.
  echo.
  echo   Instale o Python 3.11 ou superior em https://www.python.org/downloads/
  echo   e marque "Add Python to PATH" durante a instalacao.
  echo.
  pause
  exit /b 1
)
echo [1/4] Python encontrado.

rem ---- 2. Dependencias Python ------------------------------------------
echo [2/4] A verificar as dependencias Python...
python -c "import docx" >nul 2>&1
if errorlevel 1 (
  echo       A instalar...
  python -m pip install --quiet python-docx lxml
  if errorlevel 1 (
    echo.
    echo   Nao foi possivel instalar as dependencias.
    pause
    exit /b 1
  )
)
echo       OK.

rem ---- 3. Fichas de jogo ------------------------------------------------
echo [3/4] A gerar as fichas de jogo...
python scripts\build_content.py
if errorlevel 1 (
  echo.
  echo   A geracao das fichas falhou. A mensagem esta em cima.
  echo   Leia build\content-report.json para mais detalhes.
  pause
  exit /b 1
)

rem ---- 4. Progresso Pessoal (opcional) ---------------------------------
echo.
echo [4/4] Progresso Pessoal (opcional)...
node scripts\progress\build-progress.mjs
rem Uma falha aqui nao impede o site: a folha pode estar inacessivel e o
rem artefacto anterior continua a ser usado.

echo.
echo ============================================
echo  tudo certo. a construir e a abrir o site...
echo  (para parar, feche esta janela)
echo ============================================
echo.

rem `preview` serve o que está em dist/, por isso constrói-se primeiro.
call npx vite build
if errorlevel 1 (
  echo.
  echo   A construcao do site falhou. A mensagem esta em cima.
  pause
  exit /b 1
)

call npx vite preview

pause