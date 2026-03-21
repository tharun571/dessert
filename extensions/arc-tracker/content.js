// dessert tracker — content script
// Runs on x.com, twitter.com, linkedin.com, youtube.com
// Samples every 5 seconds and reports to background.js

const SAMPLE_INTERVAL_MS = 5000;

let wheelEvents = 0;
let keyEvents = 0;
let activeScrollMs = 0;
let lastScrollTime = null;
let lastSampleTime = Date.now();

// Track wheel events
document.addEventListener('wheel', () => {
  wheelEvents++;
  lastScrollTime = Date.now();
}, { passive: true });

// Track key events
document.addEventListener('keydown', () => {
  keyEvents++;
}, { passive: true });

// Accumulate active scroll time (treat scroll within 2s as continuous)
function tickActiveScroll() {
  if (lastScrollTime && (Date.now() - lastScrollTime) < 2000) {
    activeScrollMs += 250; // called every 250ms
  }
}
setInterval(tickActiveScroll, 250);

// Sample and send
setInterval(() => {
  const now = Date.now();
  const windowMs = now - lastSampleTime;
  lastSampleTime = now;

  const sample = {
    eventId: crypto.randomUUID(),
    ts: new Date().toISOString(),
    domain: location.hostname,
    path: location.pathname,
    title: document.title || null,
    visible: !document.hidden,
    focused: document.hasFocus(),
    sampleWindowMs: windowMs,
    activeScrollMs: activeScrollMs,
    wheelEvents: wheelEvents,
    keyEvents: keyEvents,
  };

  // Reset counters
  activeScrollMs = 0;
  wheelEvents = 0;
  keyEvents = 0;

  chrome.runtime.sendMessage({ type: 'sample', sample });
}, SAMPLE_INTERVAL_MS);
