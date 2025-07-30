#!/bin/bash

# Unicode環境変数を設定してテスト
export LANG=ja_JP.UTF-8
export LC_ALL=ja_JP.UTF-8
export LC_CTYPE=ja_JP.UTF-8

echo "Testing with UTF-8 locale settings..."
echo "LANG=$LANG"
echo "LC_ALL=$LC_ALL"
echo "LC_CTYPE=$LC_CTYPE"
echo ""

# cccontextを実行
npx cccontext sessions --live