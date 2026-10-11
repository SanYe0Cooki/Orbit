/* ============================================================================
   Orbit — habit tracker
   ----------------------------------------------------------------------------
   Design rules:
   1) Guest mode is fully functional offline. Nothing leaves the device until
      the user signs in.
   2) Supabase is the source of truth once signed in, but every write also lands
      in local storage first, so a lost connection never loses a check-in.
   3) The habit id is the join key between habits and habit_logs. Whenever local
      records are uploaded, ids MUST be remapped, otherwise logs point at habits
      that no longer exist.
   ========================================================================== */
'use strict';

const CONFIG = {
  supabaseUrl: 'https://ldzputvalkeudijnrruz.supabase.co',
  supabaseKey: 'sb_publishable_retcEKBhxkjUFwB6IPELiw_YvEdrVOU',
  // Change this to the mailbox you actually monitor before publishing.
  supportEmail: 'support@example.com',
  privacyUrl: 'privacy.html',
  appVersion: '2.0.0',
  schemaReady: true
};

const KEY = {
  habits: 'orbit-habits-v1',
  logs: 'orbit-logs-v1',
  lang: 'orbit-lang-v1',
  theme: 'orbit-theme-v1',
  onboard: 'orbit-onboarded-v1',
  displayName: 'orbit-display-name-v1',
  avatar: 'orbit-avatar-v1',
  health: 'orbit-health-v1'
};

/* ------------------------------------------------------------------ state */
const state = {
  habits: [],
  logs: [],
  session: null,
  supabase: null,
  lang: 'zh-TW',
  theme: 'system',
  filter: 'active',
  authMode: 'login',
  editingId: null,
  draft: { icon: '✦', days: [0, 1, 2, 3, 4, 5, 6], target: 1, touchDays: false },
  openRow: null,
  busy: false,
  syncTimer: null,
  syncState: 'idle', // idle | syncing | ok | error
  native: false,
  progress: new Map(),
  displayName: '',
  avatar: '',
  userNumber: null,
  healthDone: { water: false, walk: false, sleep: false },
  mood: '',
  accent: '',
  reminderOn: false
};

const $ = (id) => document.getElementById(id);

/* ------------------------------------------------------- storage helpers */
const store = {
  get(k, fallback) {
    try {
      const raw = localStorage.getItem(k);
      return raw == null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  },
  set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota / private mode */ }
  },
  del(k) { try { localStorage.removeItem(k); } catch {} }
};

function persist() {
  store.set(KEY.habits, state.habits);
  store.set(KEY.logs, state.logs);
}

/* ------------------------------------------------------------ date utils */
const pad = (n) => String(n).padStart(2, '0');
function localDate(d = new Date()) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function dateFromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function dayIndex(d = new Date()) { return d.getDay(); } // 0 = Sunday, matches schema
function todayKey() { return localDate(); }
function shiftDays(key, delta) {
  const d = dateFromKey(key);
  d.setDate(d.getDate() + delta);
  return localDate(d);
}
function timezoneName() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}

/* ------------------------------------------------------------- i18n ---- */
const DICT = {
  'zh-TW': {
    eyebrow: 'A LITTLE BETTER, EVERY DAY',
    greeting: '今天，慢慢來也很好。',
    today: '今日完成', todayTaps: '今日目標次數', streak: '連續天數', todayHabits: '今日習慣',
    gentle: '不求完美，只求持續。', add: '新增',
    local: '訪客模式的資料只會儲存在這台裝置。',
    rest: '今天沒有排定的習慣，休息也是計畫的一部分。',
    progress: '今天的節奏', step: '一步一步來', progressCopy: '完成一件小事，也值得肯定。',
    allDone: '今天的你都完成了 🎉', focus: '今日提醒', focusText: '先從最簡單的一件事開始。',
    quick: '快速新增', quickCopy: '把想養成的小習慣寫下來。', quickPlaceholder: '例如：散步 10 分鐘',
    empty: '今天先留一點空間給自己', emptySub: '新增一個小習慣，開始你的第一步。',
    all: '所有習慣', habitEyebrow: 'YOUR ROUTINE', habitHeading: '我的習慣',
    habitSub: '小小的重複，會慢慢改變生活。',
    filterActive: '進行中', filterPaused: '已暫停', filterArchived: '已封存', filterAll: '全部',
    noHabitsFilter: '這個分類裡還沒有習慣。',
    insightEyebrow: 'NOTICE YOUR GROWTH', insightHeading: '看見自己的進步',
    insightSub: '不需要每天滿分，持續就很了不起。', week: '近七天的完成紀錄',
    total: '累計完成次數', active: '進行中的習慣',
    best: '最穩定的習慣', bestEmpty: '累積幾天紀錄後，這裡會顯示你的成果。',
    rateLabel: '達成率',
    profileEyebrow: 'YOUR ORBIT', profileHeading: '個人設定', profileSub: '讓 Orbit 配合你的生活節奏。',
    accountStatus: '帳號狀態', language: '介面語言', theme: '外觀', data: '資料儲存',
    guest: '訪客模式', localStorage: '本機', login: '登入 / 同步', logout: '登出',
    profileNote: '登入後，習慣與打卡記錄會同步到你的帳號。', export: '匯出資料', import: '匯入資料',
    about: '關於 Orbit', version: '版本', privacy: '隱私政策', support: '問題回報',
    health: 'Orbit 是一般生活習慣工具，不是醫療服務，也不能取代專業建議。',
    dangerTitle: '帳號與資料', dangerNote: '刪除帳號會永久移除你的習慣與打卡紀錄，無法復原。',
    deleteAccount: '刪除我的帳號與資料',
    habitModal: '新增習慣', habitModalEdit: '編輯習慣',
    habitModalDesc: '從一件簡單、容易做到的小事開始。',
    icon: '圖示', habitName: '習慣名稱', habitNamePlaceholder: '例如：喝一杯水',
    habitDesc: '提醒（選填）', habitDescPlaceholder: '讓自己更容易記得',
    schedule: '重複的日子', daily: '每天', target: '一天幾次', save: '儲存習慣', saveEdit: '儲存變更',
    authTitle: '登入 Orbit', authDesc: '用電子郵件註冊或登入，習慣就會在手機與電腦之間同步。',
    email: '電子郵件', password: '密碼', passwordHint: '至少 6 個字元',
    authSubmit: '登入 / 建立帳號', authSubmitSignup: '登入 / 建立帳號', authSubmitLogin: '登入 / 建立帳號',
    authMode: '還沒有帳號？建立帳號',
    authModeBack: '已經有帳號？登入', authNotice: '輸入電子郵件與密碼：第一次使用會自動建立帳號，之後就是登入。',
    authNoticeSignup: '輸入電子郵件與密碼：第一次使用會自動建立帳號，之後就是登入。',
    forgot: '忘記密碼', resetTitle: '重設密碼',
    resetDesc: '輸入註冊用的電子郵件，我們會寄送重設連結給你。',
    resetEmail: '電子郵件', resetSubmit: '寄送重設連結', newPassTitle: '設定新密碼',
    newPassDesc: '請設定一組新的密碼，至少 6 個字元。', newPass: '新密碼', newPassSubmit: '更新密碼',
    synced: '雲端同步', syncing: '同步中…', offline: '僅限此裝置', notLoggedIn: '未登入',
    done: '已完成', undo: '取消完成', delete: '刪除', pause: '暫停', resume: '繼續',
    archive: '封存', unarchive: '取消封存', edit: '編輯', detail: '詳情',
    confirmDelete: '確定要刪除這個習慣嗎？相關打卡也會一併刪除。',
    confirmDeleteAccount: '這會永久刪除你的帳號、所有習慣與打卡紀錄。要繼續嗎？',
    confirmMerge: '要把這台裝置上的習慣合併到你的帳號嗎？合併不會刪除雲端既有的紀錄。',
    welcome: '歡迎回來！', signedOut: '已登出', sent: '請查看電子郵件完成驗證。',
    accountReady: '註冊完成，已直接登入！',
    confirmPending: '這個信箱可能已經註冊過，請確認密碼是否正確；若剛註冊過，請先完成信箱驗證。',
    saved: '已儲存', deleted: '已刪除', updated: '已更新',
    needLogin: '請先登入再同步。', needEmail: '請輸入有效的電子郵件。',
    needName: '請輸入習慣名稱。', needDay: '請至少選一天。',
    syncError: '雲端同步失敗，請稍後再試。',
    schemaError: '雲端資料表還沒建立，請先在 Supabase 執行 schema.sql。',
    badLogin: '電子郵件或密碼不正確。',
    emailTaken: '這個電子郵件已經註冊過，請直接登入。',
    weakPass: '密碼至少需要 6 個字元。',
    netError: '網路連線似乎有問題，資料已存在本機。',
    resetSent: '如果這個信箱已註冊，重設連結已經寄出。',
    resetDone: '密碼已更新，請重新登入。',
    exported: '已匯出資料檔。', imported: '已匯入資料。', importBad: '這個檔案無法讀取。',
    confirmTitle: '確定嗎？', cancel: '取消', ok: '確定',
    streakUnit: '天', dayNames: ['日', '一', '二', '三', '四', '五', '六'],
    dayShort: ['日', '一', '二', '三', '四', '五', '六'],
    themeSystem: '跟隨系統', themeLight: '淺色', themeDark: '深色',
    progressOf: (a, b) => a + ' / ' + b + ' 次',
    supports: (a, b) => a + '/' + b + ' 天'
  },
  en: {
    eyebrow: 'A LITTLE BETTER, EVERY DAY',
    greeting: 'A little progress is still progress.',
    today: 'Done today', todayTaps: 'Target taps today', streak: 'Day streak', todayHabits: 'Today’s habits',
    gentle: 'No perfection needed. Just keep going.', add: 'Add',
    local: 'Guest data is stored only on this device.',
    rest: 'Nothing scheduled today — rest is part of the plan.',
    progress: 'Today’s rhythm', step: 'One step at a time', progressCopy: 'One small win is worth celebrating.',
    allDone: 'Everything done for today 🎉', focus: 'A gentle reminder', focusText: 'Start with the easiest thing.',
    quick: 'Quick add', quickCopy: 'Write down a small habit you want to build.', quickPlaceholder: 'e.g. Walk for 10 minutes',
    empty: 'Leave a little room for yourself today', emptySub: 'Add a small habit and take your first step.',
    all: 'All habits', habitEyebrow: 'YOUR ROUTINE', habitHeading: 'My habits',
    habitSub: 'Small repetitions can gently change your life.',
    filterActive: 'Active', filterPaused: 'Paused', filterArchived: 'Archived', filterAll: 'All',
    noHabitsFilter: 'Nothing in this list yet.',
    insightEyebrow: 'NOTICE YOUR GROWTH', insightHeading: 'Look how far you’ve come',
    insightSub: 'You don’t need a perfect day. Consistency matters.', week: 'Completions over the last 7 days',
    total: 'Total completions', active: 'Active habits',
    best: 'Most consistent habits', bestEmpty: 'After a few days of records, your progress shows up here.',
    rateLabel: 'Rate',
    profileEyebrow: 'YOUR ORBIT', profileHeading: 'Settings', profileSub: 'Make Orbit fit your rhythm.',
    accountStatus: 'Account', language: 'Language', theme: 'Appearance', data: 'Data storage',
    guest: 'Guest mode', localStorage: 'On this device', login: 'Sign in / Sync', logout: 'Sign out',
    profileNote: 'Sign in to sync habits and check-ins across devices.', export: 'Export data', import: 'Import data',
    about: 'About Orbit', version: 'Version', privacy: 'Privacy policy', support: 'Report a problem',
    health: 'Orbit is a general habit tool. It is not a medical service and does not replace professional advice.',
    dangerTitle: 'Account and data', dangerNote: 'Deleting your account permanently removes your habits and check-ins.',
    deleteAccount: 'Delete my account and data',
    habitModal: 'Add a habit', habitModalEdit: 'Edit habit',
    habitModalDesc: 'Start with something simple and achievable.',
    icon: 'Icon', habitName: 'Habit name', habitNamePlaceholder: 'e.g. Drink a glass of water',
    habitDesc: 'Note (optional)', habitDescPlaceholder: 'A little reminder for yourself',
    schedule: 'Repeat on', daily: 'Every day', target: 'Times per day', save: 'Save habit', saveEdit: 'Save changes',
    authTitle: 'Sign in to Orbit', authDesc: 'Register or sign in with your email to sync across devices.',
    email: 'Email address', password: 'Password', passwordHint: 'At least 6 characters',
    authSubmit: 'Sign in / Create account', authSubmitSignup: 'Sign in / Create account', authSubmitLogin: 'Sign in / Create account',
    authMode: 'New here? Create an account',
    authModeBack: 'Already have an account? Sign in', authNotice: 'Enter an email and a password: the first time creates the account, after that it signs you in.',
    authNoticeSignup: 'Enter an email and a password: the first time creates the account, after that it signs you in.',
    forgot: 'Forgot password', resetTitle: 'Reset password',
    resetDesc: 'Enter the email you registered with and we will send a reset link.',
    resetEmail: 'Email address', resetSubmit: 'Send reset link', newPassTitle: 'Set a new password',
    newPassDesc: 'Choose a new password, at least 6 characters.', newPass: 'New password', newPassSubmit: 'Update password',
    synced: 'Cloud sync', syncing: 'Syncing…', offline: 'This device only', notLoggedIn: 'Signed out',
    done: 'Completed', undo: 'Undo', delete: 'Delete', pause: 'Pause', resume: 'Resume',
    archive: 'Archive', unarchive: 'Unarchive', edit: 'Edit', detail: 'Details',
    confirmDelete: 'Delete this habit and all of its check-ins?',
    confirmDeleteAccount: 'This permanently deletes your account, all habits and all check-ins. Continue?',
    confirmMerge: 'Merge the habits on this device into your account? Existing cloud records are kept.',
    welcome: 'Welcome back!', signedOut: 'Signed out', sent: 'Check your email to finish verification.',
    accountReady: 'Account created — you are signed in!',
    confirmPending: 'That email may already be registered — check the password, or finish verifying the address first.',
    saved: 'Saved', deleted: 'Deleted', updated: 'Updated',
    needLogin: 'Sign in to sync your data.', needEmail: 'Enter a valid email address.',
    needName: 'Give the habit a name.', needDay: 'Pick at least one day.',
    syncError: 'Cloud sync failed. Please try again later.',
    schemaError: 'The cloud tables are missing. Apply supabase/schema.sql first.',
    badLogin: 'That email or password is not correct.',
    emailTaken: 'That email is already registered. Try signing in instead.',
    weakPass: 'The password needs at least 6 characters.',
    netError: 'Looks like you are offline. Your data is saved on this device.',
    resetSent: 'If that email is registered, a reset link is on its way.',
    resetDone: 'Password updated. Please sign in again.',
    exported: 'Data exported.', imported: 'Data imported.', importBad: 'That file could not be read.',
    confirmTitle: 'Are you sure?', cancel: 'Cancel', ok: 'Confirm',
    streakUnit: 'days', dayNames: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    dayShort: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
    themeSystem: 'Follow system', themeLight: 'Light', themeDark: 'Dark',
    progressOf: (a, b) => a + ' / ' + b,
    supports: (a, b) => a + '/' + b + ' days'
  }
};
const t = (k) => (DICT[state.lang] && DICT[state.lang][k] !== undefined) ? DICT[state.lang][k] : (DICT['zh-TW'][k] !== undefined ? DICT['zh-TW'][k] : k);

/* ----------------------------------------------------------- UI helpers */
let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}
function showModal(id) { $(id).classList.add('show'); }
function hideModal(id) { $(id).classList.remove('show'); }
function hideAllModals() { document.querySelectorAll('.backdrop.show').forEach((b) => b.classList.remove('show')); }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function buzz(style) {
  if (!state.native) return;
  try {
    const H = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics;
    if (!H) return;
    if (style === 'success') H.impact({ style: 'light' });
    else if (style === 'warn') H.notification({ type: 'warning' });
    else H.impact({ style: 'light' });
  } catch { /* haptics are a bonus, never a failure */ }
}
function spinner(on) { state.busy = on; }

/* ---------------------------------------------------------- confirm dlg */
let confirmResolver = null;
function askConfirm(message, okLabel) {
  return new Promise((resolve) => {
    confirmResolver = resolve;
    $('confirmDesc').textContent = message;
    $('confirmOk').textContent = okLabel || t('ok');
    $('confirmCancel').textContent = t('cancel');
    $('confirmTitle').textContent = t('confirmTitle');
    showModal('confirmModal');
  });
}
function resolveConfirm(value) {
  hideModal('confirmModal');
  const fn = confirmResolver;
  confirmResolver = null;
  if (fn) fn(value);
}

/* ------------------------------------------------------- habit utilities */
function activeHabits() { return state.habits.filter((h) => h.status !== 'archived'); }
function todayHabits() { return activeHabits().filter((h) => h.status !== 'paused' && scheduledOn(h, todayKey())); }
function scheduledOn(habit, dateKey) {
  const days = (habit.schedule_days && habit.schedule_days.length) ? habit.schedule_days : [0, 1, 2, 3, 4, 5, 6];
  return days.indexOf(dayIndex(dateFromKey(dateKey))) !== -1;
}
function targetOf(habit) { return Math.max(1, Number(habit.target_count) || 1); }
function progressKey(dateKey, habitId) { return dateKey + '|' + habitId; }
function countFor(habitId, dateKey) {
  const mem = state.progress.get(progressKey(dateKey, habitId));
  if (mem !== undefined) return mem;
  const row = state.logs.find((l) => l.habit_id === habitId && l.date === dateKey);
  return row ? (Number(row.completed_count) || 1) : 0;
}
function isDone(habitId, dateKey) {
  const habit = state.habits.find((h) => h.id === habitId);
  return countFor(habitId, dateKey) >= (habit ? targetOf(habit) : 1);
}
function doneCountToday() { return todayHabits().filter((h) => isDone(h.id, todayKey())).length; }

/** Streak counts back from today. Rest days (nothing scheduled) do not break it. */
function calcStreak() {
  let streak = 0;
  let key = todayKey();
  for (let i = 0; i < 3660; i++) {
    const scheduled = activeHabits().filter((h) => h.status !== 'paused' && scheduledOn(h, key));
    if (!scheduled.length) { key = shiftDays(key, -1); continue; }
    const anyDone = scheduled.some((h) => isDone(h.id, key));
    if (anyDone) { streak++; key = shiftDays(key, -1); continue; }
    // Today has not been completed yet — don't reset the streak for the current day.
    if (key === todayKey()) { key = shiftDays(key, -1); continue; }
    break;
  }
  return streak;
}

function scheduleText(habit) {
  const days = (habit.schedule_days && habit.schedule_days.length) ? habit.schedule_days.slice().sort() : [0, 1, 2, 3, 4, 5, 6];
  const names = t('dayShort');
  if (days.length === 7) return t('daily');
  return days.map((d) => names[d]).join(' ');
}

/* ------------------------------------------------------------- wellness */
const HEALTH_TIPS = {
  'zh-TW': [
    '💧 記得喝水，一天建議喝 1500–2000ml，分次飲用。',
    '🚶 久坐超過一小時，站起來走兩分鐘，讓眼睛和肩膀休息。',
    '😴 睡前一小時放下手機，燈光調暗，有助於入眠。',
    '🧘 腹式呼吸五分鐘：吸氣四秒、屏息四秒、吐氣六秒。',
    '🌿 今天曬到太陽了嗎？戶外十分鐘有助於維持生理時鐘。',
    '🥗 三餐定時，蔬菜佔餐盘一半，蛋白質和澱粉各四分之一。',
    '✍️ 寫下三件今天感謝的小事，大腦會更習慣注意好事。'
  ],
  'en': [
    '💧 Stay hydrated — aim for 1.5–2L of water throughout the day.',
    '🚶 Stand up and stretch for 2 minutes after every hour of sitting.',
    '😴 Put your phone down an hour before bed — dim the lights.',
    '🧘 Try 5 minutes of box breathing: 4s in, 4s hold, 6s out.',
    '🌿 Got some sun today? 10 minutes outdoors helps your circadian rhythm.',
    '🥗 Keep meals regular: half the plate veggies, quarter protein, quarter carbs.',
    '✍️ Write down three small things you appreciated today.'
  ]
};
function dailyHealthTip() {
  const tips = HEALTH_TIPS[state.lang] || HEALTH_TIPS['en'];
  const day = Math.floor(Date.now() / 86400000);
  return tips[day % tips.length];
}

/* ------------------------------------------------------------- quotes */
const QUOTES = {
  'zh-TW': [
    '小小的堅持，時間會給你答案。',
    '進步不是直線，是螺旋。',
    '今天比昨天好一點，就夠了。',
    '習慣是你對自己的承諾。',
    '不用和別人比，和昨天的自己比就好。',
    '簡單的事重複做，就是不簡單。',
    '每一次打卡，都是在告訴自己：我說到做到。',
    '開始比完美重要。',
    '你不需要很厲害才開始，但你需要開始才會很厲害。',
    '慢慢来，比较快。'
  ],
  'en': [
    'Small steps every day add up to something big.',
    'Progress is not a straight line — it is a spiral.',
    'A little better than yesterday is enough.',
    'A habit is a promise you keep to yourself.',
    'Compare yourself to who you were yesterday.',
    'Simple things done repeatedly become extraordinary.',
    'Every check-in tells yourself: I follow through.',
    'Starting matters more than perfecting.',
    'You do not need to be great to start, but you need to start to be great.',
    'Slow is smooth, smooth is fast.'
  ]
};
function dailyQuote() {
  const q = QUOTES[state.lang] || QUOTES['en'];
  const day = Math.floor(Date.now() / 86400000);
  return q[day % q.length];
}

/* ------------------------------------------------------------- avatar / name */
function applyAvatar() {
  const img = $('avatarImg');
  const fallback = $('avatarFallback');
  if (state.avatar) {
    img.src = state.avatar;
    img.style.display = 'block';
    fallback.style.display = 'none';
  } else {
    img.style.display = 'none';
    fallback.style.display = 'block';
    fallback.textContent = state.displayName ? state.displayName.charAt(0).toUpperCase() : '◌';
  }
}

function applyProfileInfo() {
  const name = state.displayName || (state.session ? (state.session.user.email || 'Orbit').split('@')[0] : '訪客');
  $('profileDisplayName').textContent = name;
  if (state.session) {
    const num = state.userNumber ? String(state.userNumber).padStart(6, '0') : '------';
    $('profileUserId').textContent = 'ID: ' + num;
    $('profileUserEmail').textContent = state.session.user.email || '';
  } else {
    $('profileUserId').textContent = state.displayName ? '本地資料' : '尚未登入';
    $('profileUserEmail').textContent = '';
  }
  applyAvatar();
}

function handleAvatarFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const size = 128;
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      // cover-crop to square
      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      state.avatar = dataUrl;
      store.set(KEY.avatar, dataUrl);
      applyAvatar();
      syncProfile();
      toast('頭像已更新');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

async function editDisplayName() {
  const current = state.displayName || '';
  const next = window.prompt(state.lang === 'en' ? 'Enter your name' : '輸入你的名字', current);
  if (next === null) return;
  const trimmed = next.trim().slice(0, 20);
  if (!trimmed) return;
  state.displayName = trimmed;
  store.set(KEY.displayName, trimmed);
  applyProfileInfo();
  syncProfile();
  toast('已儲存');
}

async function syncProfile() {
  if (!state.session || !state.supabase) return;
  const uid = state.session.user.id;
  const patch = {};
  if (state.displayName) patch.display_name = state.displayName;
  // avatar_url column is added by migration 004; ignore if it does not exist yet
  if (state.avatar) patch.avatar_url = state.avatar;
  try {
    await state.supabase.from('profiles').upsert({ id: uid, ...patch });
  } catch (e) { /* column may not exist yet — non-fatal */ }
}

async function loadProfileFromCloud() {
  if (!state.session || !state.supabase) return;
  try {
    const { data } = await state.supabase.from('profiles').select('*').eq('id', state.session.user.id).single();
    if (!data) return;
    if (data.display_name) { state.displayName = data.display_name; store.set(KEY.displayName, data.display_name); }
    if (data.avatar_url) { state.avatar = data.avatar_url; store.set(KEY.avatar, data.avatar_url); }
    if (data.user_number) { state.userNumber = data.user_number; }
  } catch (e) { /* profiles table may be empty — fine */ }
}

/* ------------------------------------------------------------- rendering */
const ICONS = ['✦', '💧', '🏃', '📖', '🧘', '🥗', '😴', '🎧', '✍️', '🧹', '💊', '☀️', '🌙', '🚶', '🎯', '💪'];

function buildIconPicker() {
  const box = $('iconPicker');
  box.innerHTML = ICONS.map((ic) => '<button type="button" data-icon="' + ic + '" aria-label="' + ic + '">' + ic + '</button>').join('');
  box.querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      state.draft.icon = b.dataset.icon;
      box.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.icon === state.draft.icon));
    });
  });
}
function syncIconPicker() {
  const box = $('iconPicker');
  if (!box) return;
  box.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.icon === state.draft.icon));
}
function buildDayChips() {
  const box = $('dayChips');
  box.innerHTML = [1, 2, 3, 4, 5, 6, 0].map((d) => '<button type="button" class="chip" data-day="' + d + '">' + t('dayShort')[d] + '</button>').join('');
  box.querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      const d = Number(b.dataset.day);
      const i = state.draft.days.indexOf(d);
      if (i === -1) state.draft.days.push(d); else state.draft.days.splice(i, 1);
      syncDayChips();
    });
  });
  syncDayChips();
}
function syncDayChips() {
  const box = $('dayChips');
  if (!box) return;
  box.querySelectorAll('button').forEach((b) => b.classList.toggle('on', state.draft.days.indexOf(Number(b.dataset.day)) !== -1));
  const all = state.draft.days.length === 7;
  $('dailyToggle').classList.toggle('on', all);
  $('dailyToggle').setAttribute('aria-pressed', String(all));
}
function syncTarget() { $('targetValue').textContent = state.draft.target; }

function habitRowHtml(habit, opts) {
  const dateKey = (opts && opts.dateKey) || todayKey();
  const done = isDone(habit.id, dateKey);
  const paused = habit.status === 'paused';
  const archived = habit.status === 'archived';
  const count = countFor(habit.id, dateKey);
  const target = targetOf(habit);
  const meta = archived ? t('filterArchived') : (paused ? t('filterPaused') : scheduleText(habit));
  const counter = target > 1 ? ' · ' + t('progressOf')(Math.min(count, target), target) : '';
  const open = state.openRow === habit.id;
  const row =
    '<div class="habit ' + (done ? 'done ' : '') + (paused ? 'paused ' : '') + (open ? 'open' : '') + '" data-row="' + habit.id + '">' +
      '<div class="iconbox" aria-hidden="true">' + esc(habit.icon || '✦') + '</div>' +
      '<button type="button" class="habit-body" data-open="' + habit.id + '" aria-label="' + t('detail') + '">' +
        '<span class="habitinfo"><strong>' + esc(habit.name) + '</strong>' +
        '<small>' + esc(meta + counter + (habit.description ? ' · ' + habit.description : '')) + '</small></span>' +
      '</button>' +
      (archived ? '' :
        '<button type="button" class="tick ' + (done ? 'done' : '') + '" data-toggle="' + habit.id + '" aria-label="' + (done ? t('undo') : t('done')) + '" aria-pressed="' + done + '">' +
        (target > 1 ? '<span class="tick-num">' + Math.min(count, target) + '/' + target + '</span>' : '✓') +
        '</button>') +
    '</div>';
  if (!open) return row;
  const actions =
    '<div class="habit-actions" data-actions="' + habit.id + '">' +
      '<div class="row">' +
        '<button type="button" class="btn" data-act="edit" data-id="' + habit.id + '">' + t('edit') + '</button>' +
        (archived
          ? '<button type="button" class="btn" data-act="unarchive" data-id="' + habit.id + '">' + t('unarchive') + '</button>'
          : (paused
            ? '<button type="button" class="btn" data-act="resume" data-id="' + habit.id + '">' + t('resume') + '</button>'
            : '<button type="button" class="btn" data-act="pause" data-id="' + habit.id + '">' + t('pause') + '</button>')) +
        (archived ? '' : '<button type="button" class="btn" data-act="archive" data-id="' + habit.id + '">' + t('archive') + '</button>') +
        '<button type="button" class="btn danger" data-act="delete" data-id="' + habit.id + '">' + t('delete') + '</button>' +
      '</div>' +
    '</div>';
  return row + actions;
}

function renderHabitLists() {
  const todayList = $('habitList');
  const list = todayHabits();
  todayList.innerHTML = list.length
    ? list.map((h) => habitRowHtml(h, {})).join('')
    : '<div class="empty"><b>' + t('empty') + '</b>' + t('emptySub') + '</div>';

  const filtered = state.habits.filter((h) => state.filter === 'all' ? true : h.status === state.filter);
  filtered.sort((a, b) => (a.status === b.status ? String(b.created_at || '').localeCompare(String(a.created_at || '')) : (a.status === 'active' ? -1 : 1)));
  $('allHabitList').innerHTML = filtered.length
    ? filtered.map((h) => habitRowHtml(h, {})).join('')
    : '<div class="empty">' + t('noHabitsFilter') + '</div>';
}

function renderChart() {
  const days = [];
  const names = t('dayNames');
  for (let i = 6; i >= 0; i--) {
    const key = shiftDays(todayKey(), -i);
    const scheduled = activeHabits().filter((h) => h.status !== 'paused' && scheduledOn(h, key));
    const done = scheduled.filter((h) => isDone(h.id, key)).length;
    days.push({ key, label: names[dayIndex(dateFromKey(key))], done, scheduled, today: i === 0 });
  }
  const max = Math.max(1, ...days.map((d) => d.done));
  $('weekChart').innerHTML = days.map((d) => {
    const title = d.done + '/' + d.scheduled;
    // weather emoji by weekday
    const weather = [
      { e: '☀️', bg: 'linear-gradient(180deg,#f5c86a,#f0a04b)' },
      { e: '⛅', bg: 'linear-gradient(180deg,#9aabba,#7a8a9a)' },
      { e: '🌤️', bg: 'linear-gradient(180deg,#8cb4c9,#6a8caf)' },
      { e: '🌦️', bg: 'linear-gradient(180deg,#7a9ab8,#5a7a9a)' },
      { e: '🌈', bg: 'linear-gradient(180deg,#e8b4b8,#b8c9e8)' },
      { e: '🌙', bg: 'linear-gradient(180deg,#4a5a7a,#2a3a5a)' },
      { e: '❄️', bg: 'linear-gradient(180deg,#cdddee,#aac4dd)' }
    ];
    const wi = dayIndex(dateFromKey(d.key)) % weather.length;
    const w = weather[wi];
    // completion overrides the weather color
    const ratio = d.scheduled ? d.done / d.scheduled : 0;
    let barBg = w.bg;
    if (d.scheduled === 0) barBg = 'linear-gradient(180deg,#e8e8e8,#d8d8d8)';
    else if (ratio >= 1) barBg = 'linear-gradient(180deg,#5a9a6a,#3a7a4a)';
    else if (ratio > 0) barBg = 'linear-gradient(180deg,#8bc4a0,#5a9a6a)';
    return '<div class="barcol' + (d.today ? ' today' : '') + '" title="' + title + '">' +
      '<div class="bar-emoji">' + w.e + '</div>' +
      '<div class="bar weather-bar" style="background:' + barBg + ';height:80px"><i style="height:0%"></i></div>' +
      '<span>' + esc(d.label) + '</span>' +
    '</div>';
  }).join('');
  $('totalLogs').textContent = String(state.logs.filter((l) => (Number(l.completed_count) || 1) > 0).length);
  $('activeHabits').textContent = String(activeHabits().length);
}

function renderBest() {
  const rows = [];
  for (const habit of activeHabits()) {
    let scheduled = 0, done = 0;
    for (let i = 0; i < 28; i++) {
      const key = shiftDays(todayKey(), -i);
      if (!scheduledOn(habit, key)) continue;
      scheduled++;
      if (isDone(habit.id, key)) done++;
    }
    if (scheduled >= 3) rows.push({ habit, scheduled, done, rate: Math.round((done / scheduled) * 100) });
  }
  rows.sort((a, b) => b.rate - a.rate || b.scheduled - a.scheduled);
  const top = rows.slice(0, 4);
  if (!top.length) {
    $('bestList').innerHTML = '<div class="empty">' + t('bestEmpty') + '</div>';
    return;
  }
  $('bestList').innerHTML = top.map((r) =>
    '<div class="profileline"><span>' + esc(r.habit.icon || '✦') + ' ' + esc(r.habit.name) + '</span>' +
    '<b class="val">' + r.rate + '% · ' + t('supports')(r.done, r.scheduled) + '</b></div>'
  ).join('');
}

function render() {
  document.documentElement.lang = state.lang;
  // hero
  $('dateText').textContent = new Intl.DateTimeFormat(state.lang === 'en' ? 'en-US' : 'zh-TW', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  }).format(new Date());
  // Hero counters.
  // A habit can require several taps (target_count). "1/3" next to a habit that
  // still shows an empty tick is confusing, so when any habit needs more than
  // one tap the big counter switches to taps-of-target and says so.
  const list = todayHabits();
  const today = todayKey();
  const targetSum = list.reduce((sum, h) => sum + targetOf(h), 0);
  const tapSum = list.reduce((sum, h) => sum + Math.min(countFor(h.id, today), targetOf(h)), 0);
  const doneHabits = list.filter((h) => isDone(h.id, today)).length;
  const usesTargets = list.some((h) => targetOf(h) > 1);

  $('doneCount').textContent = usesTargets ? (tapSum + '/' + targetSum) : (doneHabits + '/' + list.length);
  $('todayLabel').textContent = usesTargets ? t('todayTaps') : t('today');
  $('streakCount').textContent = String(calcStreak());

  const pct = usesTargets
    ? (targetSum ? Math.round((tapSum / targetSum) * 100) : 0)
    : (list.length ? Math.round((doneHabits / list.length) * 100) : 0);
  $('progressRing').style.setProperty('--pct', pct + '%');
  $('progressPct').textContent = pct + '%';
  const allDone = list.length > 0 && (usesTargets ? tapSum >= targetSum : doneHabits === list.length);
  $('progressHeadline').textContent = allDone ? t('allDone') : t('step');
  $('progressCopy').textContent = list.length ? t('progressCopy') : t('rest');
  $('restNote').classList.toggle('hidden', list.length > 0);
  $('restNote').textContent = t('rest');

  renderHabitLists();
  renderChart();
  renderBest();

  // header + account
  $('syncState').textContent = state.session ? '● ' + t('synced') : '● ' + t('offline');
  $('syncState').classList.toggle('warn', state.syncState === 'error');
  $('syncState').classList.toggle('busy', state.syncState === 'syncing');
  $('accountBtn').textContent = state.session ? (state.session.user.email || 'Orbit') : t('login');
  $('profileAccountBtn').textContent = state.session ? t('logout') : t('login');
  $('profileStatus').textContent = state.session ? (state.session.user.email || 'Orbit') : t('guest');
  $('storageStatus').textContent = state.session ? 'Supabase' : t('localStorage');
  $('signOutBtn').classList.toggle('hidden', !state.session);
  $('profileAccountBtn').classList.toggle('primary', !state.session);
  $('localNote').classList.toggle('hidden', !!state.session);
  $('dangerPanel').classList.toggle('hidden', !state.session);
  $('versionValue').textContent = CONFIG.appVersion;

  // profile hero + wellness
  applyProfileInfo();
  $('healthTip').textContent = dailyHealthTip();
  $('waterBtn').classList.toggle('on', state.healthDone.water);
  $('walkBtn').classList.toggle('on', state.healthDone.walk);
  $('sleepBtn').classList.toggle('on', state.healthDone.sleep);

  // daily quote + mood
  if ($('dailyQuote')) $('dailyQuote').textContent = dailyQuote();
  if ($('moodRow')) {
    $('moodRow').querySelectorAll('button').forEach((b) => {
      b.classList.toggle('on', b.dataset.mood === state.mood);
    });
  }

  // habits page stats
  if ($('hActiveCount')) $('hActiveCount').textContent = String(activeHabits().length);
  if ($('hDoneToday')) $('hDoneToday').textContent = String(todayHabits().filter((h) => isDone(h.id, todayKey())).length);
  if ($('hTotalLogs')) $('hTotalLogs').textContent = String(state.logs.filter((l) => (Number(l.completed_count) || 1) > 0).length);

  // reminder button label
  if ($('reminderBtn')) $('reminderBtn').textContent = state.reminderOn ? '已開啟 ✓' : '開啟';
  // accent color dots
  if ($('colorRow')) {
    $('colorRow').querySelectorAll('.color-dot').forEach((x) => x.classList.toggle('on', x.dataset.color === state.accent));
  }

  applyStrings();
}

function applyStrings() {
  const map = {
    eyebrow: 'eyebrow', greeting: 'greeting', streakLabel: 'streak',
    todayHabits: 'todayHabits', gentle: 'gentle', addText: 'add', addText2: 'add',
    localNote: 'local', progressTitle: 'progress', progressHeadline: 'step', progressCopy: 'progressCopy',
    focusLabel: 'focus', focusText: 'focusText', quickTitle: 'quick', quickCopy: 'quickCopy',
    allHabits: 'all', habitsEyebrow: 'habitEyebrow', habitsHeading: 'habitHeading', habitsSub: 'habitSub',
    insightEyebrow: 'insightEyebrow', insightHeading: 'insightHeading', insightSub: 'insightSub',
    weekTitle: 'week', totalLogsLabel: 'total', activeHabitsLabel: 'active',
    bestTitle: 'best',
    profileEyebrow: 'profileEyebrow', profileHeading: 'profileHeading', profileSub: 'profileSub',
    accountStatusLabel: 'accountStatus', languageLabel: 'language', themeLabel: 'theme', dataLabel: 'data',
    profileNote: 'profileNote', exportBtn: 'export', importBtn: 'import', signOutBtn: 'logout',
    aboutTitle: 'about', versionLabel: 'version', privacyLabel: 'privacy', supportLabel: 'support',
    exportLabel2: 'export',
    healthNote: 'health', dangerTitle: 'dangerTitle', dangerNote: 'dangerNote', deleteAccountBtn: 'deleteAccount',
    habitModalTitle: state.editingId ? 'habitModalEdit' : 'habitModal',
    habitModalDesc: 'habitModalDesc', iconLabel: 'icon', habitNameLabel: 'habitName',
    habitDescLabel: 'habitDesc', scheduleLabel: 'schedule', targetLabel: 'target',
    saveHabitBtn: state.editingId ? 'saveEdit' : 'save',
    authTitle: 'authTitle', authDesc: 'authDesc', emailLabel: 'email', passwordLabel: 'password',
    passwordHint: 'passwordHint',
    authSubmit: 'authSubmit',
    authNotice: 'authNotice', forgotBtn: 'forgot',
    resetTitle: 'resetTitle', resetDesc: 'resetDesc', resetEmailLabel: 'resetEmail', resetSubmit: 'resetSubmit',
    newPassTitle: 'newPassTitle', newPassDesc: 'newPassDesc', newPassLabel: 'newPass', newPassSubmit: 'newPassSubmit',
    filterActive: 'filterActive', filterPaused: 'filterPaused', filterArchived: 'filterArchived', filterAll: 'filterAll',
    tabToday: 'today', tabHabits: 'all', tabInsights: 'insightHeading', tabProfile: 'profileHeading'
  };
  for (const id in map) {
    const el = $(id);
    if (!el) continue;
    const value = t(map[id]);
    if (el.tagName === 'INPUT') el.placeholder = value;
    else el.textContent = value;
  }
  $('quickInput').placeholder = t('quickPlaceholder');
  $('habitName').placeholder = t('habitNamePlaceholder');
  $('habitDesc').placeholder = t('habitDescPlaceholder');
  $('email').placeholder = 'you@example.com';
  $('resetEmail').placeholder = 'you@example.com';
  $('langBtn').textContent = state.lang === 'zh-TW' ? '繁中' : (state.lang === 'en' ? 'EN' : stateLangName(state.lang));
  $('langBtn2').textContent = stateLangName(state.lang);
  $('themeBtn2').textContent = state.theme === 'dark' ? t('themeDark') : (state.theme === 'light' ? t('themeLight') : t('themeSystem'));
  $('themeBtn').textContent = state.theme === 'dark' ? '☀' : '◐';
  $('dailyToggle').textContent = t('daily');
}

/* -------------------------------------------------------------- theming */
function applyTheme() {
  const root = document.documentElement;
  if (state.theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', state.theme);
  const dark = state.theme === 'dark' ||
    (state.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0e1a15' : '#f6f7f2');
  if (state.native && window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.StatusBar) {
    try {
      window.Capacitor.Plugins.StatusBar.setStyle({ style: dark ? 'DARK' : 'LIGHT' });
    } catch {}
  }
}
function cycleTheme() {
  state.theme = state.theme === 'system' ? 'light' : (state.theme === 'light' ? 'dark' : 'system');
  store.set(KEY.theme, state.theme);
  applyTheme();
  applyStrings();
}

function applyAccent() {
  const root = document.documentElement;
  // Preset pairs: [accent, ink-on-accent, light-mint]
  const PRESETS = {
    '#315b49': { ink: '#fff', mint: '#e6eee5' },
    '#4a6fa5': { ink: '#fff', mint: '#e3ebf5' },
    '#8b5a8c': { ink: '#fff', mint: '#f0e4f0' },
    '#b85c3c': { ink: '#fff', mint: '#f7e6de' },
    '#5a7d5a': { ink: '#fff', mint: '#e4ede4' }
  };
  if (!state.accent || !PRESETS[state.accent]) {
    root.style.removeProperty('--green');
    root.style.removeProperty('--green-ink');
    root.style.removeProperty('--mint');
    return;
  }
  const p = PRESETS[state.accent];
  root.style.setProperty('--green', state.accent);
  root.style.setProperty('--green-ink', p.ink);
  root.style.setProperty('--mint', p.mint);
}

async function toggleReminder() {
  if (state.reminderOn) {
    state.reminderOn = false;
    store.set('orbit-reminder', false);
    toast('提醒已關閉');
    return;
  }
  if (!('Notification' in window)) { toast('此瀏覽器不支援通知'); return; }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { toast('需要通知權限才能提醒'); return; }
  state.reminderOn = true;
  store.set('orbit-reminder', true);
  toast('每日晚間 8 點會提醒你打卡');
  // fire one immediately as a test
  try { new Notification('Orbit 提醒已開啟 🌱', { body: '今晚 8 點會提醒你完成今日習慣。' }); } catch {}
}

function checkReminder() {
  if (!state.reminderOn || !('Notification' in window) || Notification.permission !== 'granted') return;
  const h = new Date().getHours();
  const done = todayHabits().length > 0 && todayHabits().every((hb) => isDone(hb.id, todayKey()));
  if (h >= 20 && !done) {
    try { new Notification('今天還差一點 ☑️', { body: '還有習慣沒完成，去打個卡吧。' }); } catch {}
  }
}

/* ------------------------------------------------------------- weather */
async function loadWeather() {
  try {
    // 1. get location from IP
    const ipRes = await fetch('https://ipapi.co/json/');
    const ip = await ipRes.json();
    const lat = ip.latitude, lon = ip.longitude, city = ip.city || '—';

    // 2. get weather from Open-Meteo
    const wxRes = await fetch(
      'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
      '&current=temperature_2m,weather_code&timezone=auto'
    );
    const wx = await wxRes.json();
    const temp = Math.round(wx.current.temperature_2m);
    const code = wx.current.weather_code;

    // 3. map code to emoji + gradient
    const WX = {
      0:  { e: '☀️', bg: 'linear-gradient(135deg,#f0a04b,#f5c86a)', label: '晴朗' },
      1:  { e: '🌤️', bg: 'linear-gradient(135deg,#6a8caf,#8cb4c9)', label: '大致晴朗' },
      2:  { e: '⛅', bg: 'linear-gradient(135deg,#7a8a9a,#9aabba)', label: '多雲' },
      3:  { e: '☁️', bg: 'linear-gradient(135deg,#6a7078,#8a9098)', label: '陰天' },
      45: { e: '🌫️', bg: 'linear-gradient(135deg,#8a8a8a,#aaaaaa)', label: '霧' },
      48: { e: '🌫️', bg: 'linear-gradient(135deg,#8a8a8a,#aaaaaa)', label: '霧' },
      51: { e: '🌦️', bg: 'linear-gradient(135deg,#5a7a9a,#7a9ab8)', label: '小毛毛雨' },
      53: { e: '🌦️', bg: 'linear-gradient(135deg,#5a7a9a,#7a9ab8)', label: '毛毛雨' },
      55: { e: '🌧️', bg: 'linear-gradient(135deg,#4a6a8a,#6a8aaa)', label: '濃毛毛雨' },
      61: { e: '🌧️', bg: 'linear-gradient(135deg,#3a5a7a,#5a7a9a)', label: '小雨' },
      63: { e: '🌧️', bg: 'linear-gradient(135deg,#3a5a7a,#5a7a9a)', label: '中雨' },
      65: { e: '⛈️', bg: 'linear-gradient(135deg,#2a4a6a,#4a6a8a)', label: '大雨' },
      71: { e: '🌨️', bg: 'linear-gradient(135deg,#8aaac8,#b0cde0)', label: '小雪' },
      73: { e: '🌨️', bg: 'linear-gradient(135deg,#8aaac8,#b0cde0)', label: '中雪' },
      75: { e: '❄️', bg: 'linear-gradient(135deg,#aac4dd,#cdddee)', label: '大雪' },
      80: { e: '🌦️', bg: 'linear-gradient(135deg,#5a7a9a,#7a9ab8)', label: '陣雨' },
      81: { e: '🌧️', bg: 'linear-gradient(135deg,#3a5a7a,#5a7a9a)', label: '強陣雨' },
      82: { e: '⛈️', bg: 'linear-gradient(135deg,#2a4a6a,#4a6a8a)', label: '暴雨' },
      95: { e: '⛈️', bg: 'linear-gradient(135deg,#2a3a5a,#4a5a7a)', label: '雷雨' }
    };
    const w = WX[code] || WX[2];

    $('weatherEmoji').textContent = w.e;
    $('weatherTemp').textContent = temp + '°';
    $('weatherDesc').textContent = w.label;
    $('weatherLoc').textContent = city;
    $('weatherCard').style.background = w.bg;
  } catch (e) {
    $('weatherDesc').textContent = '無法取得天氣';
  }
}

function exportCsv() {
  const rows = [['habit', 'date', 'completed_count']];
  for (const l of state.logs) {
    const h = state.habits.find((x) => x.id === l.habit_id);
    rows.push([h ? h.name : l.habit_id, l.date, l.completed_count || 1]);
  }
  const csv = rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'orbit-history.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('CSV 已匯出');
}

/* ------------------------------------------------------------- supabase */
async function initSupabase() {
  let lib = window.supabase;
  if (!lib || typeof lib.createClient !== 'function') {
    try {
      const mod = await import('https://esm.sh/@supabase/supabase-js@2');
      lib = mod;
    } catch {
      console.warn('[orbit] Supabase library unavailable — staying in guest mode.');
      return null;
    }
  }
  if (!lib || typeof lib.createClient !== 'function') return null;
  const client = lib.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // Required for the Capacitor WebView (origin is capacitor:// or https://localhost)
      flowType: 'pkce',
      storageKey: 'orbit-auth'
    }
  });
  state.supabase = client;
  return client;
}

/* --------------------------------------------------------------- syncing */
/** Convert a cloud row into the shape the UI uses. */
function fromCloudHabit(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    icon: row.icon || '✦',
    color: row.color || 'sage',
    schedule_days: Array.isArray(row.schedule_days) ? row.schedule_days.map(Number) : [0, 1, 2, 3, 4, 5, 6],
    target_count: Number(row.target_count) || 1,
    status: row.status || 'active',
    timezone: row.timezone || timezoneName(),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}
function fromCloudLog(row) {
  return {
    id: row.id,
    habit_id: row.habit_id,
    date: row.local_date || row.date,
    completed_count: Number(row.completed_count) || 1,
    created_at: row.created_at
  };
}
function isUuid(v) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || '')); }

function setSyncState(next) {
  state.syncState = next;
  const el = $('syncState');
  if (!el) return;
  el.classList.toggle('warn', next === 'error');
  el.classList.toggle('busy', next === 'syncing');
  if (state.session) {
    el.textContent = next === 'syncing' ? '● ' + t('syncing') : '● ' + t('synced');
  } else {
    el.textContent = '● ' + t('offline');
  }
}

function scheduleSync(delay) {
  if (!state.session) return;
  clearTimeout(state.syncTimer);
  state.syncTimer = setTimeout(() => { syncNow().catch(() => {}); }, delay == null ? 900 : delay);
}

function friendlyError(error) {
  const msg = String((error && (error.message || error.error_description)) || '');
  if (/relation .* does not exist|schema cache|Could not find the table/i.test(msg)) return t('schemaError');
  if (/Invalid login credentials/i.test(msg)) return t('badLogin');
  if (/already registered|already exists|User already registered/i.test(msg)) return t('emailTaken');
  if (/Password should be at least/i.test(msg)) return t('weakPass');
  if (/Failed to fetch|NetworkError|network|Load failed/i.test(msg)) return t('netError');
  return msg || t('syncError');
}

/**
 * Push local state, then pull cloud state.
 *
 * The important part: when a local (guest) record is uploaded we remap its
 * client-generated id to the id the database assigned, and rewrite every log
 * that referenced the old id. Skipping this is what orphaned check-ins before.
 */
async function syncNow() {
  const sb = state.supabase;
  if (!sb || !state.session) return;
  const uid = state.session.user.id;
  setSyncState('syncing');
  try {
    // ---- push habits that only exist locally -------------------------------
    const remoteHabits = await sb.from('habits').select('*').eq('user_id', uid).order('created_at', { ascending: false });
    if (remoteHabits.error) throw remoteHabits.error;
    const remoteIds = new Set((remoteHabits.data || []).map((r) => r.id));
    const idMap = new Map();

    for (const habit of state.habits) {
      if (remoteIds.has(habit.id)) continue;
      const payload = {
        user_id: uid,
        name: habit.name,
        description: habit.description || '',
        icon: habit.icon || '✦',
        color: habit.color || 'sage',
        schedule_days: (habit.schedule_days && habit.schedule_days.length) ? habit.schedule_days : [0, 1, 2, 3, 4, 5, 6],
        target_count: targetOf(habit),
        status: habit.status || 'active',
        timezone: timezoneName()
      };
      if (isUuid(habit.id)) payload.id = habit.id;
      const inserted = await sb.from('habits').insert(payload).select().single();
      if (inserted.error) throw inserted.error;
      idMap.set(habit.id, inserted.data.id);
    }
    if (idMap.size) {
      state.habits = state.habits.map((h) => {
        const next = idMap.get(h.id);
        return next ? Object.assign({}, h, { id: next }) : h;
      });
      state.logs = state.logs.map((l) => {
        const next = idMap.get(l.habit_id);
        return next ? Object.assign({}, l, { habit_id: next }) : l;
      });
      persist();
    }

    // ---- push logs (unique per habit + date, so upsert) --------------------
    const knownHabitIds = new Set(state.habits.map((h) => h.id));
    const remoteLogs = await sb.from('habit_logs').select('*').eq('user_id', uid);
    if (remoteLogs.error) throw remoteLogs.error;
    const remoteLogKeys = new Set((remoteLogs.data || []).map((r) => r.habit_id + '|' + r.local_date));

    const pendingLogs = state.logs.filter((l) => {
      if (!knownHabitIds.has(l.habit_id)) return false;
      return !remoteLogKeys.has(l.habit_id + '|' + l.date);
    });
    if (pendingLogs.length) {
      const rows = pendingLogs.map((l) => ({
        user_id: uid,
        habit_id: l.habit_id,
        local_date: l.date,
        local_timezone: timezoneName(),
        completed_count: Number(l.completed_count) || 1
      }));
      const up = await sb.from('habit_logs').upsert(rows, { onConflict: 'habit_id,local_date' });
      if (up.error) throw up.error;
    }

    // ---- pull authoritative state back ------------------------------------
    const [hr, lr] = await Promise.all([
      sb.from('habits').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
      sb.from('habit_logs').select('*').eq('user_id', uid).gte('local_date', shiftDays(todayKey(), -400))
    ]);
    if (hr.error) throw hr.error;
    if (lr.error) throw lr.error;

    const localById = new Map(state.habits.map((h) => [h.id, h]));
    state.habits = (hr.data || [])
      .filter((r) => r.status !== 'archived' || localById.has(r.id))
      .map(fromCloudHabit);
    state.logs = (lr.data || []).map(fromCloudLog);
    state.progress.clear();
    persist();
    setSyncState('ok');
    render();
  } catch (error) {
    console.warn('[orbit] sync failed', error);
    setSyncState('error');
    toast(friendlyError(error));
  }
}

/* --------------------------------------------------------------- actions */
function newId() {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : ((r & 0x3) | 0x8);
    return v.toString(16);
  });
}

function openHabitEditor(habit) {
  state.editingId = habit ? habit.id : null;
  state.draft = {
    icon: habit ? (habit.icon || '✦') : '✦',
    days: habit ? ((habit.schedule_days || []).slice()) : [0, 1, 2, 3, 4, 5, 6],
    target: habit ? targetOf(habit) : 1,
    touchDays: false
  };
  if (!state.draft.days.length) state.draft.days = [0, 1, 2, 3, 4, 5, 6];
  $('habitName').value = habit ? habit.name : '';
  $('habitDesc').value = habit ? (habit.description || '') : '';
  $('habitErr').textContent = '';
  syncIconPicker();
  syncDayChips();
  syncTarget();
  applyStrings();
  showModal('habitModal');
  setTimeout(() => $('habitName').focus(), 120);
}

async function saveHabitFromForm() {
  const name = $('habitName').value.trim();
  const description = $('habitDesc').value.trim();
  if (!name) { $('habitErr').textContent = t('needName'); return; }
  if (!state.draft.days.length) { $('habitErr').textContent = t('needDay'); return; }
  $('habitErr').textContent = '';
  const days = state.draft.days.slice().sort((a, b) => a - b);

  if (state.editingId) {
    const habit = state.habits.find((h) => h.id === state.editingId);
    if (habit) {
      habit.name = name;
      habit.description = description;
      habit.icon = state.draft.icon;
      habit.schedule_days = days;
      habit.target_count = state.draft.target;
      habit.updated_at = new Date().toISOString();
      if (state.session) {
        const up = await state.supabase.from('habits').update({
          name, description, icon: habit.icon, schedule_days: days,
          target_count: habit.target_count, timezone: timezoneName()
        }).eq('id', habit.id).eq('user_id', state.session.user.id);
        if (up.error) toast(friendlyError(up.error));
      }
      toast(t('updated'));
    }
  } else {
    const habit = {
      id: newId(),
      name, description,
      icon: state.draft.icon,
      color: 'sage',
      schedule_days: days,
      target_count: state.draft.target,
      status: 'active',
      timezone: timezoneName(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    state.habits.unshift(habit);
    toast(t('saved'));
  }
  persist();
  hideModal('habitModal');
  render();
  scheduleSync(300);
}

/** Tap a habit: count up to the target, then reset to zero. */
async function toggleHabit(id) {
  const habit = state.habits.find((h) => h.id === id);
  if (!habit) return;
  const key = todayKey();
  const target = targetOf(habit);
  const current = countFor(id, key);
  const next = current >= target ? 0 : current + 1;

  state.progress.set(progressKey(key, id), next);
  const existingIndex = state.logs.findIndex((l) => l.habit_id === id && l.date === key);

  if (next === 0) {
    if (existingIndex !== -1) state.logs.splice(existingIndex, 1);
    if (state.session) {
      const del = await state.supabase.from('habit_logs').delete()
        .eq('habit_id', id).eq('local_date', key).eq('user_id', state.session.user.id);
      if (del.error) { toast(friendlyError(del.error)); }
    }
  } else {
    if (existingIndex !== -1) state.logs[existingIndex].completed_count = next;
    else state.logs.push({ id: newId(), habit_id: id, date: key, completed_count: next, created_at: new Date().toISOString() });
    if (state.session) {
      const up = await state.supabase.from('habit_logs').upsert({
        user_id: state.session.user.id, habit_id: id, local_date: key,
        local_timezone: timezoneName(), completed_count: next
      }, { onConflict: 'habit_id,local_date' });
      if (up.error) toast(friendlyError(up.error));
    }
  }
  persist();
  buzz(next >= target ? 'success' : 'light');
  render();
}

async function deleteHabit(id) {
  const habit = state.habits.find((h) => h.id === id);
  if (!habit) return;
  const ok = await askConfirm(t('confirmDelete'), t('delete'));
  if (!ok) return;
  if (state.session) {
    const del = await state.supabase.from('habits').delete().eq('id', id).eq('user_id', state.session.user.id);
    if (del.error) { toast(friendlyError(del.error)); return; }
  }
  state.habits = state.habits.filter((h) => h.id !== id);
  state.logs = state.logs.filter((l) => l.habit_id !== id);
  state.openRow = null;
  persist();
  render();
  toast(t('deleted'));
}

async function setHabitStatus(id, status) {
  const habit = state.habits.find((h) => h.id === id);
  if (!habit) return;
  habit.status = status;
  habit.updated_at = new Date().toISOString();
  state.openRow = null;
  persist();
  render();
  if (state.session) {
    const up = await state.supabase.from('habits').update({ status }).eq('id', id).eq('user_id', state.session.user.id);
    if (up.error) toast(friendlyError(up.error));
  }
}

/* ------------------------------------------------------------------ auth */
function authError(message) {
  $('authErr').textContent = message || '';
}

/** Explains an "email not confirmed" error instead of showing the raw wording. */
function showEmailConfirmationHelp(email) {
  const zh = state.lang !== 'en';
  authError(zh
    ? '這個帳號尚未完成驗證。請稍後再試，或使用「忘記密碼」重新設定。'
    : 'This account has not been verified yet. Please try again later, or use "Forgot password" to reset it.');
  console.warn('[orbit] email not confirmed for ' + email + ' — run supabase/migrations/003_auto_confirm_email.sql');
}

/**
 * One action for both cases: sign in if the account exists, otherwise create it.
 *
 * The user never has to choose "register" or "sign in". This only works without
 * any email round-trip when the Supabase project has "Confirm email" turned off
 * (Authentication → Sign In / Providers → Email); the toggle lives on the server
 * and cannot be changed from here, so when it is still on we say exactly that
 * instead of showing a raw English error.
 */
async function submitAuth(event) {
  event.preventDefault();
  if (state.busy || !state.supabase) { if (!state.supabase) authError(t('netError')); return; }
  const email = $('email').value.trim();
  const password = $('password').value;
  authError('');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { authError(t('needEmail')); return; }
  if (password.length < 6) { authError(t('weakPass')); return; }

  spinner(true);
  $('authSubmit').disabled = true;
  const sb = state.supabase;

  const succeed = async (session, isNew) => {
    await adoptSession(session);
    hideModal('authModal');
    toast(isNew ? t('accountReady') : t('welcome'));
  };

  try {
    // 1. Existing account with this exact password.
    const signIn = await sb.auth.signInWithPassword({ email, password });
    if (!signIn.error && signIn.data && signIn.data.session) {
      await succeed(signIn.data.session, false);
      return;
    }
    if (signIn.error && /not confirmed/i.test(signIn.error.message || '')) {
      showEmailConfirmationHelp(email);
      return;
    }

    // 2. No such account yet (or the password did not match): try to create it.
    const signUp = await sb.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectUrl(), data: { locale: state.lang } }
    });

    if (signUp.error) {
      // Typically "User already registered" — meaning step 1 failed on the
      // password, not because the account is missing.
      authError(/already/i.test(signUp.error.message || '') ? t('badLogin') : friendlyError(signUp.error));
      return;
    }

    // Confirmation off: sign-up already returned a session, no email involved.
    if (signUp.data && signUp.data.session) {
      await succeed(signUp.data.session, true);
      return;
    }

    // No session: confirmation is still enabled on the project, OR the address
    // was already registered (Supabase hides which, on purpose). One more sign-in
    // tells us which, and succeeds as soon as confirmation is off.
    const retry = await sb.auth.signInWithPassword({ email, password });
    if (!retry.error && retry.data && retry.data.session) {
      await succeed(retry.data.session, false);
      return;
    }
    if (retry.error && /not confirmed/i.test(retry.error.message || '')) {
      showEmailConfirmationHelp(email);
      return;
    }
    authError(t('confirmPending'));
  } catch (error) {
    if (/not confirmed/i.test((error && error.message) || '')) {
      showEmailConfirmationHelp(email);
    } else {
      authError(friendlyError(error));
    }
  } finally {
    spinner(false);
    $('authSubmit').disabled = false;
  }
}

function redirectUrl() {
  // On native the page is served from capacitor://localhost or https://localhost
  return window.location.origin + window.location.pathname;
}

async function adoptSession(session) {
  state.session = session;
  await loadProfileFromCloud();
  const localCount = state.habits.length;
  if (session && localCount) {
    const cloud = await state.supabase.from('habits').select('id').eq('user_id', session.user.id).limit(1);
    const hasCloud = !cloud.error && (cloud.data || []).length > 0;
    if (!hasCloud) {
      // Empty account: uploading the guest data is the least surprising default.
      toast(t('local'));
    } else {
      const merge = await askConfirm(t('confirmMerge'), t('ok'));
      if (!merge) {
        state.habits = [];
        state.logs = [];
        state.progress.clear();
        persist();
      }
    }
  }
  render();
  await syncNow();
  scheduleSync(20000);
}

async function signOut() {
  if (!state.supabase) return;
  await state.supabase.auth.signOut();
  state.session = null;
  // Keep the last known local copy so the device still works offline.
  state.habits = store.get(KEY.habits, []);
  state.logs = store.get(KEY.logs, []);
  state.progress.clear();
  render();
  toast(t('signedOut'));
}

async function deleteAccount() {
  if (!state.session || !state.supabase) return;
  const ok = await askConfirm(t('confirmDeleteAccount'), t('delete'));
  if (!ok) return;
  const uid = state.session.user.id;
  // Remove user-owned rows first, then the identity. A server-side function is
  // still recommended for production (see docs/APP-STORE-CHECKLIST.md).
  for (const table of ['habit_logs', 'habits', 'profiles']) {
    const del = await state.supabase.from(table).delete().eq(table === 'profiles' ? 'id' : 'user_id', uid);
    if (del.error) console.warn('[orbit] cleanup failed for ' + table, del.error);
  }
  const res = await state.supabase.rpc('delete_my_account');
  if (res.error) {
    toast(t('deleteAccount') + ' — ' + friendlyError(res.error));
    return;
  }
  await state.supabase.auth.signOut();
  state.session = null;
  state.habits = [];
  state.logs = [];
  state.progress.clear();
  persist();
  render();
  toast(t('deleted'));
}

/* --------------------------------------------------------------- export */
async function exportData() {
  const payload = JSON.stringify({
    app: 'Orbit', version: CONFIG.appVersion,
    exported_at: new Date().toISOString(),
    timezone: timezoneName(),
    habits: state.habits, logs: state.logs
  }, null, 2);
  if (state.native && window.Capacitor && window.Capacitor.Plugins) {
    try {
      const { Filesystem, Share } = window.Capacitor.Plugins;
      const res = await Filesystem.writeFile({
        path: 'orbit-data.json', data: payload, directory: 'CACHE', encoding: 'utf8'
      });
      await Share.share({ title: 'Orbit data', url: res.uri });
      return;
    } catch { /* fall through to the download path */ }
  }
  const blob = new Blob([payload], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'orbit-data.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast(t('exported'));
}

async function importData(file) {
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const habits = Array.isArray(parsed.habits) ? parsed.habits : [];
    const logs = Array.isArray(parsed.logs) ? parsed.logs : [];
    if (!habits.length && !logs.length) throw new Error('empty');
    const known = new Set(state.habits.map((h) => h.id));
    for (const habit of habits) {
      if (!habit || !habit.name || known.has(habit.id)) continue;
      state.habits.push({
        id: isUuid(habit.id) ? habit.id : newId(),
        name: String(habit.name).slice(0, 100),
        description: String(habit.description || '').slice(0, 1000),
        icon: habit.icon || '✦',
        color: habit.color || 'sage',
        schedule_days: Array.isArray(habit.schedule_days) && habit.schedule_days.length ? habit.schedule_days.map(Number) : [0, 1, 2, 3, 4, 5, 6],
        target_count: Number(habit.target_count) || 1,
        status: ['active', 'paused', 'archived'].indexOf(habit.status) === -1 ? 'active' : habit.status,
        timezone: habit.timezone || timezoneName(),
        created_at: habit.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      known.add(habit.id);
    }
    const logKeys = new Set(state.logs.map((l) => l.habit_id + '|' + l.date));
    for (const log of logs) {
      if (!log || !log.date) continue;
      const key = log.habit_id + '|' + log.date;
      if (logKeys.has(key)) continue;
      state.logs.push({
        id: newId(), habit_id: log.habit_id, date: log.date,
        completed_count: Number(log.completed_count) || 1,
        created_at: log.created_at || new Date().toISOString()
      });
      logKeys.add(key);
    }
    state.progress.clear();
    persist();
    render();
    toast(t('imported'));
    scheduleSync(400);
  } catch {
    toast(t('importBad'));
  }
}

/* ------------------------------------------------------------------ views */
function showLangModal() {
  if ($('langList')) {
    $('langList').querySelectorAll('[data-lang]').forEach((b) => {
      b.classList.toggle('on', b.dataset.lang === state.lang);
    });
  }
  showModal('langModal');
}

function switchView(name, animate) {
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === name + 'View'));
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  if (animate !== false) {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  }
}
function currentView() {
  const names = ['today', 'habits', 'insights', 'profile'];
  return names.find((n) => $(n + 'View').classList.contains('active')) || 'today';
}

/**
 * Complete an email-confirmation or password-reset link that came back into the
 * native app. Mirrors what supabase-js does automatically for a web page:
 *   - PKCE flow: exchange the one-time `code` for a session.
 *   - Implicit flow: adopt the session the client already parsed from the URL.
 */
async function handleAuthUrl(url) {
  const sb = state.supabase;
  if (!sb) return;
  const hash = url.indexOf('#') !== -1 ? url.slice(url.indexOf('#')) : '';
  const query = url.indexOf('?') !== -1 ? url.slice(url.indexOf('?') + 1).split('#')[0] : '';
  const params = new URLSearchParams(hash.replace(/^#/, '') || query);
  const code = params.get('code');
  const errorDescription = params.get('error_description') || params.get('error');

  if (errorDescription) {
    toast(decodeURIComponent(errorDescription));
    return;
  }

  if (code) {
    // PKCE: requires the code verifier cached by the client on this device.
    const res = await sb.auth.exchangeCodeForSession(code);
    if (res.error) { toast(friendlyError(res.error)); return; }
    await adoptSession(res.data.session);
    toast(t('welcome'));
    return;
  }

  const { data } = await sb.auth.getSession();
  if (data && data.session) {
    await adoptSession(data.session);
    toast(t('welcome'));
  }

  // A recovery link should drop the user straight into the new-password sheet.
  if (params.get('type') === 'recovery' || /type=recovery/.test(hash + query)) {
    render();
    showModal('newPassModal');
  }
}

/* ------------------------------------------------------------ native bits */
async function initNative() {
  const C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
  state.native = true;
  document.body.classList.add('is-native');
  const P = C.Plugins || {};
  try { if (P.SplashScreen) await P.SplashScreen.hide(); } catch {}
  try { if (P.StatusBar) P.StatusBar.setOverlaysWebView({ overlay: false }); } catch {}
  applyTheme();
  try {
    if (P.App) {
      P.App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) { render(); scheduleSync(400); }
      });
      // Handles the email-confirmation / password-reset deep link
      // (orbit://auth?... or com.orbit.habits://auth?...).
      P.App.addListener('appUrlOpen', async ({ url }) => {
        if (!state.supabase || !url) return;
        try {
          await handleAuthUrl(url);
        } catch (error) { console.warn('[orbit] deep link', error); }
      });
    }
  } catch {}
  try {
    if (P.Keyboard) P.Keyboard.setScroll({ isDisabled: false });
  } catch {}
  try {
    if (P.App && P.App.addListener) {
      P.App.addListener('backButton', () => {
        const open = document.querySelector('.backdrop.show');
        if (open) { if (open.id === 'confirmModal') resolveConfirm(false); else hideModal(open.id); return; }
        if (currentView() !== 'today') { switchView('today', false); return; }
        if (P.App.exitApp) P.App.exitApp();
      });
    }
  } catch {}
}

/* ------------------------------------------------------------------ wire */
function wireEvents() {
  // Fail loudly and locally instead of letting one missing element abort the
  // whole boot sequence (which would leave the UI half-rendered and silent).
  const REQUIRED = [
    'brandBtn', 'addOpen', 'addOpen2', 'habitForm', 'quickForm', 'quickInput', 'habitName', 'habitDesc',
    'dayChips', 'dailyToggle', 'iconPicker', 'targetMinus', 'targetPlus', 'targetValue', 'habitErr',
    'accountBtn', 'profileAccountBtn', 'authForm', 'authModeBtn', 'forgotBtn', 'resetForm', 'resetEmail',
    'resetErr', 'newPassForm', 'newPass', 'newPassErr', 'exportBtn', 'exportBtn2', 'importBtn', 'importFile',
    'signOutBtn', 'deleteAccountBtn', 'privacyBtn', 'supportBtn', 'langBtn', 'langBtn2',
    'themeBtn', 'themeBtn2', 'confirmOk', 'confirmCancel', 'confirmDesc', 'confirmTitle',
    'syncState', 'habitList', 'allHabitList', 'weekChart', 'bestList', 'profileStatus', 'storageStatus',
    'localNote', 'dangerPanel', 'versionValue', 'doneCount', 'streakCount', 'progressRing', 'progressPct',
    'progressHeadline', 'progressCopy', 'restNote', 'dateText', 'totalLogs', 'activeHabits', 'toast',
    'avatarBtn', 'avatarFile', 'profileDisplayName', 'profileUserId', 'nameEditBtn',
    'upgradeBtn', 'healthTip', 'waterBtn', 'walkBtn', 'sleepBtn'
  ];
  const missing = REQUIRED.filter((id) => !$(id));
  if (missing.length) {
    console.error('[orbit] missing DOM elements, UI will be incomplete: ' + missing.join(', '));
    if (typeof toast === 'function') {
      setTimeout(() => toast('介面載入不完整，請重新開啟 App'), 400);
    }
  }

  document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => switchView(b.dataset.view)));
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => hideModal(b.dataset.close)));
  document.querySelectorAll('.backdrop').forEach((b) => {
    b.addEventListener('click', (e) => {
      if (e.target !== b) return;
      if (b.id === 'confirmModal') resolveConfirm(false); else hideModal(b.id);
    });
  });

  $('brandBtn').addEventListener('click', () => switchView('today'));
  $('addOpen').addEventListener('click', () => openHabitEditor(null));
  $('addOpen2').addEventListener('click', () => openHabitEditor(null));

  $('habitForm').addEventListener('submit', async (e) => { e.preventDefault(); await saveHabitFromForm(); });
  $('quickForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('quickInput').value.trim();
    if (!name) return;
    state.habits.unshift({
      id: newId(), name, description: '', icon: '✦', color: 'sage',
      schedule_days: [0, 1, 2, 3, 4, 5, 6], target_count: 1, status: 'active',
      timezone: timezoneName(), created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    });
    $('quickInput').value = '';
    persist(); render();
    buzz('light');
    toast(t('saved'));
    scheduleSync(300);
  });

  $('dayChips').addEventListener('click', (e) => {
    if (!e.target.closest('[data-day]')) return;
    syncDayChips();
  });
  $('dailyToggle').addEventListener('click', () => {
    state.draft.days = state.draft.days.length === 7 ? [1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6];
    syncDayChips();
  });
  $('targetMinus').addEventListener('click', () => { state.draft.target = Math.max(1, state.draft.target - 1); syncTarget(); });
  $('targetPlus').addEventListener('click', () => { state.draft.target = Math.min(100, state.draft.target + 1); syncTarget(); });

  // One delegated listener for both habit lists.
  document.addEventListener('click', (e) => {
    const toggle = e.target.closest('[data-toggle]');
    if (toggle) { toggleHabit(toggle.dataset.toggle); return; }
    const open = e.target.closest('[data-open]');
    if (open) { state.openRow = state.openRow === open.dataset.open ? null : open.dataset.open; render(); return; }
    const act = e.target.closest('[data-act]');
    if (act) {
      const id = act.dataset.id;
      const action = act.dataset.act;
      if (action === 'edit') { hideModal('habitModal'); openHabitEditor(state.habits.find((h) => h.id === id)); }
      else if (action === 'delete') deleteHabit(id);
      else if (action === 'pause') setHabitStatus(id, 'paused');
      else if (action === 'resume') setHabitStatus(id, 'active');
      else if (action === 'archive') setHabitStatus(id, 'archived');
      else if (action === 'unarchive') setHabitStatus(id, 'active');
      return;
    }
    const filter = e.target.closest('[data-filter]');
    if (filter) {
      state.filter = filter.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach((b) => b.classList.toggle('on', b === filter));
      renderHabitLists();
    }
  });

  $('accountBtn').addEventListener('click', () => { if (state.session) switchView('profile'); else showModal('authModal'); });
  $('profileAccountBtn').addEventListener('click', () => { if (state.session) signOut(); else showModal('authModal'); });
  $('authForm').addEventListener('submit', submitAuth);
  // Signing in and creating an account are the same action now, so the mode
  // switch is no longer offered. Kept tolerant of the element being absent.
  if ($('authModeBtn')) {
    $('authModeBtn').addEventListener('click', () => {
      state.authMode = state.authMode === 'login' ? 'signup' : 'login';
      $('password').setAttribute('autocomplete', state.authMode === 'signup' ? 'new-password' : 'current-password');
      authError('');
      applyStrings();
    });
  }
  $('forgotBtn').addEventListener('click', () => {
    hideModal('authModal');
    $('resetEmail').value = $('email').value.trim();
    $('resetErr').textContent = '';
    showModal('resetModal');
  });
  $('resetForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('resetEmail').value.trim();
    $('resetErr').textContent = '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { $('resetErr').textContent = t('needEmail'); return; }
    if (!state.supabase) { $('resetErr').textContent = t('netError'); return; }
    const res = await state.supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() });
    if (res.error) { $('resetErr').textContent = friendlyError(res.error); return; }
    hideModal('resetModal');
    toast(t('resetSent'));
  });
  $('newPassForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const value = $('newPass').value;
    $('newPassErr').textContent = '';
    if (value.length < 6) { $('newPassErr').textContent = t('weakPass'); return; }
    const res = await state.supabase.auth.updateUser({ password: value });
    if (res.error) { $('newPassErr').textContent = friendlyError(res.error); return; }
    hideModal('newPassModal');
    toast(t('resetDone'));
  });

  $('exportBtn').addEventListener('click', exportData);
  $('exportBtn2').addEventListener('click', exportData);
  $('importBtn').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) await importData(file);
    e.target.value = '';
  });
  $('signOutBtn').addEventListener('click', signOut);
  $('deleteAccountBtn').addEventListener('click', deleteAccount);

  const openPrivacy = () => {
    if (state.native && window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser) {
      window.Capacitor.Plugins.Browser.open({ url: new URL(CONFIG.privacyUrl, location.href).href });
    } else {
      window.open(CONFIG.privacyUrl, '_blank', 'noopener');
    }
  };
  $('privacyBtn').addEventListener('click', openPrivacy);
  $('supportBtn').addEventListener('click', () => {
    window.location.href = 'mailto:' + CONFIG.supportEmail + '?subject=' + encodeURIComponent('Orbit feedback');
  });

  $('langBtn').addEventListener('click', () => showLangModal());
  $('langBtn2').addEventListener('click', () => showLangModal());
  $('themeBtn').addEventListener('click', cycleTheme);
  $('themeBtn2').addEventListener('click', cycleTheme);

  // profile hero
  $('avatarBtn').addEventListener('click', () => $('avatarFile').click());
  $('avatarFile').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) handleAvatarFile(f);
    e.target.value = '';
  });
  $('nameEditBtn').addEventListener('click', editDisplayName);
  $('upgradeBtn').addEventListener('click', () => toast(state.lang === 'en' ? 'Pro coming soon ✦' : 'Pro 即將推出 ✦'));
  // wellness chips
  const chipMap = { waterBtn: 'water', walkBtn: 'walk', sleepBtn: 'sleep' };
  for (const [id, key] of Object.entries(chipMap)) {
    $(id).addEventListener('click', () => {
      state.healthDone[key] = !state.healthDone[key];
      store.set(KEY.health, state.healthDone);
      render();
      toast(state.healthDone[key] ? '✓' : '');
    });
  }

  // mood check-in
  if ($('moodRow')) {
    $('moodRow').querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', () => {
        state.mood = (state.mood === b.dataset.mood) ? '' : b.dataset.mood;
        store.set('orbit-mood-' + todayKey(), state.mood);
        render();
      });
    });
  }

  // suggested habit chips
  if ($('suggestChips')) {
    $('suggestChips').querySelectorAll('[data-suggest]').forEach((b) => {
      b.addEventListener('click', () => {
        const name = b.dataset.suggest;
        state.habits.unshift({
          id: newId(), name, description: '', icon: '✦', color: 'sage',
          schedule_days: [0,1,2,3,4,5,6], target_count: 1, status: 'active',
          timezone: timezoneName(), created_at: new Date().toISOString(), updated_at: new Date().toISOString()
        });
        persist(); render();
        toast(t('saved'));
        scheduleSync(300);
      });
    });
  }

  // language picker
  if ($('langList')) {
    $('langList').querySelectorAll('[data-lang]').forEach((b) => {
      b.addEventListener('click', () => {
        setLang(b.dataset.lang);
        hideModal('langModal');
      });
    });
  }

  // accent color picker
  if ($('colorRow')) {
    $('colorRow').querySelectorAll('.color-dot').forEach((b) => {
      b.addEventListener('click', () => {
        state.accent = b.dataset.color;
        store.set('orbit-accent', state.accent);
        applyAccent();
        $('colorRow').querySelectorAll('.color-dot').forEach((x) => x.classList.toggle('on', x === b));
      });
    });
  }

  // reminder toggle
  if ($('reminderBtn')) {
    $('reminderBtn').addEventListener('click', toggleReminder);
  }

  // CSV export
  if ($('exportCsvBtn')) {
    $('exportCsvBtn').addEventListener('click', exportCsv);
  }

  $('confirmOk').addEventListener('click', () => resolveConfirm(true));
  $('confirmCancel').addEventListener('click', () => resolveConfirm(false));

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const open = document.querySelector('.backdrop.show');
    if (!open) return;
    if (open.id === 'confirmModal') resolveConfirm(false); else hideModal(open.id);
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (state.theme === 'system') applyTheme();
  });

  // Swipe between tabs — only for gestures that start on plain content.
  let touchX = 0, touchY = 0, tracking = false;
  const interactive = (el) => !!(el && el.closest('input,textarea,select,button,a,[contenteditable="true"],.backdrop'));
  document.addEventListener('touchstart', (e) => {
    const touch = e.changedTouches[0];
    touchX = touch.screenX; touchY = touch.screenY;
    tracking = !interactive(e.target) && !document.querySelector('.backdrop.show');
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (!tracking) return;
    tracking = false;
    const touch = e.changedTouches[0];
    const dx = touch.screenX - touchX;
    const dy = touch.screenY - touchY;
    if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
    const names = ['today', 'habits', 'insights', 'profile'];
    const current = names.indexOf(currentView());
    const next = Math.max(0, Math.min(names.length - 1, current + (dx < 0 ? 1 : -1)));
    if (next !== current) switchView(names[next]);
  }, { passive: true });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { render(); scheduleSync(500); }
  });
  window.addEventListener('online', () => { setSyncState('idle'); scheduleSync(500); });
  window.addEventListener('offline', () => setSyncState('error'));
}

function stateLangName(code) {
  const names = { 'zh-TW': '繁體中文', 'zh-CN': '简体中文', 'en': 'English', 'ja': '日本語', 'ko': '한국어', 'es': 'Español', 'fr': 'Français', 'de': 'Deutsch' };
  return names[code] || code;
}

function setLang(next) {
  state.lang = next;
  store.set(KEY.lang, next);
  render();
}

/* ------------------------------------------------------------------ boot */
async function boot() {
  state.lang = store.get(KEY.lang, null) || ((navigator.language || '').toLowerCase().indexOf('zh') === 0 ? 'zh-TW' : (navigator.language ? 'en' : 'zh-TW'));
  state.theme = store.get(KEY.theme, 'system');
  state.habits = store.get(KEY.habits, []);
  state.logs = store.get(KEY.logs, []);
  state.progress = new Map();
  state.displayName = store.get(KEY.displayName, '');
  state.avatar = store.get(KEY.avatar, '');
  state.healthDone = Object.assign({ water: false, walk: false, sleep: false }, store.get(KEY.health, {}));
  state.mood = store.get('orbit-mood-' + todayKey(), '');
  state.accent = store.get('orbit-accent', '');
  state.reminderOn = store.get('orbit-reminder', false);
  applyAccent();

  buildIconPicker();
  buildDayChips();
  syncTarget();
  applyTheme();
  wireEvents();
  render();

  const client = await initSupabase();
  if (client) {
    try {
      const { data } = await client.auth.getSession();
      if (data && data.session) await adoptSession(data.session);
      client.auth.onAuthStateChange((event, session) => {
        if (event === 'PASSWORD_RECOVERY') { showModal('newPassModal'); return; }
        if (session && (!state.session || state.session.user.id !== session.user.id)) {
          state.session = session;
          render();
          scheduleSync(300);
        }
        if (!session && state.session) { state.session = null; render(); }
      });
    } catch (error) {
      console.warn('[orbit] auth init failed', error);
    }
  }
  await initNative();
  render();
  checkReminder();
  loadWeather();

  // Offline app shell. Only registered over http(s): the native WebView loads
  // from capacitor:// or https://localhost, and file:// previews must not try.
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    registerServiceWorker();
  }
}

async function registerServiceWorker() {
  try {
    // Resolve sw.js next to the page so the app also works when it is served
    // from a subpath (for example /wellnest/). The scope is requested as '.'
    // because GitHub Pages cannot send Service-Worker-Allowed; when the scope
    // cannot be granted the registration is retried with the default scope.
    const swUrl = new URL('sw.js', location.href).href;
    await navigator.serviceWorker.register(swUrl, { scope: './' });
  } catch (first) {
    try {
      await navigator.serviceWorker.register('sw.js');
    } catch (second) {
      // Never let offline support break the app.
      console.warn('[orbit] service worker not registered:', second && second.message);
    }
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
