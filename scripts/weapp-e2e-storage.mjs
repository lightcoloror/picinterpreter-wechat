// These native wx calls run inside the existing automation_evaluate boundary.
// Keep each function self-contained so its source can be passed to WeChat IDE.
/* global wx */
export function captureWechatStorage() {
  var info = wx.getStorageInfoSync();
  var keys = Array.isArray(info.keys) ? info.keys : [];
  var entries = [];
  for (var index = 0; index < keys.length; index += 1) {
    entries.push([keys[index], wx.getStorageSync(keys[index])]);
  }
  return entries;
}

export function restoreWechatStorage(entries) {
  var info = wx.getStorageInfoSync();
  var keys = Array.isArray(info.keys) ? info.keys : [];
  for (var index = 0; index < keys.length; index += 1) wx.removeStorageSync(keys[index]);
  for (var entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
    wx.setStorageSync(entries[entryIndex][0], entries[entryIndex][1]);
  }
  return entries.length;
}

// The CLI's fn-source boundary follows the existing single-line anonymous
// callback format; passing a multiline Function.toString() breaks cmd parsing.
const toAutomationSource = fn => fn.toString().replace(/^function\s+\w+\s*\(/, 'function(').replace(/\s+/g, ' ')
export const captureWechatStorageSource = toAutomationSource(captureWechatStorage)
export const restoreWechatStorageSource = toAutomationSource(restoreWechatStorage)
