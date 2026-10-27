const key = "melyne-owner-sidebar-collapsed";

export function readSidebarPreference(storage) {
  try { return (storage ?? globalThis.localStorage)?.getItem(key) === "true"; } catch { return false; }
}

export function saveSidebarPreference(storage, collapsed) {
  try { (storage ?? globalThis.localStorage)?.setItem(key, String(collapsed)); } catch { /* Private browsing may deny storage. */ }
}
