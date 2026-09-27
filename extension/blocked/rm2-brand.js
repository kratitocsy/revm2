/* Wynko brand assets for the extension's blocked page: a warm starfield
   canvas and the Wynko lockup image, bundled with the extension so the
   blocked page works offline. */

function initStarfield(canvasId = "starfield", count = 240) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener("resize", resize);
  const stars = Array.from({ length: count }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: Math.random() * 1.1 + 0.15,
    a: Math.random() * 0.65 + 0.1,
    s: Math.random() * 0.0003 + 0.00008,
  }));
  let t = 0;
  (function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    t++;
    for (const s of stars) {
      const alpha = Math.max(0, s.a + Math.sin(t * s.s * 60 + s.x * 100) * 0.18);
      ctx.beginPath();
      ctx.arc(s.x * canvas.width, s.y * canvas.height, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,247,230,${alpha})`;
      ctx.fill();
    }
    requestAnimationFrame(draw);
  })();
}

function buildLogoSVG(size) {
  return `<img class="rm2-svg rm2-svg--${size}" src="wynko-lockup.png" alt="Wynko" />`;
}

function injectLogoCSS() {
  if (document.getElementById("rm2-logo-css")) return;
  const s = document.createElement("style");
  s.id = "rm2-logo-css";
  s.textContent = `
    .rm2-logo{display:inline-block;line-height:0;}
    .rm2-svg{display:block;}
    .rm2-svg--small{width:128px;height:auto;mix-blend-mode:lighten;}
  `;
  document.head.appendChild(s);
}

function mountLogo() {
  injectLogoCSS();
  document.querySelectorAll(".rm2-logo").forEach((el) => {
    el.innerHTML = buildLogoSVG(el.dataset.size || "small");
  });
}

function wireMuteButton() {
  const btn = document.getElementById("mute-btn");
  if (!btn) return;
  const render = () => {
    btn.textContent = isBlockedAudioOn() ? "\uD83D\uDD0A" : "\uD83D\uDD07";
  };
  render();
  btn.addEventListener("click", () => {
    const next = !isBlockedAudioOn();
    try {
      localStorage.setItem("rm2_sound", JSON.stringify(next));
    } catch {}
    render();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initStarfield();
  mountLogo();
  wireMuteButton();
  playBlockedAudio();
});

/* ── BLOCKED-PAGE AUDIO ────────────────────────────────────
   Plays one shared clip on every blocked page. Falls back to the
   browser's built-in speech synthesis if the file is missing or
   autoplay is blocked, so this never silently does nothing. */

const BLOCKED_VOICE_FILE = "audio/blocked-voice.mp3";
const BLOCKED_VOICE_FALLBACK_TEXT = "This site is blocked. Your future will thank you.";

async function playBlockedAudio() {
  if (!isBlockedAudioOn()) return;

  const audio = new Audio(chrome.runtime.getURL(`blocked/${BLOCKED_VOICE_FILE}`));
  audio.volume = 0.85;

  audio.addEventListener("error", () => speakFallback(BLOCKED_VOICE_FALLBACK_TEXT));
  try {
    await audio.play();
  } catch {
    // File missing, or browser blocked autoplay - speak it instead.
    speakFallback(BLOCKED_VOICE_FALLBACK_TEXT);
  }
}

function speakFallback(text) {
  if (!("speechSynthesis" in window)) return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 0.95;
  utter.pitch = 1;
  speechSynthesis.speak(utter);
}

function isBlockedAudioOn() {
  // Reuses the same localStorage key convention as the website's
  // sound toggle (rm2_sound) so muting one place mutes both.
  try {
    const v = localStorage.getItem("rm2_sound");
    return v === null ? true : JSON.parse(v) !== false;
  } catch {
    return true;
  }
}
