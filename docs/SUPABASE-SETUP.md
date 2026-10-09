# Orbit — Supabase 設定指南（Auth、SMTP、Migration）

> 目的：讓 Orbit 的「任何 Email 都能註冊」這個需求真正可用。
> 目前症狀是 Supabase 內建寄信服務只願意寄給專案團隊成員（team members）的地址，
> 其他地址一律失敗。解法是接上自有的 SMTP 供應商，或是關掉 Email 確認。
>
> 本文只講 Supabase 後台的設定。App 的建置與上架流程見 `docs/BUILD.md`。
> 所有後台路徑都先以官方文件驗證過；若你的 Dashboard 版本不同、選單搬家了，
> 請以「在 Authentication 的 Email / SMTP 設定區塊」這類描述為準。

---

## 0. 現況（已確認的事實）

| 項目 | 值 |
| --- | --- |
| 專案 URL | `https://ldzputvalkeudijnrruz.supabase.co` |
| Publishable key | `sb_publishable_retcEKBhxkjUFwB6IPELiw_YvEdrVOU` |
| 前端設定位置 | `web/app.js` 第 16–17 行（`CONFIG.supabaseUrl` / `CONFIG.supabaseKey`） |
| Auth 方式 | 只用 email + password：`signUp`、`signInWithPassword`、`resetPasswordForEmail`、`updateUser` |
| OAuth | **刻意不使用** Google / Apple |
| Auth flow | `flowType: 'pkce'`（`web/app.js` 第 589 行）→ 回跳 URL 帶 `?code=` |
| Tables | `profiles`、`habits`、`habit_logs` |
| RLS | 三張表都啟用，每個 policy 都以 `auth.uid()` 限定自己的資料 |
| 原生 App | Capacitor；Android WebView origin 是 `https://localhost`，iOS 是 `capacitor://localhost` |

> `sb_publishable_...` 是**設計上可以公開**的前端金鑰，放在 HTML/JS 裡是正確做法。
> 真正保護資料的是 RLS，不是金鑰的保密性。詳見第 10 節。

---

## 1. 為什麼「任何 Email」一定需要自訂 SMTP

Supabase 為每個專案提供一個**內建寄信服務**，讓你先探索流程、測試 email 樣板。
官方明確說明它有幾個重要限制，而且**不適合正式上線**（[Send emails with custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)）：

| 限制 | 官方原文說法 | 對 Orbit 的影響 |
| --- | --- | --- |
| **只能寄給預先授權的地址** | 「Unless you configure a custom SMTP server for your project, Supabase Auth will refuse to deliver messages to addresses that are not part of the project's team」 | **這就是目前「只有團隊成員能註冊」的根本原因** |
| 失敗錯誤訊息 | 非團隊地址會失敗並回 `Email address not authorized` | 使用者看到的是「信寄不出去」，不是「格式錯誤」 |
| 授權名單在哪裡 | 「You can manage this in the Team tab of the organization's settings」 | 若專案組織成員是 `person-a@example.com`、`person-b@example.com`、`person-c@example.com`，那就**只有這三個地址收得到信** |
| **嚴格的速率限制** | 「Currently this value is set to **2 messages per hour**」 | 兩小時只能寄 2 封。測試三個人就卡住 |
| 沒有 SLA | 內建服務是「best-effort only」，官方定位為「toy projects, demos or any non-mission-critical application」 | 不能當正式環境 |

以上四項都出自同一頁官方文件；速率限制的細節另見 [Rate limits](https://supabase.com/docs/guides/auth/rate-limits)：

> 「Emails sent by Supabase Auth」這一列寫明：**2 emails per hour with the built-in email provider**，
> 而且「You can configure this limit when you use custom SMTP or the Send Email hook」。

**結論**：Email 確認信、密碼重設信、變更信箱信，全部走同一條寄信路徑。
只要沒有自訂 SMTP，任何不屬於你組織成員的 Gmail / Outlook / 公司信箱都寄不到。
設定自訂 SMTP 後，Supabase 就會「send messages to all addresses」（官方原文），
限制改為一個可調整的保護性上限：**30 messages per hour**，之後可在 Rate Limits 頁面調高。

### 1.1 三個容易混淆的「限流」要分清楚

| 限制項目 | 數值 | 可否調整 | 出處 |
| --- | --- | --- | --- |
| 內建寄信服務 | **2 封／小時** | 不可（除非改用 custom SMTP / Send Email hook） | [Rate limits](https://supabase.com/docs/guides/auth/rate-limits)、[auth-smtp](https://supabase.com/docs/guides/auth/auth-smtp) |
| 設定 custom SMTP 後的寄信上限 | **30 封／小時**（保護新寄信服務的 reputation） | 可，在 Rate Limits 設定頁調高 | [auth-smtp](https://supabase.com/docs/guides/auth/auth-smtp) |
| 單一使用者的 `signup confirmation` / `password reset` 請求 | 同一使用者 **60 秒**內只能發一次 | 可 | [Rate limits](https://supabase.com/docs/guides/auth/rate-limits) |

> 第 3 項很常見：使用者按了「重寄驗證信」卻沒反應，其實只是還在 60 秒冷卻期內。

---

## 2. 接上自訂 SMTP 供應商

### 2.1 官方支援的供應商

官方文件的「non-exhaustive list」包含：Resend、AWS SES、Postmark、Twilio SendGrid、ZeptoMail、Brevo。
其中 **Resend** 與 **Brevo** 都有免費額度，適合 Orbit 這種小專案。

### 2.2 在 Supabase 後台填寫的欄位

到 Authentication 的 **Email / SMTP 設定區塊**（官方文件說法是
「head to the Authentication settings page to enable and configure custom SMTP」，
新版 Dashboard 通常標示為 Email 或 Emails；若找不到，請用 Dashboard 搜尋 "SMTP"），
啟用 custom SMTP 後填入六個值：

| 欄位 | 說明 | 範例 |
| --- | --- | --- |
| Host | SMTP 主機 | `smtp.resend.com` |
| Port | 連接埠 | `587`（STARTTLS）或 `465`（SSL/TLS） |
| Username | SMTP 使用者 | `resend`（Resend 是固定字串，不是你的帳號） |
| Password | SMTP 密碼／API key | `（請改成你的 Resend API key，例如 re_xxxxxxxx）` |
| Sender name | 寄件者顯示名稱 | `Orbit` |
| Sender email | 寄件者地址 | `（請改成 no-reply@你的網域，例如 no-reply@auth.example.com）` |

同一組設定也可以用 Management API 寫入，官方範例的欄位名稱是
`smtp_host`、`smtp_port`、`smtp_user`、`smtp_pass`、`smtp_sender_name`、`smtp_admin_email`
（見 [auth-smtp](https://supabase.com/docs/guides/auth/auth-smtp)）：

```
smtp_admin_email: "no-reply@example.com"
smtp_host:        "smtp.example.com"
smtp_port:        587
smtp_user:        "your-smtp-user"
smtp_pass:        "your-smtp-password"
smtp_sender_name: "Your App Name"
```

> ⚠️ `smtp_pass`、`service_role` key、`sb_secret_...` key **絕對不可以**出現在前端程式碼或這份文件裡。
> 只把它們填進 Supabase Dashboard（或你自己的 server），不要寫進 Git。

### 2.3 具體供應商：Resend（推薦，最快上手）

官方 SMTP 設定值（[Resend — Send emails with SMTP](https://resend.com/docs/send-with-smtp)）：

| 欄位 | 值 |
| --- | --- |
| Host | `smtp.resend.com` |
| Port | `25`、`465`、`587`、`2465`、`2587` |
| Username | `resend`（固定字串；官方原文「Username: resend」） |
| Password | `YOUR_API_KEY`（你的 Resend API key） |

連接埠安全性對照（同頁官方表格）：

| Type | Port | Security |
| --- | --- | --- |
| SMTPS | `465`、`2465` | Implicit SSL/TLS（連線即加密） |
| STARTTLS | `25`、`587`、`2587` | Explicit SSL/TLS（先明文再升級） |

**建議填 `587`。** 前置條件（官方原文）：需要一組 **Resend API key** 與一個 **verified domain**。
也就是說：先用你自己的網域完成驗證，才能用該網域當寄件者。

> Resend 的免費方案可寄給**任意**收件人，只要寄件網域已驗證。
> 未驗證網域時，`onboarding@resend.dev` 這種測試寄件者只能寄到你自己的信箱，
> 不能拿來當正式寄件者。

### 2.4 具體供應商：Brevo

官方 SMTP relay 值（[Brevo — Postfix integration](https://developers.brevo.com/docs/using-the-smtp-relay-with-postfix)、
[Brevo — Node.js SMTP relay example](https://developers.brevo.com/docs/node-smtp-relay-example)）：

| 欄位 | 值 |
| --- | --- |
| Host | `smtp-relay.brevo.com` |
| Port | `587`（官方範例 `port: 587`、`secure: false`，走 STARTTLS） |
| Username | 你的 Brevo 帳號 email（官方範例 `user: "example@brevo.com"`） |
| Password | 你的 **SMTP key／master password**（在 Brevo 的「SMTP and API」選單取得，官方原文：「available in the SMTP and API menu in the top-right」） |

### 2.5 其他供應商（備援）

| 供應商 | Host | Port | Username | Password |
| --- | --- | --- | --- | --- |
| Mailgun | `smtp.mailgun.org`（EU 區為 `smtp.eu.mailgun.org`） | `587`（官方建議；亦支援 `25`、`465`、`2525`） | 你的 Mailgun SMTP login（通常是 `postmaster@你的網域`） | SMTP password |
| SendGrid | `smtp.sendgrid.net` | `587`（或 `25`、`2525`；SSL 用 `465`） | 固定字串 `apikey`（官方原文：「the exact string "apikey" and not the API key itself」） | 你的 SendGrid API key |

出處：[Mailgun SMTP sending](https://documentation.mailgun.com/docs/mailgun/user-manual/sending-messages/send-smtp)、
[Twilio SendGrid SMTP API](https://www.twilio.com/docs/sendgrid/for-developers/sending-email/integrating-with-the-smtp-api)。

> Mailgun 官方建議用 587：「Some ISPs are blocking or throttling SMTP port 25. Using port 587 is recommended.」

### 2.6 DNS 一定要設：SPF / DKIM（以及 DMARC）

沒有這些 DNS 記錄，你的驗證信會大量進垃圾信匣，**註冊流程等於壞掉**。
官方列在「Additional best practices」（[auth-smtp](https://supabase.com/docs/guides/auth/auth-smtp)）：

- 「Set up and maintain **DKIM, DMARC and SPF** configurations.」官方說這會「significantly increase the deliverability」。
- 「**Set up a custom domain.**」用自己的網域可避免被其他 Supabase 專案的壞名聲拖累。
- 不要用同一個子網域同時寄驗證信與行銷信；官方建議分開
  （`auth.example.com` vs `marketing.example.com`）。
- 驗證信裡**不要**放行銷內容、標語、簽名檔、大量圖片或 emoji。
- 驗證信樣板不要頻繁改動、不要做 A/B test。

實務做法：在 DNS 供應商新增供應商給你的記錄（常見是 SPF 的 `TXT`、DKIM 的 `TXT`/`CNAME`、
DMARC 的 `_dmarc` `TXT`）。實際名稱與值由供應商後台產生，**請以供應商後台顯示的為準**。

```
（請改成你的寄件網域）  例：auth.example.com
SPF   ：TXT 記錄，依供應商提供的內容
DKIM  ：依供應商提供的 selector 與值
DMARC ：TXT 記錄在 _dmarc.你的網域
```

### 2.7 換掉內建樣板（建議）

確認信內容可到 Dashboard 的 **Email Templates** 頁面編輯（官方：
「Edit templates on the Email Templates page in the dashboard.」，見
[Email Templates](https://supabase.com/docs/guides/auth/auth-email-templates)）。
官方提到一個關鍵細節：若程式有傳 `redirectTo`，
樣板裡應該把 `{{ .SiteURL }}` 換成 `{{ .RedirectTo }}`，
否則使用者點信裡的連結不會回到你的 App。

Orbit 有傳 `emailRedirectTo`（`web/app.js` 第 915 行）與 `redirectTo`（第 1234 行），
所以**樣板要使用 `{{ .RedirectTo }}`**。可用的變數還有
`{{ .ConfirmationURL }}`、`{{ .TokenHash }}`、`{{ .Email }}`。

---

## 3. 兩種可用設定，以及建議

「Confirm email」開關的位置：官方說「This option can be found in the **email provider** under the
provider-specific configuration.」（[General configuration](https://supabase.com/docs/guides/auth/general-configuration)）
也就是 Authentication 的 **Email provider 設定區塊**裡的 **Confirm Email**。

### 方案 A — 關閉 Email 確認（Confirm email = OFF）

- 官方說明：「Having Confirm Email disabled assumes that the user's email does not need to be verified
  in order to sign in and implicitly confirms the user's email in the database.」
- 程式行為：`signUp` **直接回傳 session**。Orbit 的 `web/app.js` 第 918 行就是處理這種情況
  （`if (res.data && res.data.session)`）→ 直接登入。
- 任何 Email 都能**立刻**註冊成功，**完全不會寄信**。
- 不受寄信速率限制影響，也不需要 SMTP。
- 代價：假信箱、打錯的信箱都能註冊；使用者無法透過信箱證明所有權，
  也**無法使用密碼重設**（沒有信箱就收不到重設連結）。
- 濫用風險：官方在 auth-smtp 的 abuse 段落明確警告 bot 註冊，
  並說「**Do not disable email confirmations under pressure.**」，
  建議搭配 CAPTCHA。

### 方案 B — 開啟 Email 確認 + 自訂 SMTP（建議）

- 程式行為：`signUp` **不回傳 session**。Orbit 第 922–926 行會顯示「已寄出」提示
  （`toast(t('sent'))`），要使用者去收信。
- 使用者點信裡的連結 → 回跳 `emailRedirectTo` → PKCE 流程用 `?code=` 換 session → 登入。
- **必須先完成第 2 節的自訂 SMTP**，否則非團隊成員的地址收不到信
  （錯誤為 `Email address not authorized`），而且內建服務只有 2 封／小時。
- 建議同時換掉預設確認信樣板（見 2.7），品牌一致且比較不容易被判垃圾信。

### 決策表

| 考量 | 方案 A：確認 OFF | 方案 B：確認 ON + 自訂 SMTP（建議） |
| --- | --- | --- |
| 「任何 Email 都能註冊」 | ✅ 立刻可註冊 | ✅ 但要收得到信 |
| 需要自訂 SMTP？ | ❌ 不用 | ✅ 必要 |
| 需要設定 DNS（SPF/DKIM）？ | ❌ | ✅ 建議 |
| 註冊後是否馬上登入 | ✅ 立刻有 session | ❌ 先收信、點連結 |
| 密碼重設可用？ | ⚠️ 效果有限（無法證明信箱所有權） | ✅ 完整可用 |
| 假信箱／bot 註冊 | ❌ 無法阻擋 | ✅ 有基本阻力 |
| 建置時間 | 5 分鐘 | 30–60 分鐘（含 DNS 生效） |
| 上架 App Store / Play 審查 | 可 | 較符合一般期待 |
| 適合 | 內部測試、Demo、快速驗證資料流 | **正式上線** |

**建議**：正式上線走 **方案 B**；先用 **方案 A** 讓 QA 與內部成員立刻測試 UI 流程，
等 SMTP + DNS 就緒後再切到 B。切換只是改一個開關，前端程式兩種都已支援。

---

## 4. URL Configuration（這裡最常出錯）

位置：Authentication 的 **URL Configuration** 頁面（官方：
「To configure allowed redirect URLs, go to the URL Configuration page.」見
[Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)）。

官方對 Site URL 的說明：

> 「The Site URL in URL Configuration defines the default redirect URL when no `redirectTo` is
> specified in the code. Change this from `http://localhost:3000` to your production URL…
> **This setting is critical for email confirmations and password resets.**」

### 4.1 Site URL

| 設定 | 值 |
| --- | --- |
| Site URL | `https://sanye0cooki.github.io/wellnest/` |

> ⚠️ 若你把新版建置部署到**不同的路徑**（例如 repo 改名、改部署到 `docs/`、
> 或改用自訂網域），**Site URL 必須跟著改**，否則驗證信與重設信會導到舊位置。

### 4.2 Redirect URLs（允許清單）

Orbit 的 `redirectUrl()` 是動態產生的（`web/app.js` 第 942–945 行）：

```js
return window.location.origin + window.location.pathname;
```

所以允許清單要涵蓋**每一種執行環境的 origin**：

| 環境 | 要加入的 Redirect URL | 說明 |
| --- | --- | --- |
| GitHub Pages | `https://sanye0cooki.github.io/wellnest/` | 前端實際路徑 |
| GitHub Pages（保險） | `https://sanye0cooki.github.io/wellnest/**` | 使用 wildcard 涵蓋子路徑 |
| 本機開發 | `http://localhost:8000/**` | 例：`python -m http.server 8000`；**（請改成你實際用的 port）** |
| Android（Capacitor） | `https://localhost/**` | `capacitor.config.json` 設定 `androidScheme: "https"` |
| iOS（Capacitor） | `capacitor://localhost/**` | `capacitor.config.json` 設定 `iosScheme: "capacitor"` |
| Android deep link（選用） | `com.orbit.habits://**` | 目前 `AndroidManifest.xml` 尚未註冊此 scheme，見 4.4 |
| iOS deep link（選用） | `orbit://**` | 目前 iOS 尚未註冊此 scheme，見 4.4 |

Wildcard 語法（官方表格）：`*` 匹配任何非分隔字元序列、`**` 匹配任何字元序列，
而 URL 的分隔字元定義為 `.` 與 `/`。因此 `https://localhost/**` 能涵蓋 `?code=...` 之後的變化。

官方對此的建議是：「While the "globstar" (`**`) is useful for local development and preview URLs,
we recommend setting the exact redirect URL path for your site URL in production.」
→ 正式站放**精確路徑**，本機與原生才用 `**`。

### 4.3 為什麼「連結點了沒反應」幾乎都是這裡

1. 使用者點信裡的連結 → Supabase 的 `/auth/v1/verify`。
2. Supabase 檢查 `redirect_to` 是否落在允許清單內。
3. **不合就退回 Site URL**；Site URL 也不對時，就會落在空白頁或首頁。
4. 若 `redirect_to` 對、但路徑是舊的，使用者會看到一個「什麼都沒發生」的頁面。

Orbit 用 PKCE（`flowType: 'pkce'`），回跳會帶 `?code=`；
`web/app.js` 的 `detectSessionInUrl: true`（第 587 行）會自動兌換 session。
但在原生 App 內，還需要 `appUrlOpen` 監聽（第 1115 行）才會把 session 接起來。

### 4.4 原生 deep link 的現況（重要）

- App 端**已經有**處理 deep link 的程式（`web/app.js` 第 1115–1126 行，處理
  `access_token`、`code=`、`type=recovery`）。
- 但 `android/app/src/main/AndroidManifest.xml` 目前只有 MAIN/LAUNCHER 的 intent-filter，
  **沒有** `orbit://` 或 `com.orbit.habits://` 的 scheme 註冊；iOS 的 `Info.plist` 也沒有
  `CFBundleURLSchemes`。
- 也就是說：**在原生 App 內點 Email 連結，目前不會被 App 接手**，會開在瀏覽器。
- 官方 deep link 指引（[Native Mobile Deep Linking](https://supabase.com/docs/guides/auth/native-mobile-deep-linking)）：
  「you need to specify a custom URL scheme for your app… In your project's auth settings add the
  redirect URL, e.g. `com.supabase://**`」→ 所以允許清單要放 `com.orbit.habits://**` 這種形式。
- 建議上線前處理，或先接受「原生 App 的驗證信在瀏覽器開啟、之後回 App 手動登入」。

---

## 5. 密碼規則

位置：Authentication 的 Auth 設定（官方：「You can configure these in your project's Auth settings」，
見 [Password security](https://supabase.com/docs/guides/auth/password-security)）。

| 設定 | 建議值 | 原因 |
| --- | --- | --- |
| Minimum password length | **至少 6**（建議 8 以上） | Orbit 前端檢查是 `password.length < 6`（`web/app.js` 第 905 行、第 1243 行）。若後台最小值設得比 6 大，前端會先放行、後端才擋，使用者看到的是較難理解的錯誤 |
| Leaked password protection | 建議開啟 | 官方：「Supabase Auth uses the open-source HaveIBeenPwned.org Pwned Passwords API to reject passwords that have been leaked」 |
| Required characters | 依產品決定 | 官方建議「digits, lowercase and uppercase letters, and symbols」時強度最高；但若開啟，既有使用者登入時可能遇到 `WeakPasswordError` |

兩個必知的限制：

1. **Minimum password length 必須 ≥ 6 才能和 App 一致。** 官方建議
   「Anything less than 8 characters is not recommended.」→ 想更安全就把前端檢查一起改成 8，
   但**不要只改後台**，否則會出現「前端說可以、後端說不行」。
2. **Leaked password protection 需要 Pro Plan 以上。** 官方原文：
   「Leaked password protection is available on the Pro Plan and above.」
   → 免費方案沒有這個選項，這是正常的，不是設定錯誤。

其他可選項（同一頁）：Require reauthentication when changing password、
Require current password when changing password。Orbit 目前兩者都沒用，
維持關閉即可（否則 `updateUser({ password })` 會需要額外參數）。

---

## 6. Migration 檔案

在 Supabase Dashboard 的 **SQL Editor** 貼上並執行：

```
supabase/migrations/002_orbit_app_hardening.sql
```

（先確定 `supabase/schema.sql` 已經套用過；這個 migration 是設計成可重複執行的。）
它做三件事：

| 項目 | 一句話說明 |
| --- | --- |
| `habit_logs.local_timezone` 欄位 | 每次打卡記下裝置的 IANA 時區名稱，旅途中不會讓歷史日期悄悄位移。 |
| `delete_my_account()` 函式 | 讓已登入的使用者刪除自己的 auth identity（符合 App Store 5.1.1(v)，也是 App 內「刪除帳號」按鈕呼叫的 RPC）。 |
| 收緊的 RLS insert policy | `habits` 與 `habit_logs` 的 INSERT 改成 `with check (user_id = (select auth.uid()))`，避免客戶端偽造 `user_id`。 |

> App 端呼叫的是 `state.supabase.rpc('delete_my_account')`（`web/app.js` 第 994 行）。
> 沒有跑這個 migration，刪除帳號會失敗。

---

## 7. 驗證清單（請實際點過一遍）

前置：完成第 2 節（方案 B）或第 3 節方案 A，並跑完第 6 節的 migration。

1. **用非團隊成員的 Gmail 註冊。** 例如 `（請改成一支不屬於你 Supabase 組織的 Gmail）`。
   在 Authentication 的 Users 頁面確認新使用者出現。
2. **收到確認信。** 若走方案 B：信件應在 1 分鐘內到「收件匣」而非只有「垃圾郵件」。
   若走方案 A：**完全不會寄信**，註冊後應立刻登入並看到 Today 畫面。
3. **信件內連結可回跳。** 點確認連結後，網址應停在
   `https://sanye0cooki.github.io/wellnest/`（或你的新網址），而且已登入。
4. **第二台裝置看到同樣的 habits。** 在手機或另一個瀏覽器用同一組帳密登入，
   habits 清單與打卡紀錄應一致（`habits` + `habit_logs` 都同步）。
5. **密碼重設完整走一圈。** 登出 → 輸入同一 Email → 收到重設信 → 點連結 → 輸入新密碼 →
   用新密碼登入成功、舊密碼失敗。
6. **App 內刪除帳號。** 登入後到 Profile 按刪除帳號 → 確認 → 回 Authentication 的 Users 頁面
   確認該使用者已消失，`profiles` / `habits` / `habit_logs` 也沒有殘留資料列。
7. **60 秒冷卻。** 連續兩次按「重寄驗證信」，第二次應被限制（同一使用者 60 秒）。
8. **RLS 真的在擋。** 在 SQL Editor 用 `select * from habits;` 應看不到資料
   （因為 SQL Editor 不是 `authenticated` 身分），或看到與登入者不符的結果為 0 —— 用來確認 RLS 有開。
9. **確認信樣板用的是 `{{ .RedirectTo }}`**，而不是 `{{ .SiteURL }}`（見 2.7）。
10. **原生 App 內測一次註冊**（若已上架）：Android 的 origin 是 `https://localhost`、
    iOS 是 `capacitor://localhost`，兩者都要在允許清單裡。

---

## 8. 疑難排解

| 症狀 | 可能原因 | 修正方式 |
| --- | --- | --- |
| **完全收不到驗證信** | 掉進垃圾郵件 | 先查垃圾信匣；請使用者把寄件者加入通訊錄；完成 SPF/DKIM/DMARC（2.6） |
| 同上 | 沒有設定 custom SMTP，內建服務只願意寄給團隊成員 | 非團隊地址會回 `Email address not authorized`。依第 2 節接上 SMTP |
| 同上 | SMTP 設定錯誤（host / port / username / password / 寄件者網域） | 在供應商後台確認值；Resend 的 Username 是固定字串 `resend`、SendGrid 是 `apikey`，**不是**你的帳號 |
| 同上 | 撞到速率限制 | 內建服務只有 **2 封／小時**；custom SMTP 預設 30 封／小時。到 Rate Limits 頁面調高 |
| 同上 | 寄件者網域未驗證 | Resend 需 **verified domain**；未驗證時測試寄件者只能寄給自己。完成網域驗證 |
| 同上 | 同一使用者重複請求 | `signup confirmation` / `password reset` 對同一使用者有 **60 秒**冷卻 |
| **登入時顯示 "Email not confirmed"** | 專案開啟了 Confirm email，但使用者還沒點信裡的連結 | 請使用者完成確認，或按「重寄」；確認信根本寄不出去就回頭修 SMTP |
| 同上 | 使用者是在 Confirm email 關閉時註冊、之後才把開關打開 | 該使用者仍是未確認狀態。請他重設密碼，或在 Dashboard 手動確認 |
| **點連結後落在空白頁或錯的網址** | Redirect URLs 允許清單沒有這個 origin，Supabase 退回 Site URL | 依第 4.2 節補齊（GitHub Pages、`https://localhost/**`、`capacitor://localhost/**`） |
| 同上 | Site URL 還是舊路徑或 `http://localhost:3000` | 改成 `https://sanye0cooki.github.io/wellnest/`（或你實際的新網址） |
| 同上 | 信裡樣板用 `{{ .SiteURL }}` 而不是 `{{ .RedirectTo }}` | 依 2.7 改樣板變數 |
| 同上 | 網址對了但頁面空白 | GitHub Pages 路徑區分大小寫；確認 `wellnest/` 底下真的有 `index.html` |
| **原生 App 內點連結沒反應** | `AndroidManifest.xml` / iOS `Info.plist` 沒註冊 custom scheme | 見 4.4；目前只有瀏覽器會接手 |
| **密碼重設連結已過期** | 重設連結有時效，且同一連結只能用一次 | 重新申請一次；確認使用者沒有重複點舊信 |
| 同上 | 使用者點的是很久以前的信 | Email Templates 的樣板不會自動失效通知，需在 UI 上提醒「請用最新一封」 |
| **`new row violates row-level security policy`** | 未登入（沒有 session）就寫入 | 確認 `signInWithPassword`／`signUp` 已成功取得 session 再寫入 |
| 同上 | 寫入時 `user_id` 不是自己的 `auth.uid()` | Orbit 有帶 `user_id`（見 `web/app.js` 第 868、888 行）。確認是 `state.session.user.id` |
| 同上 | policy 用 `to authenticated`，但請求是 anon | 前端金鑰必須是 publishable/anon 且使用者已登入；不要用 `service_role` |
| 同上 | migration 002 沒跑，insert policy 還是舊的 | 執行 `supabase/migrations/002_orbit_app_hardening.sql` |
| **`relation "public.habits" does not exist`（relation does not exist）** | Schema 沒套用，或套用到別的專案／schema | 在 **正確專案** 的 SQL Editor 執行 `supabase/schema.sql`，再跑 `002_orbit_app_hardening.sql` |
| 同上 | 前端 `CONFIG.supabaseUrl` 指向別的專案 | 確認 `web/app.js` 第 16 行是 `https://ldzputvalkeudijnrruz.supabase.co` |
| **`function public.delete_my_account() does not exist`** | migration 002 沒跑 | 執行該 migration（第 6 節） |
| **`Email address not authorized`** | 內建寄信服務 + 非團隊地址 | 這正是本文要解的問題：接上 custom SMTP（第 2 節） |
| 前端顯示金鑰錯誤 / 401 | 用了錯的金鑰種類 | 前端只放 `sb_publishable_...`；`sb_secret_...` 與 `service_role` **絕不可**進前端 |

---

## 9. 設定順序（照這個順序做最省事）

1. 選一個 SMTP 供應商（Resend 最快），建立帳號並驗證寄件網域。
2. 在 DNS 加上 SPF / DKIM / DMARC，等生效。
3. 在 Supabase 的 Authentication → Email / SMTP 區塊填入 host / port / username / password /
   sender name / sender email。
4. 在 Email Templates 把確認信與重設信樣板的 `{{ .SiteURL }}` 改成 `{{ .RedirectTo }}`。
5. 在 URL Configuration 設好 Site URL 與 Redirect URLs（第 4.2 節表格）。
6. 在 Auth 設定把 Minimum password length 設為 6（或與前端同步改成 8），
   視方案決定要不要開 Leaked password protection。
7. 決定 Confirm email 開或關（第 3 節的決策表）。
8. 在 SQL Editor 跑 `supabase/migrations/002_orbit_app_hardening.sql`。
9. 照第 7 節的驗證清單逐項點過一遍。

---

## 10. 金鑰與安全（一定要遵守）

| 金鑰 | 可以放前端嗎 | 說明 |
| --- | --- | --- |
| `sb_publishable_retcEKBhxkjUFwB6IPELiw_YvEdrVOU` | ✅ 可以 | 設計上就是公開的 client key，靠 RLS 保護資料 |
| `sb_secret_...` | ❌ 絕對不行 | 可繞過 RLS |
| legacy `anon` key | ✅ 可以（但已逐步被 publishable key 取代） | 同上，靠 RLS |
| legacy `service_role` key | ❌ 絕對不行 | 可繞過 RLS，洩漏等於整個資料庫失守 |
| SMTP 密碼 / API key | ❌ 絕對不行 | 只存在 Supabase Dashboard 或你自己的後端 |
| Supabase access token（`sbp_...`） | ❌ 絕對不行 | 可透過 Management API 改專案設定 |

要記住的重點：**前端金鑰的公開不是漏洞，RLS 才是防線。**
Orbit 的三張表都啟用 RLS 且每個 policy 都以 `auth.uid()` 限定，
所以 publishable key 出現在 `web/app.js` 是正確的；反過來說，
**任何需要繞過 RLS 的操作都必須放在後端**，不能靠藏金鑰。

---

## 11. 官方來源

| 主題 | 來源 |
| --- | --- |
| 內建寄信限制（2 封／小時、只能寄給團隊成員、`Email address not authorized`）、custom SMTP 欄位、設定後 30 封／小時、SPF/DKIM/DMARC 建議、濫用防護 | [Send emails with custom SMTP — Supabase Docs](https://supabase.com/docs/guides/auth/auth-smtp) |
| 速率限制表格（emails sent、signups／sign-ins、signup confirmation 60 秒、password reset 60 秒）；路徑 `Authentication > Rate Limits` | [Rate limits — Supabase Docs](https://supabase.com/docs/guides/auth/rate-limits) |
| Redirect URLs、Site URL 的作用、wildcard 語法、deep linking URI 形式 | [Redirect URLs — Supabase Docs](https://supabase.com/docs/guides/auth/redirect-urls) |
| Confirm Email 選項位置與語意 | [General configuration — Supabase Docs](https://supabase.com/docs/guides/auth/general-configuration) |
| 密碼最小長度、required characters、leaked password protection（Pro 以上、HaveIBeenPwned） | [Password security — Supabase Docs](https://supabase.com/docs/guides/auth/password-security) |
| 樣板變數（`{{ .ConfirmationURL }}`、`{{ .TokenHash }}`、`{{ .SiteURL }}`、`{{ .RedirectTo }}`）、Email Templates 頁面 | [Email Templates — Supabase Docs](https://supabase.com/docs/guides/auth/auth-email-templates) |
| Custom URL scheme 與 deep link 允許清單寫法（`com.supabase://**`） | [Native Mobile Deep Linking — Supabase Docs](https://supabase.com/docs/guides/auth/native-mobile-deep-linking) |
| `auth.site_url` / `auth.additional_redirect_urls` 欄位語意 | [CLI config reference — Supabase Docs](https://supabase.com/docs/guides/local-development/cli/config) |
| Resend SMTP：`smtp.resend.com`、port `25/465/587/2465/2587`、username `resend` | [Send emails with SMTP — Resend](https://resend.com/docs/send-with-smtp) |
| Brevo SMTP：`smtp-relay.brevo.com:587`、username 為帳號 email、密碼為 SMTP key | [Postfix integration — Brevo](https://developers.brevo.com/docs/using-the-smtp-relay-with-postfix)、[Node.js SMTP relay example — Brevo](https://developers.brevo.com/docs/node-smtp-relay-example) |
| Mailgun：`smtp.mailgun.org`、port `25/465/587/2525`、建議 587 | [Sending messages via SMTP — Mailgun](https://documentation.mailgun.com/docs/mailgun/user-manual/sending-messages/send-smtp) |
| SendGrid：`smtp.sendgrid.net`、username 固定為 `apikey`、port `587` | [Integrating with the SMTP API — Twilio SendGrid](https://www.twilio.com/docs/sendgrid/for-developers/sending-email/integrating-with-the-smtp-api) |

---

## 12. 需要你替換的預留值

| 位置 | 預留值 | 說明 |
| --- | --- | --- |
| SMTP Password | `（請改成你的 Resend API key，例如 re_xxxxxxxx）` | 或你選的供應商密碼 |
| Sender email | `（請改成 no-reply@你的網域）` | 必須是已驗證的寄件網域 |
| 寄件網域 / DNS | `（請改成你的寄件網域，例如 auth.example.com）` | SPF / DKIM / DMARC |
| 本機 Redirect URL | `http://localhost:8000/**` | `（請改成你實際用的 port）` |
| 驗證用 Gmail | `（請改成一支不屬於你 Supabase 組織的 Gmail）` | 第 7 節第 1 項 |
| Site URL | `https://sanye0cooki.github.io/wellnest/` | 若改路徑或改自訂網域，這裡**必須**同步修改 |
