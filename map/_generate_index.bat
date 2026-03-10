@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion

set OUTPUT=_index.json

echo [ > %OUTPUT%

set first=1

for %%F in (*.json) do (
    if /I not "%%F"=="_index.json" (
        if /I not "%%F"=="_plage.json" (
            if !first!==1 (
                echo   "%%F" >> %OUTPUT%
                set first=0
            ) else (
                echo  , "%%F" >> %OUTPUT%
            )
        )
    )
)

echo ] >> %OUTPUT%


echo _index.json généré en UTF-8.
pause
