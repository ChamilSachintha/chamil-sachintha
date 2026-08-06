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

lenis.on('scroll', updateScrollTarget);

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

function loadQueue(indices, maxConcurrency = 6, onProgress = null) {
  let cursor = 0;
  let finished = 0;
  return new Promise((resolve) => {
    if (indices.length === 0) return resolve();
    let active = 0;

    function next() {
      if (cursor >= indices.length && active === 0) {
        return resolve();
      }
      while (active < maxConcurrency && cursor < indices.length) {
        const frameIdx = indices[cursor++];
        active++;
        loadSingleImage(frameIdx).finally(() => {
          active--;
          finished++;
          if (onProgress) {
            onProgress(finished, indices.length);
          }
          next();
        });
      }
    }
    next();
  });
}

async function preloadImages() {
  // Pass 1: Load critical start frames (0..8) immediately
  const initialIndices = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  await loadQueue(initialIndices, 8, (finished, total) => {
    const percent = Math.round((finished / total) * 100);
    if (loaderText) {
      loaderText.textContent = `Loading Experience ${percent}%`;
    }
  });

  // Dismiss loader immediately so site opens
  hideLoader();

  // Pass 2: Load keyframes across the entire scroll length (every 4th frame)
  const keyframeIndices = [];
  for (let i = 12; i < TOTAL_FRAMES; i += 4) {
    keyframeIndices.push(i);
  }
  
  // Load keyframes in parallel worker pool
  loadQueue(keyframeIndices, 6).then(() => {
    // Pass 3: Fill in remaining in-between frames in background
    const remainingIndices = [];
    for (let i = 0; i < TOTAL_FRAMES; i++) {
      if (!images[i]) {
        remainingIndices.push(i);
      }
    }
    loadQueue(remainingIndices, 6);
  });
}

function initGraduationCarousel() {
  const wrapper = document.querySelector('.education-media');
  if (!wrapper) return;

  const images = wrapper.querySelectorAll('.graduate-carousel .graduate-image');
  const dots = wrapper.querySelectorAll('.dots-indicator .dot');
  const prevBtn = wrapper.querySelector('.nav-arrow.prev');
  const nextBtn = wrapper.querySelector('.nav-arrow.next');
  
  if (images.length === 0) return;
  
  let currentIndex = 0;
  let intervalId = null;

  function showSlide(index) {
    images[currentIndex].classList.remove('active');
    if (dots.length > currentIndex) {
      dots[currentIndex].classList.remove('active');
    }

    currentIndex = index;

    images[currentIndex].classList.add('active');
    if (dots.length > currentIndex) {
      dots[currentIndex].classList.add('active');
    }
  }

  function startAutoCycle() {
    stopAutoCycle();
    intervalId = setInterval(() => {
      let nextIndex = (currentIndex + 1) % images.length;
      showSlide(nextIndex);
    }, 4000);
  }

  function stopAutoCycle() {
    if (intervalId) {
      clearInterval(intervalId);
    }
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      let prevIndex = (currentIndex - 1 + images.length) % images.length;
      showSlide(prevIndex);
      startAutoCycle();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      let nextIndex = (currentIndex + 1) % images.length;
      showSlide(nextIndex);
      startAutoCycle();
    });
  }

  dots.forEach((dot, idx) => {
    dot.style.cursor = 'pointer';
    dot.addEventListener('click', () => {
      showSlide(idx);
      startAutoCycle();
    });
  });

  startAutoCycle();
}

function initProjectFilters() {
  const filterTabs = document.querySelectorAll('.project-filters .filter-tab');
  const projectCards = document.querySelectorAll('.projects-grid .project-card');

  if (filterTabs.length === 0 || projectCards.length === 0) return;

  function applyFilter(filterValue) {
    if (filterValue === 'all') {
      const categories = ['ui-ux', 'web-mobile', 'branding', 'graphic-design', 'digital-arts'];
      const groupedCards = {};
      
      categories.forEach(cat => {
        groupedCards[cat] = [];
      });
      
      projectCards.forEach(card => {
        const cat = card.getAttribute('data-category');
        if (groupedCards[cat]) {
          groupedCards[cat].push(card);
        }
      });
      
      const selectedCards = new Set();
      
      categories.forEach(cat => {
        const cards = groupedCards[cat];
        if (cards.length <= 2) {
          cards.forEach(c => selectedCards.add(c));
        } else {
          const shuffled = [...cards].sort(() => 0.5 - Math.random());
          selectedCards.add(shuffled[0]);
          selectedCards.add(shuffled[1]);
        }
      });
      
      projectCards.forEach(card => {
        card.style.opacity = '0';
        card.style.transform = 'scale(0.95)';
        
        setTimeout(() => {
          if (selectedCards.has(card)) {
            card.style.display = 'flex';
            card.offsetHeight; // Force reflow
            card.style.opacity = '1';
            card.style.transform = 'scale(1)';
          } else {
            card.style.display = 'none';
          }
        }, 350);
      });
    } else {
      projectCards.forEach(card => {
        card.style.opacity = '0';
        card.style.transform = 'scale(0.95)';
        
        setTimeout(() => {
          const isMatch = card.getAttribute('data-category') === filterValue;
          if (isMatch) {
            card.style.display = 'flex';
            card.offsetHeight; // Force reflow
            card.style.opacity = '1';
            card.style.transform = 'scale(1)';
          } else {
            card.style.display = 'none';
          }
        }, 350);
      });
    }
  }

  filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      filterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const filterValue = tab.getAttribute('data-filter');
      applyFilter(filterValue);
    });
  });

  // Apply default 'all' filter on load to select 2 random projects per category
  applyFilter('all');
}

function initProjectLinks() {
  const cards = document.querySelectorAll('.project-card');
  
  cards.forEach(card => {
    const wrapper = card.querySelector('.project-iframe-wrapper');
    if (!wrapper) return;

    let targetUrl = wrapper.getAttribute('data-link');

    if (!targetUrl) {
      const iframe = card.querySelector('iframe');
      if (iframe) {
        const src = iframe.getAttribute('src');
        if (src.includes('behance.net')) {
          const match = src.match(/project\/(\d+)/);
          if (match) {
            targetUrl = `https://www.behance.net/gallery/${match[1]}`;
          }
        } else if (src.includes('vercel.app')) {
          targetUrl = src;
        }
      }
    }

    if (targetUrl) {
      if (card.querySelector('.project-card-overlay-link')) return;

      const link = document.createElement('a');
      link.href = targetUrl;
      link.target = '_blank';
      link.className = 'project-card-overlay-link';
      link.setAttribute('aria-label', 'Open project in new tab');
      card.appendChild(link);
    }
  });
}

const TESTIMONIALS_DATA = [
  {
    image: "/images/clients/client_IshanDahanayaka.jpg",
    name: "Ishan Dahanayaka",
    position: "BSc Eng. (Hons), PG. Dip(Structural), CEng, MIESL",
    role: "Bridge & Structural Design Engineer",
    country: "Sri Lanka",
    code: "lk",
    message: "I had privilege of working with Chamil Sachintha when we have joined our hands in organizing of first ever Inter University Debate competition (Engineering) organized by YMS, IESL which was successfully concluded in 2021. Competition was completely held in virtual platform, since the covid pandemic situation and Chamil has done remarkable role as the host throughout the event. As the Chief Organizer of the event, I highly recommend his expertise, dedication and team working skill and any team would be lucky to have Chamil in their team. I wish him every success in all his endeavors."
  },
  {
    image: "/images/clients/client_vasile96.jpg",
    name: "vasile96",
    position: "Client",
    role: "",
    country: "UK",
    code: "gb",
    message: "Number 1! Great to work with! The best guy that I worked with! Superfast! Highly recommended!"
  },
  {
    image: "/images/clients/client_familiaoffice.jpg",
    name: "familiaoffice",
    position: "Client",
    role: "",
    country: "Japan",
    code: "jp",
    message: "Perfect work as always! Trustable person! Great communication and took all my revisions and changed them to exactly what if asked for!"
  },
  {
    image: "/images/clients/client_hussain629.jpg",
    name: "hussain629",
    position: "Client",
    role: "",
    country: "Hong Kong",
    code: "hk",
    message: "Good and fast work bro delivery on time thank you so much"
  },
  {
    image: "/images/clients/client_sergiosombrao.jpg",
    name: "sergiosombrao",
    position: "Client",
    role: "",
    country: "Brazil",
    code: "br",
    message: "Very good and fast job 5star"
  },
  {
    image: "/images/clients/client_cannoneye.jpg",
    name: "cannoneye",
    position: "Client",
    role: "",
    country: "Australia",
    code: "au",
    message: "Time Value great communication Happy returning Customer Thank you so much."
  },
  {
    image: "/images/clients/client_entzibasllari.jpg",
    name: "entzibasllari",
    position: "Client",
    role: "",
    country: "UK",
    code: "gb",
    message: "The best."
  },
  {
    image: "/images/clients/client_DamithDisanayaka.jpg",
    name: "Damith Disanayaka",
    position: "Chartered Civil Engineer | B.Sc. Eng (Hons) | MIE(SL)",
    role: "Executive Engineer, PRDD, NWP",
    country: "Sri Lanka",
    code: "lk",
    message: "I met Mr. Chamil Sachintha when I was the Chairman for Young Members Section (YMS) of the Institution of Engineers Sri Lanka (IESL) for the session 2020/21. It was the first time YMS organized the Inter University Debate competition among the seven engineering faculties in SL. We had to conduct the entire event in virtual platform due to the pandemic situation and Mr. Chamil was the one of active members in the organizing committee. He was the host for all the matches. It was a big task since it was the first experience of most of us for having a debate competition in virtual platform. Mr. Chamil did an amazing work and it was miraculous for me to work with this young, energetic and enthusiastic personality."
  },
  {
    image: "/images/clients/client_DineshPiyasamara.jpg",
    name: "Dinesh Piyasamara",
    position: "AI/ML Engineer | BSc(Hons) Engineering",
    role: "",
    country: "Sri Lanka",
    code: "lk",
    message: "Chamil is an enthusiastic and passionate person, with a strong background in full-stack, front-end web development, UI/UX design, and related areas. He has a continuous effort to be the best in his professional doings."
  },
  {
    image: "/images/clients/client_hasnainahmad.jpg",
    name: "hasnainahmad619",
    position: "Graphic Designer",
    role: "",
    country: "Pakistan",
    code: "pk",
    message: "It would a good experience to work with him. He is very Nice and Polite."
  }
];

function initTestimonialsSlider() {
  const box = document.querySelector('.testimonial-box');
  if (!box) return;

  const quoteEl = box.querySelector('.testimonial-quote');
  const nameEl = box.querySelector('.client-name');
  const roleEl = box.querySelector('.client-role');
  const avatarContainer = box.querySelector('.client-avatar');
  const dotsContainer = box.querySelector('.dots-indicator');
  const prevBtn = box.querySelector('.nav-arrow.prev');
  const nextBtn = box.querySelector('.nav-arrow.next');

  if (!quoteEl || !nameEl || !roleEl || !avatarContainer || !dotsContainer) return;

  let currentIndex = 0;
  let autoplayInterval = null;

  dotsContainer.innerHTML = '';
  TESTIMONIALS_DATA.forEach((_, idx) => {
    const dot = document.createElement('span');
    dot.className = `dot ${idx === 0 ? 'active' : ''}`;
    dot.style.cursor = 'pointer';
    dot.addEventListener('click', () => {
      showSlide(idx);
      resetAutoplay();
    });
    dotsContainer.appendChild(dot);
  });

  const dots = dotsContainer.querySelectorAll('.dot');

  function showSlide(index) {
    const fadeEls = [quoteEl, nameEl, roleEl, avatarContainer];
    fadeEls.forEach(el => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(10px)';
      el.style.transition = 'all 0.3s ease';
    });

    setTimeout(() => {
      currentIndex = index;
      const data = TESTIMONIALS_DATA[currentIndex];

      quoteEl.textContent = data.message;
      
      const flagImg = `<img src="https://flagcdn.com/w20/${data.code}.png" alt="${data.country} Flag" class="country-flag" />`;
      nameEl.innerHTML = `<span>${data.name.toUpperCase()}</span> <span class="client-meta-divider">&bull;</span> <span class="client-meta-country">${data.country}</span> ${flagImg}`;
      
      let roleText = '';
      if (data.position && data.position !== 'Client') {
        roleText = `${data.position}${data.role ? ' &bull; ' + data.role : ''}`;
      } else {
        roleText = data.position;
      }
      roleEl.innerHTML = roleText;

      avatarContainer.innerHTML = '';
      if (data.image) {
        const img = document.createElement('img');
        img.src = data.image;
        img.alt = data.name;
        img.className = 'avatar-img';
        img.style.objectFit = 'cover';
        avatarContainer.appendChild(img);
      } else {
        const div = document.createElement('div');
        div.className = 'avatar-img';
        div.textContent = data.name.substring(0, 2).toUpperCase();
        avatarContainer.appendChild(div);
      }

      dots.forEach((dot, idx) => {
        dot.classList.toggle('active', idx === currentIndex);
      });

      fadeEls.forEach(el => {
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
      });
    }, 300);
  }

  function nextSlide() {
    let nextIdx = (currentIndex + 1) % TESTIMONIALS_DATA.length;
    showSlide(nextIdx);
  }

  function prevSlide() {
    let prevIdx = (currentIndex - 1 + TESTIMONIALS_DATA.length) % TESTIMONIALS_DATA.length;
    showSlide(prevIdx);
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      nextSlide();
      resetAutoplay();
    });
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      prevSlide();
      resetAutoplay();
    });
  }

  function startAutoplay() {
    autoplayInterval = setInterval(nextSlide, 8000);
  }

  function resetAutoplay() {
    clearInterval(autoplayInterval);
    startAutoplay();
  }

  showSlide(0);
  startAutoplay();
}

function initMobileNav() {
  const toggleBtn = document.querySelector('.mobile-nav-toggle');
  const navLinks = document.querySelector('.nav-links');
  const links = document.querySelectorAll('.nav-links .nav-link');

  if (!toggleBtn || !navLinks) return;

  toggleBtn.addEventListener('click', () => {
    toggleBtn.classList.toggle('active');
    navLinks.classList.toggle('active');
    document.body.classList.toggle('no-scroll');
  });

  links.forEach(link => {
    link.addEventListener('click', () => {
      toggleBtn.classList.remove('active');
      navLinks.classList.remove('active');
      document.body.classList.remove('no-scroll');
    });
  });
}

function initContactForm() {
  const form = document.getElementById('contact-form');
  const status = document.getElementById('form-status');
  if (!form) return;

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (status) {
      status.textContent = 'Sending...';
      status.className = 'form-status';
    }

    // EmailJS credentials. Replace these placeholders with your actual keys.
    const serviceID = 'service_bnsk04d';
    const templateID = 'template_umgveoz';
    const publicKey = 'EZ2RmN2bTuRdNMtnY';

    // Initialize EmailJS dynamically with the public key
    if (typeof emailjs !== 'undefined') {
      emailjs.init({
        publicKey: publicKey
      });

      emailjs.sendForm(serviceID, templateID, this)
        .then(() => {
          if (status) {
            status.textContent = 'Message sent successfully!';
            status.className = 'form-status success';
          }
          form.reset();
        }, (error) => {
          if (status) {
            status.textContent = `Failed to send message: ${error.text || JSON.stringify(error)}`;
            status.className = 'form-status error';
          }
        });
    } else {
      if (status) {
        status.textContent = 'Error: EmailJS library not loaded. Check internet connection.';
        status.className = 'form-status error';
      }
    }
  });
}

async function init() {
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('scroll', updateScrollTarget, { passive: true });
  window.addEventListener('touchmove', updateScrollTarget, { passive: true });

  // Draw initial frame 0 and start render loop immediately
  requestAnimationFrame(renderLoop);

  // Start progressive loading sequence
  preloadImages();

  // Start graduation photo carousel
  initGraduationCarousel();

  // Start project filtering system
  initProjectFilters();

  // Start project link navigation
  initProjectLinks();

  // Start testimonials slider
  initTestimonialsSlider();

  // Start mobile navigation overlay
  initMobileNav();

  // Initialize contact form system
  initContactForm();
}

init();
