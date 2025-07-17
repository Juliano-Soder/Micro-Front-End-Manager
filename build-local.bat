@echo off
echo.
echo ========================================
echo   Micro Front-End Manager - Build
echo ========================================
echo.

echo [1/2] Compilando para Windows (certificado novo)...
call npm run make:win:fresh
if errorlevel 1 (
    echo ERRO: Falha no build Windows
    pause
    exit /b 1
)
echo ✓ Windows build concluido!
echo.

echo [2/2] Tentando compilar para Linux...
docker --version >nul 2>&1
if errorlevel 1 (
    echo AVISO: Docker nao encontrado
    echo Para Linux builds, instale Docker Desktop
    echo https://www.docker.com/products/docker-desktop
    goto :fim
)

echo Docker encontrado! Compilando para Linux...
docker run --rm -v "%cd%:/project" -w /project electronuserland/builder:wine sh -c "npm ci && npm run make:linux"
if errorlevel 1 (
    echo AVISO: Erro no Linux build
) else (
    echo ✓ Linux build concluido!
)

:fim
echo.
echo ========================================
echo Build finalizado!
echo Verifique a pasta 'out/make'
echo ========================================
pause
