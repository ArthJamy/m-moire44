@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion

set OUTPUT=_list.json

echo [ > %OUTPUT%

set first=1

for %%F in (*.png) do (
    if !first!==1 (
        echo   "%%F" >> %OUTPUT%
        set first=0
    ) else (
        echo  , "%%F" >> %OUTPUT%
    )
)

echo ] >> %OUTPUT%


echo list.json généré en UTF-8.
pause
