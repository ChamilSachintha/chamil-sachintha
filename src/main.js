import Lenis from 'lenis';

const TOTAL_FRAMES = 288;
const images = [];
let loadedCount = 0;

const canvas = document.getElementById('frame-canvas');
const ctx = canvas.getContext('2d');
const loader = document.getElementById('loader');
const loaderText = document.getElementById('loader-text');

let currentFrame = 0;
let targetFrame = 0;
let lastDrawnFrame = -1;

// Initialize Lenis smooth scrolling
const lenis = new Lenis({
  duration: 1.2,
  easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  smoothWheel: true,
  touchMultiplier: 2,
});

function getFrameUrl(index) {
  const frameNum = String(index + 1).padStart(3, '0');
  return `/frames/ezgif-frame-${frameNum}.jpg`;
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform matrix
  ctx.scale(dpr, dpr);
  lastDrawnFrame = -1; // Force redraw on resize
}

function getNearestLoadedFrame(targetIdx) {
  if (images[targetIdx] && images[targetIdx].complete && images[targetIdx].naturalWidth > 0) {
    return targetIdx;
  }
  // Search downwards for nearest loaded frame
  for (let i = targetIdx - 1; i >= 0; i--) {
    if (images[i] && images[i].complete && images[i].naturalWidth > 0) {
      return i;
    }
  }
  // Search upwards if no lower frame is loaded
  for (let i = targetIdx + 1; i < TOTAL_FRAMES; i++) {
    if (images[i] && images[i].complete && images[i].naturalWidth > 0) {
      return i;
    }
  }
  return -1;
}

function drawFrame(frameIndex) {
  const readyIdx = getNearestLoadedFrame(frameIndex);
  if (readyIdx === -1) return;
  const img = images[readyIdx];
  if (!img) return;

  const dpr = window.devicePixelRatio || 1;
  const canvasWidth = canvas.width / dpr;
  const canvasHeight = canvas.height / dpr;

  const imgRatio = img.width / img.height;
  const canvasRatio = canvasWidth / canvasHeight;

  let drawWidth, drawHeight, offsetX, offsetY;

  // Cover mode aspect ratio math
  if (canvasRatio > imgRatio) {
    drawWidth = canvasWidth;
    drawHeight = canvasWidth / imgRatio;
    offsetX = 0;
    offsetY = (canvasHeight - drawHeight) / 2;
  } else {
    drawWidth = canvasHeight * imgRatio;
    drawHeight = canvasHeight;
    offsetX = (canvasWidth - drawWidth) / 2;
    offsetY = 0;
  }

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
  lastDrawnFrame = readyIdx;
}

function updateScrollTarget() {
  const scrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
  const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  const scrollFraction = Math.min(1, Math.max(0, scrollY / maxScroll));
  targetFrame = Math.min(TOTAL_FRAMES - 1, Math.floor(scrollFraction * TOTAL_FRAMES));
}

function updateActiveNavLink() {
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav-link');
  const scrollY = window.scrollY + 200;

  sections.forEach((section) => {
    const sectionTop = section.offsetTop;
    const sectionHeight = section.offsetHeight;
    const sectionId = section.getAttribute('id');

    if (scrollY >= sectionTop && scrollY < sectionTop + sectionHeight) {
      navLinks.forEach((link) => {
        link.classList.remove('active');
        if (link.getAttribute('href') === `#${sectionId}`) {
          link.classList.add('active');
        }
      });
    }
  });
}

const navbar = document.querySelector('.navbar');
let lastScrollY = window.scrollY || 0;

function updateNavbarVisibility() {
  if (!navbar) return;
  const currentScrollY = window.scrollY || document.documentElement.scrollTop || 0;

  if (currentScrollY <= 50) {
    navbar.classList.remove('navbar--hidden');
  } else if (currentScrollY > lastScrollY + 5) {
    navbar.classList.add('navbar--hidden');
  } else if (currentScrollY < lastScrollY - 5) {
    navbar.classList.remove('navbar--hidden');
  }

  lastScrollY = currentScrollY;
}

function renderLoop(time) {
  lenis.raf(time);
  updateScrollTarget();
  updateActiveNavLink();
  updateNavbarVisibility();

  // Linear Interpolation (lerp) for liquid-smooth animation transitions
  const diff = targetFrame - currentFrame;
  if (Math.abs(diff) > 0.001) {
    currentFrame += diff * 0.15;
  } else {
    currentFrame = targetFrame;
  }

  const frameToDraw = Math.min(TOTAL_FRAMES - 1, Math.max(0, Math.round(currentFrame)));
  if (frameToDraw !== lastDrawnFrame) {
    drawFrame(frameToDraw);
  }

  requestAnimationFrame(renderLoop);
}

function hideLoader() {
  if (loader) {
    loader.style.opacity = '0';
    loader.style.pointerEvents = 'none';
    setTimeout(() => {
      loader.style.display = 'none';
    }, 500);
  }
}

function loadSingleImage(index) {
  return new Promise((resolve) => {
    if (images[index]) return resolve(images[index]);
    const img = new Image();
    img.src = getFrameUrl(index);
    img.onload = () => {
      images[index] = img;
      loadedCount++;
      resolve(img);
    };
    img.onerror = () => {
      images[index] = null;
      resolve(null);
    };
  });
}

async function preloadImages() {
  // 1. Instantly load the first 5 critical frames so page opens immediately
  const CRITICAL_COUNT = 5;
  const criticalPromises = [];
  for (let i = 0; i < CRITICAL_COUNT; i++) {
    criticalPromises.push(loadSingleImage(i));
  }
  await Promise.all(criticalPromises);

  // 2. Dismiss preloader immediately!
  hideLoader();

  // 3. Progressively load remaining frames in small non-blocking batches in background
  const BATCH_SIZE = 8;
  for (let i = CRITICAL_COUNT; i < TOTAL_FRAMES; i += BATCH_SIZE) {
    const batch = [];
    for (let j = i; j < Math.min(i + BATCH_SIZE, TOTAL_FRAMES); j++) {
      batch.push(loadSingleImage(j));
    }
    await Promise.all(batch);
  }
}

async function init() {
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('scroll', updateScrollTarget, { passive: true });

  // Draw initial frame 0 and start render loop immediately
  requestAnimationFrame(renderLoop);

  // Start progressive loading sequence
  preloadImages();
}

init();
