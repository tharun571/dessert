// dessert tracker — service worker
// batches samples from content scripts and POSTs to the desktop bridge on 127.0.0.1:43137

const BRIDGE_URL = 'http://127.0.0.1:43137/events';
const FLUSH_INTERVAL_MS = 10000; // flush every 10 seconds
const VERSION = 1;

let queue = [];

// Receive samples from content scripts
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'sample') {
    queue.push({
      event_id: msg.sample.eventId,
      ts: msg.sample.ts,
      event_type: 'browser.activity.sample',
      payload: {
        event_id: msg.sample.eventId,
        ts: msg.sample.ts,
        domain: msg.sample.domain,
        path: msg.sample.path,
        title: msg.sample.title,
        visible: msg.sample.visible,
        focused: msg.sample.focused,
        sample_window_ms: msg.sample.sampleWindowMs,
        active_scroll_ms: msg.sample.activeScrollMs,
        wheel_events: msg.sample.wheelEvents,
        key_events: msg.sample.keyEvents,
      },
    });
  }
});

// Flush queue to bridge
async function flush() {
  if (queue.length === 0) return;

  const batch = { version: VERSION, events: queue };
  queue = [];

  try {
    await fetch(BRIDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    });
  } catch (_) {
    // Bridge not running — silently drop. Will retry next interval.
  }
}

// Use alarms for reliable background wakeup
chrome.alarms.create('flush', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'flush') flush();
});

// Also flush more frequently while active
setInterval(flush, FLUSH_INTERVAL_MS);
