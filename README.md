# Waypoint 短網址（GitHub Pages 版）

靜態網站，可直接放上 GitHub Pages。資料與點擊紀錄存在你的 Google 雲端硬碟。

```
index.html      管理介面（建立、列表、分析、雲端儲存）
404.html        短網址轉址頁（GitHub Pages 對不存在的路徑會回傳它）
config.js       設定
links.json      選用：靜態短網址清單，轉址更快
cloud/Code.gs   貼進 Google Apps Script 的程式碼
.nojekyll       讓 GitHub Pages 不要用 Jekyll 處理檔案
```

## 1. 設定雲端儲存（Google）

1. 開啟 https://script.google.com ，新增專案，把 `cloud/Code.gs` 全部貼上。
2. 函式選單選 `setup`，按「執行」並授權。到「執行記錄」複製**管理密碼**。
   試算表「Waypoint 短網址資料」會自動建在你的雲端資料夾。
3. 部署 → 新增部署作業 → 類型「網頁應用程式」。執行身分選「我」，誰可以存取選「所有人」。複製網址。
4. 把網址貼進 `config.js` 的 `appsScriptUrl`。

改過 `Code.gs` 後，要「管理部署作業 → 編輯 → 新版本」才會生效。

## 2. 上傳到 GitHub

1. 建立新的 repo（Public）。
2. Add file → Upload files，把這個資料夾**裡面**的檔案全部拖進去（`404.html` 與 `index.html` 要在 repo 最外層）。
   `.nojekyll` 是隱藏檔，沒有它也能運作，但建議一併上傳。
3. Settings → Pages → Build and deployment → Deploy from a branch → `main` / `/ (root)` → Save。
4. 約一分鐘後，網站在 `https://你的帳號.github.io/repo名稱/`。

## 3. 開始使用

1. 開啟網站，進入「雲端儲存」，填入 Apps Script 網址與管理密碼，按「連線並同步」。
2. 到「建立短網址」新增連結。短碼可用中文，例如 `養成水煮蛋肌`。
3. 短網址：`https://你的帳號.github.io/repo名稱/養成水煮蛋肌`。

## 4. 使用自己的網域（例如 kafenhair.com）

1. repo → Settings → Pages → Custom domain，填入網域並勾選 Enforce HTTPS。
2. DNS：子網域用 `CNAME → 你的帳號.github.io`；根網域用四筆 A 記錄
   `185.199.108.153`、`185.199.109.153`、`185.199.110.153`、`185.199.111.153`。
3. `config.js` 的 `shortDomain` 填入網域，`404.html` 的 `waypoint-base` 改成 `""`（自訂網域不需要 repo 路徑）。
4. 短網址變成 `https://kafenhair.com/養成水煮蛋肌`。

## 限制

- 轉址由瀏覽器端的 JavaScript 完成，不是伺服器 302。速度通常很快，但無法保證 50ms 以內。
- GitHub Pages 對找不到的路徑回傳 HTTP 404 狀態碼（頁面內容會正常轉址）。LINE、Facebook 的連結預覽卡片因此抓不到目的地的標題與圖片。需要預覽卡片請改用 `waypoint-backend` 的伺服器版本。
- 地區只能依瀏覽器時區推測國家，無法細分縣市。
- 試算表適合每月數萬次點擊以內。更大的流量請改用 PostgreSQL 版本。
- `config.js`、`links.json` 與短網址目的地都是公開的。管理密碼只存在你的瀏覽器，不要寫進 repo。
- 一個 GitHub Pages 站台只能綁一個自訂網域。
