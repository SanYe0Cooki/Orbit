# Orbit 建置與上架指南

> 這份文件說明如何把 `web/` 裡的 Orbit 變成可安裝在 iPhone 與 Android 手機上的
> App，以及如何用 GitHub Actions 在雲端完成打包（這台電腦是 Windows，沒有 Xcode
> 也沒有 Android SDK，所以雲端打包是主要路徑）。

---

## 1. 你拿到什麼

| 位置 | 內容 |
| --- | --- |
| `web/` | 優化後的 App 本體（HTML/CSS/JS），也就是原生 App 載入的內容 |
| `android/` | Android 原生專案（Capacitor 產生，可直接用 Android Studio 開） |
| `ios/` | iOS 原生專案（Capacitor 產生，需要 Mac 上的 Xcode 開） |
| `assets/` | App 圖示與啟動畫面 PNG，`make-icons.py` 可重新產生 |
| `scripts/` | 建置輔助腳本（版本號、簽章、圖示安裝、本機伺服器） |
| `.github/workflows/` | 雲端打包：Android APK/AAB、iOS 模擬器版或正式 IPA |
| `supabase/` | 資料庫 schema 與 migration |
| `docs/` | 本文件、Supabase 設定、上架檢查清單、QA 測試計畫 |

**App 基本資訊**

| 項目 | 值（請依需求修改） |
| --- | --- |
| App 名稱 | Orbit |
| Bundle ID / Application ID | `com.orbit.habits` |
| 版本 | 2.0.0 |
| 網頁內容來源 | `web/`（打包進 App，離線也能開） |

> ⚠️ **上架前務必改掉 `com.orbit.habits`。**
> 這是預留的識別碼，Apple 與 Google 都要求 Bundle ID 在你自己的帳號下是唯一的。
> 建議改成你自己的反向網域，例如 `com.yourname.orbit` 或 `io.github.sanye0cooki.orbit`。
> 需要同步修改的位置見第 7 節。

---

## 2. 用 GitHub Actions 在雲端打包（主要方式）

### 2.1 放上 GitHub

```bash
cd orbit-app
git init
git add .
git commit -m "Orbit native app"
git branch -M main
git remote add origin https://github.com/<你的帳號>/<repo>.git
git push -u origin main
```

推上去之後，到 GitHub 的 **Actions** 分頁：

- **Build Android** — 每次推到 `main` 只要改到 `web/`、`android/` 等相關檔案就會自動跑。
- **Build iOS** — 同上，跑在免費的 macOS runner 上。
- 兩個流程也都能用 **Run workflow** 手動觸發。

### 2.2 下載成品

流程跑完後，點進該次執行，頁面最下方 **Artifacts** 區塊即可下載：

| Artifact | 內容 | 能不能直接裝在手機 |
| --- | --- | --- |
| `orbit-android-apk-*` | debug + release APK | 可以（需在手機上允許安裝未知來源） |
| `orbit-android-aab-*` | Play Store 上架用的 .aab | 不行，這是給 Google Play 的 |
| `orbit-ios-unsigned-*` | iOS 模擬器版 .app（zip） | 不行，只能在 Xcode 模擬器跑 |
| `orbit-ios-signed-*` | 正式 .ipa | 可以（需透過 TestFlight 或 Apple Configurator 安裝） |

> 沒有簽章密鑰時，Android 產出的 release APK 是用 debug 金鑰簽的，**只能自己測試用，
> 不能上架**。流程會印出黃色警告提醒你。

### 2.3 Android 簽章密鑰（上架必須）

在本機（需要 Java）或任何有 `keytool` 的環境產生一組金鑰：

```bash
keytool -genkeypair -v \
  -keystore orbit-release.keystore \
  -alias orbit \
  -keyalg RSA -keysize 2048 -validity 10000
```

> 這組 keystore 是你的 App 身分證明，**弄丟就再也無法更新同一個 App**。
> 請備份到安全的地方（雲端硬碟、密碼管理器），不要只放在電腦裡。

轉成 base64 後貼進 GitHub Secrets：

```bash
# macOS / Linux
base64 -i orbit-release.keystore | pbcopy      # macOS
base64 -w0 orbit-release.keystore               # Linux
```

```powershell
# Windows PowerShell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("orbit-release.keystore")) | Set-Clipboard
```

到 **Settings → Secrets and variables → Actions** 新增：

| Secret | 內容 |
| --- | --- |
| `ORBIT_KEYSTORE_BASE64` | keystore 檔的 base64 |
| `ORBIT_KEYSTORE_PASSWORD` | keystore 密碼 |
| `ORBIT_KEY_ALIAS` | `orbit` |
| `ORBIT_KEY_PASSWORD` | key 密碼 |

設好之後重跑流程，release APK 就會用你的正式金鑰簽章。

### 2.4 iOS 簽章（要上架 App Store 才需要）

App Store 版本需要 Apple Developer Program（每年 99 美元）與以下四樣東西：

1. 在 [developer.apple.com](https://developer.apple.com/account) 建立 **App ID**，Bundle ID 要和專案一致。
2. 建立 **Apple Distribution 憑證**，從 Keychain 匯出成 `.p12`（設一組密碼）。
3. 建立 **App Store 發佈用 Provisioning Profile**（.mobileprovision）。
4. 在 App Store Connect 建立 App 記錄，取得 **Team ID**（10 碼）。

把這些放進 GitHub Secrets：

| Secret | 內容 |
| --- | --- |
| `APPLE_TEAM_ID` | 10 碼 Team ID |
| `APPLE_CERT_P12_BASE64` | .p12 的 base64 |
| `APPLE_CERT_PASSWORD` | 匯出 .p12 時設的密碼 |
| `APPLE_PROVISION_PROFILE_BASE64` | .mobileprovision 的 base64 |
| `KEYCHAIN_PASSWORD` | 隨便一串亂碼，CI 暫時用 |

設好後 iOS 流程會自動從「模擬器版」切換成「正式 IPA」。
**還沒設之前**，你仍可拿到模擬器版來確認程式能編譯成功。

### 2.5 把 IPA 送上 App Store

流程只產生 `.ipa`，不會自動上傳（自動上傳需要 App Store Connect API Key）。
要上傳可用：

- **Mac + Xcode**：`Window → Organizer → Distribute App`，或直接 `xcrun altool`。
- **Transporter**：Mac App Store 上的免費 App，把 .ipa 拖進去就能上傳。
- **GitHub Actions 擴充**：之後可加 `apple-actions/upload-testflight-build` 之類的步驟自動上傳。

### 2.6 發表網站版（GitHub Pages）

`.github/workflows/pages.yml` 會把 `web/` 的內容發布成網站。
啟用一次即可：**Settings → Pages → Build and deployment → Source 改成 `GitHub Actions`**。

目前 repo 是 `SanYe0Cooki/Orbit`，所以發布後網址是：

```
https://sanye0cooki.github.io/Orbit/
https://sanye0cooki.github.io/Orbit/app.html   ← 這就是 Supabase Site URL 要填的值
```

因為流程把 `web/` 當成網站根目錄，`app.html` 會剛好落在原本那個路徑，
**Supabase 的 Site URL 不需要改**。這點很重要：登入驗證與密碼重設的連結
都是指到 `app.html`，路徑一旦不對，使用者點信裡的連結就會 404。

> ⚠️ 你的 repo 剛從 `wellnest` 改名為 `Orbit`。GitHub Pages 的網址會跟著
> 變成 `.../Orbit/`，舊的 `.../wellnest/` 已經 404。如果之前有人在
> Supabase 的 Redirect URLs 裡填了 `/wellnest/`，請一併改成 `/Orbit/`。

Service Worker 的 scope：`sw.js` 放在 `web/` 時，頁面路徑是 `/Orbit/app.html`，
Service Worker 的 scope 會是 `/Orbit/`，足以涵蓋整個 App，離線功能正常。
（若網站改到更上層路徑，例如根目錄，才需要把 `sw.js` 也複製到那個層級。）

---

## 3. 本機開發（改畫面、改功能）

`web/` 是純靜態檔案，不需要編譯。用內附的小伺服器就能預覽：

```bash
node scripts/serve.mjs
# → http://localhost:4173/web/app.html
```

> 一定要用 http:// 開，不要直接雙擊 app.html（file://）。
> Service Worker、Supabase 登入回跳在 file:// 下都不會正常運作。

改完 `web/` 的內容後，同步到原生專案：

```bash
npx cap sync          # 同時同步 android 與 ios
# 或只同步一邊
npx cap sync android
npx cap sync ios
```

`cap sync` 做兩件事：把 `web/` 複製進原生專案，並更新原生外掛清單。
**它不會更新 App 圖示**，圖示請用第 5 節的腳本。

### 3.1 改完之後一定要做的事

改了 `web/` 的內容後，請把 Service Worker 的快取版本往上加一號，
否則已經安裝過的使用者會一直看到舊版畫面：

```js
// web/sw.js 第一行
const CACHE_VERSION = 'orbit-v2.0.1';   // ← 每次改版就 +1
```

### 3.2 自動化檢查

```bash
node scripts/verify.mjs            # 不需要瀏覽器：設定一致性、圖示、金鑰外洩檢查
node scripts/serve.mjs             # 另開一個終端機
node scripts/run-smoke-test.mjs    # 用無頭 Chrome 跑 100+ 項 UI 自動測試
```

`verify.mjs` 會在正式發布前提醒你還沒改掉的預留值（例如範例客服信箱）。
`run-smoke-test.mjs` 會實際操作介面：新增／編輯／打卡／暫停／封存／刪除、
切換語言與主題、滑動手勢，並把結果印成報告。改動 `web/` 之後建議先跑這兩個。

---

## 4. 本機產生 APK（如果你之後裝了 Android SDK）

需要 JDK 21 與 Android SDK（platform 35、build-tools 35）。裝好後：

```bash
npx cap sync android
node scripts/prepare-android.mjs 1 2.0.0
cd android
./gradlew assembleDebug        # 產出 android/app/build/outputs/apk/debug/app-debug.apk
```

Windows 上用 `gradlew.bat`。若出現 JDK 版本錯誤，設定 `JAVA_HOME` 指向 JDK 21。

---

## 5. 圖示與啟動畫面

圖示是用 Python 直接畫出來的（不需要設計軟體），重新產生：

```bash
python assets/make-icons.py          # 產生 assets/*.png
node scripts/install-assets.mjs      # 安裝進 android/ 與 ios/
```

要換風格就改 `assets/make-icons.py` 裡的顏色與幾何參數，跑完上面兩行即可。

---

## 6. 改版流程（之後每次更新）

1. 改 `web/` 裡的檔案。
2. 若是大改版，更新 `package.json` 的 `version`。
3. `npx cap sync`
4. `git commit && git push`
5. 到 GitHub Actions 下載新的 APK / IPA。
6. 上傳到 App Store Connect / Google Play Console。

**重要：**
- App Store 的 `CFBundleVersion`（build number）每次上傳都必須往上加，
  iOS 流程已自動使用 GitHub 的執行序號，不會重複。
- Android 的 `versionCode` 同理，也由流程自動遞增。
- **已上架的 App 不能用新的簽章金鑰更新**，金鑰遺失就必須重新上架一個新 App。

---

## 7. 要上架前必須修改的清單

| 項目 | 位置 |
| --- | --- |
| Bundle ID | `capacitor.config.json` 的 `appId`、`android/app/build.gradle`、`ios/App/App.xcodeproj/project.pbxproj`、`scripts/write-export-options.mjs` 的預設值 |
| 客服信箱 | `web/app.js` 最上方 `CONFIG.supportEmail`（目前是 `support@example.com`） |
| 隱私政策日期與內容 | `web/privacy.html` |
| Supabase 網址與金鑰 | `web/app.js` 最上方 `CONFIG.supabaseUrl` / `supabaseKey`（若換成你自己的專案） |
| App 名稱 | `android/app/src/main/res/values/strings.xml`、`ios/App/App/Info.plist` |
| 版本號 | `package.json` |

> 搜尋 `com.orbit.habits` 與 `support@example.com` 就能找到全部需要改的地方。

---

## 8. 常見問題

| 症狀 | 原因 | 解法 |
| --- | --- | --- |
| Android release 建置失敗且提到 signingConfig | 沒有簽章密鑰 | 照 2.3 設定 Secrets，或先只下載 debug APK |
| iOS 流程只產出模擬器版 | 沒設 Apple Secrets | 正常行為，設好 2.4 的四個 Secret 就會產 IPA |
| `pod install` 失敗 | Podfile 路徑與 node_modules 結構不符 | 確認流程用 `npm install`（不是 pnpm），Podfile 使用 `../../node_modules/@capacitor/...` |
| App 打開是白畫面 | `web/` 內容沒同步進原生專案 | 執行 `npx cap sync` 後重新打包 |
| 登入後沒同步 | Supabase 網址／金鑰不對，或 Redirect URL 沒設 | 見 `docs/SUPABASE-SETUP.md` |
| 收不到驗證信 | 用 Supabase 內建寄信服務，只能寄給專案成員 | 設定自有 SMTP，見 `docs/SUPABASE-SETUP.md` |
| 圖示還是 Capacitor 預設圖 | 沒跑圖示安裝腳本 | `node scripts/install-assets.mjs` |
| 改了程式但手機上還是舊版 | Service Worker 快取 | 把 `web/sw.js` 的 `CACHE_VERSION` 加一號，重新打包 |
| 點驗證信裡的連結沒回到 App | 原生深連結未設定 | 見下方第 9 節，並確認 Supabase 的 Redirect URLs 有 `orbit://auth` |

---

## 9. 原生深連結（驗證信／重設密碼）

App 已經在 `AndroidManifest.xml` 與 `Info.plist` 註冊了兩個自訂協定：

| 平台 | 已註冊的 scheme |
| --- | --- |
| Android | `orbit://auth`、`com.orbit.habits://auth` |
| iOS | `orbit`、`com.orbit.habits` |

`web/app.js` 的 `handleAuthUrl()` 會處理回跳：PKCE 的 `code` 會拿去換 session，
隱式流程的 token 會被接收，`type=recovery` 則直接打開「設定新密碼」畫面。

**還需要你在 Supabase 後台做的設定**（否則連結會開在瀏覽器裡，不會回到 App）：

1. Authentication → URL Configuration → **Redirect URLs** 加入：
   - `orbit://auth`
   - `com.orbit.habits://auth`
2. 把電子郵件範本裡的連結改用 `{{ .RedirectTo }}`，讓它回到 App 而不是網站。

詳細步驟見 `docs/SUPABASE-SETUP.md`。

> 如果你改了 Bundle ID，記得同步更新上面兩個 scheme 以及 Supabase 的 Redirect URLs。

---

## 10. 上架前的合規檢查

見 `docs/APP-STORE-CHECKLIST.md`。重點三個：

1. **必須有可公開存取的隱私政策網址**（`web/privacy.html` 已備好，部署到 GitHub Pages 即可）。
2. **必須能在 App 內刪除帳號**（「我的 → 帳號與資料 → 刪除我的帳號與資料」已實作，
   對應的 `delete_my_account()` 資料庫函式在 migration 002）。
3. **若 App 使用加密，兩平台都要申報出口合規**（Orbit 只用標準 HTTPS，屬於豁免範圍，
   但仍要在 App Store Connect 回答相關問題）。
