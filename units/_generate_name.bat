@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion

set OUTPUT=unitNames.js

echo export const UNIT_NAMES = { > %OUTPUT%

for %%T in (infantry tank artillery train sniper boat) do (
    if exist "%%T" (
        echo   %%T: [ >> %OUTPUT%
        
        set first=1
        for %%F in ("%%T\*.png") do (
            set filename=%%~nF
            
            if !first!==1 (
                echo     "!filename!" >> %OUTPUT%
                set first=0
            ) else (
                echo     ,"!filename!" >> %OUTPUT%
            )
        )
        
        echo   ], >> %OUTPUT%
    )
)

echo }; >> %OUTPUT%

echo unitNames.js généré en UTF-8.
pause
