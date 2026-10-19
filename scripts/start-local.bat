@echo off
chcp 65001 >nul
cd /d "%~dp0.."
echo === [1/4] Проверка Docker ===
docker info >nul 2>&1
if errorlevel 1 (
  echo Docker не запущен. Запустите Docker Desktop, дождитесь зелёного статуса и запустите скрипт снова.
  pause
  exit /b 1
)
echo === [2/4] PostgreSQL в контейнере ===
call npm run db:up || goto :fail
timeout /t 5 /nobreak >nul
echo === [3/4] Миграции и prisma generate ===
call npm run db:generate --workspace @shamil/api || goto :fail
call npm run db:migrate:deploy --workspace @shamil/api || goto :fail
echo === [4/4] Запуск API (3001) и Web (3000) в отдельных окнах ===
start "shamil-api" cmd /k "chcp 65001 >nul && npm run dev:api"
start "shamil-web" cmd /k "chcp 65001 >nul && npm run dev:web"
echo.
echo Готово. Сайт: http://localhost:3000   API: http://localhost:3001/api/health
pause
exit /b 0
:fail
echo.
echo ОШИБКА на шаге выше. Скопируйте вывод и пришлите.
pause
exit /b 1
