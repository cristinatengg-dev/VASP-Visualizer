#!/bin/zsh
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
cd "$(dirname "$0")" || exit 1
npm run dev:platform:start || { read '?启动失败，按回车关闭…'; exit 1; }
open 'http://127.0.0.1:4317/'
