/**
 * Waypoint 雲端儲存（Google Apps Script）
 *
 * 作用：把短網址、範本、點擊紀錄存進你的 Google 雲端硬碟資料夾裡的一份試算表。
 * 1. 到 https://script.google.com 建立新專案，貼上這份程式碼。
 * 2. 在上方函式選單選 setup，按「執行」，依畫面授權。
 *    執行紀錄會顯示「管理密碼」與試算表網址，請記下密碼。
 * 3. 部署 → 新增部署作業 → 類型選「網頁應用程式」
 *    執行身分：我；誰可以存取：所有人 → 部署，複製「網頁應用程式網址」。
 * 4. 把網址填進 config.js 的 appsScriptUrl，並在網站「雲端儲存」分頁輸入管理密碼。
 *
 * 改過程式碼後，要「管理部署作業 → 編輯 → 新版本」才會生效。
 */

var FOLDER_ID = '1cdUmRkWcOiynOdqgaL9ajMv30Egkdh7g';   // 你的雲端硬碟資料夾
var SHEET_TITLE = 'Waypoint 短網址資料';
var MAX_CLICK_ROWS = 30000;                              // 一次最多回傳的點擊筆數

var LINK_COLS = ['slug', 'domain', 'destination', 'base', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'dpa', 'forward_query', 'status', 'created'];
var PRESET_COLS = ['id', 'name', 'dpa', 'utm_json'];
var CLICK_COLS = ['ts', 'slug', 'visitor', 'bot', 'bot_reason', 'referer', 'os', 'browser', 'in_app', 'device', 'country', 'lang', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

/* ───────── 第一次設定（手動執行一次） ───────── */
function setup() {
  var props = PropertiesService.getScriptProperties();
  var ss;
  var id = props.getProperty('SHEET_ID');
  if (id) {
    ss = SpreadsheetApp.openById(id);
  } else {
    ss = SpreadsheetApp.create(SHEET_TITLE);
    DriveApp.getFileById(ss.getId()).moveTo(DriveApp.getFolderById(FOLDER_ID));
    props.setProperty('SHEET_ID', ss.getId());
  }
  ensureSheet_(ss, 'links', LINK_COLS);
  ensureSheet_(ss, 'presets', PRESET_COLS);
  ensureSheet_(ss, 'clicks', CLICK_COLS);
  var first = ss.getSheetByName('工作表1') || ss.getSheetByName('Sheet1');
  if (first && ss.getSheets().length > 1) ss.deleteSheet(first);
  if (!props.getProperty('ADMIN_TOKEN')) props.setProperty('ADMIN_TOKEN', Utilities.getUuid().replace(/-/g, ''));
  Logger.log('管理密碼 ADMIN_TOKEN = ' + props.getProperty('ADMIN_TOKEN'));
  Logger.log('試算表網址 = ' + ss.getUrl());
}

function ensureSheet_(ss, name, cols) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

/* ───────── 工具 ───────── */
function ss_() { return SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID')); }
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function isAdmin_(t) { var a = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN'); return !!(a && t && String(t) === a); }
function key_(s) { return String(s || '').trim().normalize('NFC').toLowerCase(); }
function truthy_(v) { return v === true || v === 'TRUE' || v === 'true' || v === 1 || v === '1'; }

function readTable_(sheet, cols) {
  var n = sheet.getLastRow();
  if (n < 2) return [];
  var vals = sheet.getRange(2, 1, n - 1, cols.length).getValues();
  return vals.map(function (r) { var o = {}; cols.forEach(function (c, i) { o[c] = r[i]; }); return o; });
}

function findLink_(slug) {
  var k = key_(slug);
  var cache = CacheService.getScriptCache();
  var hit = cache.get('l:' + k);
  if (hit) return hit === 'null' ? null : JSON.parse(hit);
  var rows = readTable_(ss_().getSheetByName('links'), LINK_COLS);
  for (var i = 0; i < rows.length; i++) {
    if (key_(rows[i].slug) === k) {
      var l = { slug: rows[i].slug, destination: rows[i].destination, status: rows[i].status || 'active', forward_query: truthy_(rows[i].forward_query), utm_source: rows[i].utm_source, utm_medium: rows[i].utm_medium, utm_campaign: rows[i].utm_campaign, utm_term: rows[i].utm_term, utm_content: rows[i].utm_content };
      cache.put('l:' + k, JSON.stringify(l), 300);
      return l;
    }
  }
  cache.put('l:' + k, 'null', 20);
  return null;
}

/* ───────── 公開讀取：轉址頁用 ───────── */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action === 'link') return out_({ link: findLink_(p.slug) });
  if (p.action === 'ping') return out_({ ok: true });
  return out_({ ok: true, service: 'waypoint' });
}

/* ───────── 寫入與管理 ───────── */
function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: 'bad_json' }); }
  var action = body.action;

  // 公開：記錄點擊（只接受已存在的短碼）
  if (action === 'click') {
    var link = findLink_(body.slug);
    if (!link) return out_({ ok: false, error: 'unknown_slug' });
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) return out_({ ok: false, error: 'busy' });
    try {
      var sh = ss_().getSheetByName('clicks');
      var cut = function (v, n) { return String(v == null ? '' : v).slice(0, n); };
      sh.appendRow([new Date().getTime(), key_(body.slug), cut(body.visitor, 64), body.bot ? 1 : 0, cut(body.bot_reason, 40), cut(body.referer, 120), cut(body.os, 16), cut(body.browser, 32), cut(body.in_app, 16), cut(body.device, 16), cut(body.country, 4), cut(body.lang, 16), cut(body.utm_source, 80), cut(body.utm_medium, 80), cut(body.utm_campaign, 120), cut(body.utm_term, 120), cut(body.utm_content, 120)]);
    } finally { lock.releaseLock(); }
    return out_({ ok: true });
  }

  // 以下需要管理密碼
  if (!isAdmin_(body.token)) return out_({ ok: false, error: 'unauthorized' });

  if (action === 'ping') return out_({ ok: true, sheetUrl: ss_().getUrl() });

  if (action === 'getAll') {
    var links = readTable_(ss_().getSheetByName('links'), LINK_COLS).map(function (r) { r.dpa = truthy_(r.dpa); r.forward_query = truthy_(r.forward_query); return r; });
    var presets = readTable_(ss_().getSheetByName('presets'), PRESET_COLS).map(function (r) { var u = {}; try { u = JSON.parse(r.utm_json); } catch (x) {} return { id: String(r.id), name: r.name, dpa: truthy_(r.dpa), utm: u }; });
    return out_({ ok: true, links: links, presets: presets });
  }

  if (action === 'saveLinks') {
    var list = body.links || [];
    if (!list.length && !body.allowEmpty) return out_({ ok: false, error: 'refuse_empty' });   // 防止空資料覆蓋
    var lk = LockService.getScriptLock();
    if (!lk.tryLock(10000)) return out_({ ok: false, error: 'busy' });
    try {
      var ss = ss_();
      var cache = CacheService.getScriptCache();
      var old = readTable_(ss.getSheetByName('links'), LINK_COLS);
      old.forEach(function (r) { cache.remove('l:' + key_(r.slug)); });
      var lsh = ss.getSheetByName('links');
      lsh.getRange(2, 1, Math.max(lsh.getMaxRows() - 1, 1), LINK_COLS.length).clearContent();
      if (list.length) {
        var rows = list.map(function (l) { return LINK_COLS.map(function (c) { return l[c] == null ? '' : l[c]; }); });
        lsh.getRange(2, 1, rows.length, LINK_COLS.length).setValues(rows);
      }
      list.forEach(function (l) { cache.remove('l:' + key_(l.slug)); });
      if (body.presets) {
        var psh = ss.getSheetByName('presets');
        psh.getRange(2, 1, Math.max(psh.getMaxRows() - 1, 1), PRESET_COLS.length).clearContent();
        var prow = body.presets.map(function (p) { return [p.id, p.name, !!p.dpa, JSON.stringify(p.utm || {})]; });
        if (prow.length) psh.getRange(2, 1, prow.length, PRESET_COLS.length).setValues(prow);
      }
    } finally { lk.releaseLock(); }
    return out_({ ok: true, saved: list.length });
  }

  if (action === 'clicks') {
    var csh = ss_().getSheetByName('clicks');
    var last = csh.getLastRow();
    var days = Math.min(Number(body.days) || 90, 365);
    var since = new Date().getTime() - days * 86400000;
    if (last < 2) return out_({ ok: true, cols: CLICK_COLS, rows: [] });
    var start = Math.max(2, last - MAX_CLICK_ROWS + 1);
    var data = csh.getRange(start, 1, last - start + 1, CLICK_COLS.length).getValues();
    var rowsOut = data.filter(function (r) { return Number(r[0]) >= since; });
    return out_({ ok: true, cols: CLICK_COLS, rows: rowsOut, truncated: start > 2 });
  }

  return out_({ ok: false, error: 'unknown_action' });
}
