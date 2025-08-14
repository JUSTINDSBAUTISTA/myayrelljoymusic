// main.js – dynamic tracks + CORS-safe GitHub rewrite + robust loader

document.addEventListener("DOMContentLoaded", () => {
  // ===== EDIT YOUR TRACKS HERE ONLY =====
  // You can set src as a string or an array of strings (primary + fallbacks).
  const tracks = [
    {
      artist: "Syn Cole",
      title: "Feel Good",
      cover: "https://github.com/user-attachments/assets/d80e6b68-b67a-4e27-86ee-e00581883d5c",
      src: "https://github.com/ecemgo/mini-samples-great-tricks/raw/main/song-list/SynCole-FeelGood.mp3",
    },
    {
      artist: "Clarx & Harddope",
      title: "Castle",
      cover: "https://github.com/user-attachments/assets/9240f7ff-1b8e-4e62-a2d1-df78b285c7e0",
      src: "https://github.com/ecemgo/mini-samples-great-tricks/raw/main/song-list/HarddopeClarx-Castle.mp3",
    },
    {
      artist: "NEFFEX",
      title: "Play Dead",
      cover: "https://github.com/user-attachments/assets/6e5ba953-49c5-4634-a1c5-4caf310cba86",
      src: "https://github.com/ecemgo/mini-samples-great-tricks/raw/main/song-list/PlayDead-NEFFEX.mp3",
    },
    {
      artist: "Patrick Patrikios",
      title: "Know Myself",
      cover: "https://github.com/user-attachments/assets/a2ca0dfd-e53f-4e79-b8b0-288847e59b9a",
      src: "https://github.com/ecemgo/mini-samples-great-tricks/raw/main/song-list/KnowMyself-PatrickPatrikios.mp3",
    },
    {
      artist: "Besomorph & Coopex",
      title: "Redemption",
      cover: "https://github.com/user-attachments/assets/b286d7ff-52a1-452d-9cd9-5920c937b16e",
      src: "https://github.com/ecemgo/mini-samples-great-tricks/raw/main/song-list/BesomorphCoopex-Redemption.mp3",
    },
  ];
  // ======================================

  // --- DOM refs
  const swiperWrapper = document.querySelector(".swiper .swiper-wrapper");
  const playlistEl = document.querySelector(".playlist");
  const audioPlayer = document.getElementById("audioPlayer");
  const volumeRange = document.getElementById("volume-range");
  const progressBar = document.getElementById("progress-bar");
  const playPauseBtn = document.getElementById("playPauseBtn");
  const playPauseIcon = document.getElementById("playPauseIcon");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const shuffleBtn = document.getElementById("shuffleBtn");

  // --- State
  let currentSongIndex = Math.min(2, tracks.length - 1);
  let isSongLoaded = false;
  let isShuffle = false;
  let swiper;

  // --- Convert GitHub URLs to CORS-safe CDN (jsDelivr)
  function toCorsSafe(url) {
    if (!url || typeof url !== "string") return url;

    // github.com/<owner>/<repo>/raw/<branch>/<path>
    const ghRawMatch = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/raw\/([^/]+)\/(.+)$/i);
    if (ghRawMatch) {
      const [, owner, repo, branch, path] = ghRawMatch;
      return `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/${path}`;
    }

    // raw.githubusercontent.com/<owner>/<repo>/<branch>/<path>
    const ghContentMatch = url.match(/^https?:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/i);
    if (ghContentMatch) {
      const [, owner, repo, branch, path] = ghContentMatch;
      return `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/${path}`;
    }

    return url; // non-GitHub URL -> leave as-is
  }

  // --- Render UI from tracks
  function renderUI() {
    swiperWrapper.innerHTML = tracks.map((t) => `
      <div class="swiper-slide">
        <img src="${(t.cover || "").trim()}" alt="${escapeHtml((t.artist || t.title || "Cover").toString())} cover" />
        <h1>${escapeHtml((t.artist || t.title || "Unknown").toString())}</h1>
      </div>`).join("");

    playlistEl.innerHTML = tracks.map((t, idx) => `
      <div class="playlist-item${idx === currentSongIndex ? " active-playlist-item" : ""}"
           data-idx="${idx}" role="button"
           aria-label="Play ${escapeHtml((t.title || "Track").toString())} by ${escapeHtml((t.artist || "Unknown").toString())}">
        <img src="${(t.cover || "").trim()}" alt="${escapeHtml((t.artist || t.title || "Cover").toString())}" />
        <div class="song">
          <p>${escapeHtml((t.artist || "Unknown").toString())}</p>
          <p>${escapeHtml((t.title || "Track").toString())}</p>
        </div>
        <p class="duration">--:--</p>
        <i class="fa-regular fa-heart like-btn" aria-hidden="true"></i>
      </div>`).join("");

    // Like toggles
    playlistEl.querySelectorAll(".like-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        btn.classList.toggle("fa-regular");
        btn.classList.toggle("fa-solid");
      });
    });

    // Row clicks
    playlistEl.querySelectorAll(".playlist-item").forEach((item) => {
      item.addEventListener("click", (e) => {
        if (e.target && e.target.classList.contains("like-btn")) return;
        const idx = parseInt(item.dataset.idx, 10);
        if (!Number.isFinite(idx)) return;
        currentSongIndex = idx;
        loadTrack(currentSongIndex, { autoplay: true });
      });
    });

    // Init swiper
    swiper = new Swiper(".swiper", {
      effect: "cards",
      cardsEffect: { perSlideOffset: 9, perSlideRotate: 3 },
      grabCursor: true,
      speed: 700,
      initialSlide: currentSongIndex,
    });

    swiper.on("slideChange", () => {
      const newIndex = swiper.realIndex;
      if (newIndex === currentSongIndex) return;
      const wasPlaying = isSongLoaded && !audioPlayer.paused;
      currentSongIndex = newIndex;
      loadTrack(currentSongIndex, { autoplay: wasPlaying });
    });

    // Preload durations best-effort (async)
    preloadDurations();
  }

  function escapeHtml(s) {
    return s
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function updatePlaylistHighlight(index) {
    playlistEl.querySelectorAll(".playlist-item").forEach((item, i) => {
      item.classList.toggle("active-playlist-item", i === index);
    });
  }

  function updatePlayPauseIcon(isPlaying) {
    playPauseIcon.classList.toggle("fa-pause", isPlaying);
    playPauseIcon.classList.toggle("fa-play", !isPlaying);
  }

  function setShuffleActive(active) {
    isShuffle = active;
    shuffleBtn.style.color = active ? "var(--primary-clr)" : "";
  }

  // --- Source helpers
  function getSourcesForIndex(i) {
    const s = tracks[i]?.src;
    const arr = Array.isArray(s) ? s.filter(Boolean) : [s].filter(Boolean);
    // Normalize every GitHub URL to jsDelivr (CORS-safe)
    return arr.map(toCorsSafe);
  }

  // --- Loader utilities
  function tryLoad(url, audio, timeoutMs = 7000) {
    return new Promise((resolve) => {
      if (!url) return resolve(false);
      audio.oncanplay = null;
      audio.onerror = null;

      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        audio.oncanplay = null;
        audio.onerror = null;
        resolve(ok);
      };

      audio.onerror = () => finish(false);
      audio.oncanplay = () => finish(true);

      audio.src = url;
      audio.load();

      const timer = setTimeout(() => finish(false), timeoutMs);
    });
  }

  async function loadTrack(index, { autoplay = true } = {}) {
    const candidates = getSourcesForIndex(index);
    progressBar.value = 0;
    audioPlayer.currentTime = 0;

    let ok = false;
    for (const url of candidates) {
      ok = await tryLoad(url, audioPlayer);
      if (ok) break;
    }

    updatePlaylistHighlight(index);
    if (swiper && swiper.realIndex !== index) swiper.slideTo(index);
    isSongLoaded = ok;

    if (ok && autoplay) {
      playSong();
    } else {
      updatePlayPauseIcon(false);
    }
  }

  function playSong() {
    audioPlayer
      .play()
      .then(() => updatePlayPauseIcon(true))
      .catch(() => updatePlayPauseIcon(false));
  }

  function pauseSong() {
    audioPlayer.pause();
    updatePlayPauseIcon(false);
  }

  function togglePlayPause() {
    if (!isSongLoaded) {
      loadTrack(currentSongIndex, { autoplay: true });
    } else if (audioPlayer.paused) {
      playSong();
    } else {
      pauseSong();
    }
  }

  function nextIndex() {
    if (isShuffle) {
      if (tracks.length <= 1) return currentSongIndex;
      let r = Math.floor(Math.random() * tracks.length);
      if (r === currentSongIndex) r = (r + 1) % tracks.length;
      return r;
    }
    return (currentSongIndex + 1) % tracks.length;
  }

  function prevIndex() {
    if (isShuffle) {
      if (tracks.length <= 1) return currentSongIndex;
      let r = Math.floor(Math.random() * tracks.length);
      if (r === currentSongIndex) r = (r + tracks.length - 1) % tracks.length;
      return r;
    }
    return (currentSongIndex - 1 + tracks.length) % tracks.length;
  }

  function nextSong() {
    currentSongIndex = nextIndex();
    loadTrack(currentSongIndex, { autoplay: true });
  }

  function prevSong() {
    currentSongIndex = prevIndex();
    loadTrack(currentSongIndex, { autoplay: true });
  }

  // --- Duration helpers
  function formatTime(sec) {
    if (!Number.isFinite(sec)) return "--:--";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function preloadDurations() {
    const items = playlistEl.querySelectorAll(".playlist-item .duration");
    tracks.forEach((t, i) => {
      const firstUrl = getSourcesForIndex(i)[0];
      if (!firstUrl) return;
      const a = new Audio();
      a.crossOrigin = "anonymous";
      a.preload = "metadata";
      a.src = firstUrl;
      a.addEventListener("loadedmetadata", () => {
        const el = items[i];
        if (el) el.textContent = formatTime(a.duration);
      });
      a.addEventListener("error", () => {
        const el = items[i];
        if (el) el.textContent = "--:--";
      });
    });
  }

  // --- Events
  playPauseBtn.addEventListener("click", togglePlayPause);
  nextBtn.addEventListener("click", nextSong);
  prevBtn.addEventListener("click", prevSong);
  shuffleBtn.addEventListener("click", () => setShuffleActive(!isShuffle));

  // Volume
  if (volumeRange) {
    const initVolume = Math.min(100, Math.max(0, parseInt(volumeRange.value || "100", 10)));
    audioPlayer.volume = initVolume / 100;
    volumeRange.addEventListener("input", () => {
      const v = Math.min(100, Math.max(0, parseInt(volumeRange.value || "0", 10)));
      audioPlayer.volume = v / 100;
    });
  }

  // Progress
  audioPlayer.addEventListener("loadedmetadata", () => {
    const dur = Number.isFinite(audioPlayer.duration) ? audioPlayer.duration : 0;
    progressBar.max = dur;
    progressBar.value = 0;
  });

  audioPlayer.addEventListener("timeupdate", () => {
    if (Number.isFinite(audioPlayer.currentTime)) {
      progressBar.value = audioPlayer.currentTime;
    }
  });

  progressBar.addEventListener("input", () => {
    const t = parseFloat(progressBar.value);
    if (Number.isFinite(t)) {
      audioPlayer.currentTime = t;
    }
  });

  progressBar.addEventListener("change", () => {
    if (!audioPlayer.paused) playSong();
  });

  audioPlayer.addEventListener("ended", nextSong);

  // --- Init
  renderUI();
  updatePlaylistHighlight(currentSongIndex);
  updatePlayPauseIcon(false);
  setShuffleActive(false);
  loadTrack(currentSongIndex, { autoplay: false });
});
