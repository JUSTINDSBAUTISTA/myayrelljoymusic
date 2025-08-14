// main.js – dynamic UI + favorites (persisted) + add-to-playlist (lazy modal) + per-item delete + CORS-safe playback
document.addEventListener("DOMContentLoaded", () => {
  // ===== Tracks (use shared tracks.js if present; else fallback) =====
  const defaultTracks = [
    { artist:"Syn Cole", title:"Feel Good", cover:"https://github.com/user-attachments/assets/d80e6b68-b67a-4e27-86ee-e00581883d5c", src:"https://github.com/ecemgo/mini-samples-great-tricks/raw/main/song-list/SynCole-FeelGood.mp3" },
    { artist:"Clarx & Harddope", title:"Castle", cover:"https://github.com/user-attachments/assets/9240f7ff-1b8e-4e62-a2d1-df78b285c7e0", src:"https://github.com/ecemgo/mini-samples-great-tricks/raw/main/song-list/HarddopeClarx-Castle.mp3" },
    { artist:"NEFFEX", title:"Play Dead", cover:"https://github.com/user-attachments/assets/6e5ba953-49c5-4634-a1c5-4caf310cba86", src:"https://github.com/ecemgo/mini-samples-great-tricks/raw/main/song-list/PlayDead-NEFFEX.mp3" },
    { artist:"Patrick Patrikios", title:"Know Myself", cover:"https://github.com/user-attachments/assets/a2ca0dfd-e53f-4e79-b8b0-288847e59b9a", src:"https://github.com/ecemgo/mini-samples-great-tricks/raw/main/song-list/KnowMyself-PatrickPatrikios.mp3" },
    { artist:"Besomorph & Coopex", title:"Redemption", cover:"https://github.com/user-attachments/assets/b286d7ff-52a1-452d-9cd9-5920c937b16e", src:"https://github.com/ecemgo/mini-samples-great-tricks/raw/main/song-list/BesomorphCoopex-Redemption.mp3" },
  ];
  const tracks = Array.isArray(window.APP_TRACKS) ? window.APP_TRACKS : defaultTracks;

  // ===== DOM =====
  const swiperWrapper = document.querySelector(".swiper .swiper-wrapper");
  const playlistEl   = document.querySelector(".playlist");
  const audio        = document.getElementById("audioPlayer");
  const vol          = document.getElementById("volume-range");
  const bar          = document.getElementById("progress-bar");
  const playBtn      = document.getElementById("playPauseBtn");
  const playIcon     = document.getElementById("playPauseIcon");
  const prevBtn      = document.getElementById("prevBtn");
  const nextBtn      = document.getElementById("nextBtn");
  const shuffleBtn   = document.getElementById("shuffleBtn");
  const searchInput  = document.getElementById("searchInput");
  const clearSearch  = document.getElementById("clearSearch");
  const favBtn       = document.getElementById("favoritesBtn");
  const favCountEl   = document.getElementById("favCount");
  const favPanel     = document.getElementById("favoritesPanel");
  const favList      = document.querySelector(".favorites-list");
  const closeFavsBtn = document.getElementById("closeFavs");

  // ===== State =====
  let swiper, isShuffle=false, isLoaded=false;
  let current = Math.min(2, tracks.length-1);

  // Favorites (persisted)
  const LS_FAVS = "mp.favorites.v1";
  const loadFavorites = () => {
    try { return new Set(JSON.parse(localStorage.getItem(LS_FAVS) || "[]")); }
    catch { return new Set(); }
  };
  const saveFavorites = () => {
    localStorage.setItem(LS_FAVS, JSON.stringify([...favs].sort((a,b)=>a-b)));
  };
  const favs = loadFavorites();

  // Playlists (lazy)
  const LS_PL = "mp.playlists.v1";
  let playlists = null;
  let modalTrackIdx = null;

  // ===== Utils =====
  const html = (s='') => s.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  const toCDN = (u) => {
    const m1 = u?.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/raw\/([^/]+)\/(.+)$/i);
    if (m1) return `https://cdn.jsdelivr.net/gh/${m1[1]}/${m1[2]}@${m1[3]}/${m1[4]}`;
    const m2 = u?.match(/^https?:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/i);
    if (m2) return `https://cdn.jsdelivr.net/gh/${m2[1]}/${m2[2]}@${m2[3]}/${m2[4]}`;
    return u;
  };
  const srcs = (i) => [toCDN(tracks[i]?.src)].filter(Boolean);
  const savePlaylists = () => localStorage.setItem(LS_PL, JSON.stringify(playlists||{}));
  const loadPlaylists = () => { try { return JSON.parse(localStorage.getItem(LS_PL)||"{}"); } catch { return {}; } };

  // Lazy modal refs
  const modalRefs = () => ({
    modal:   document.getElementById("playlistModal"),
    close:   document.getElementById("plClose"),
    cancel:  document.getElementById("plCancel"),
    save:    document.getElementById("plSave"),
    create:  document.getElementById("plCreate"),
    newName: document.getElementById("plNewName"),
    list:    document.querySelector(".pl-list"),
  });

  // ===== Render =====
  function renderUI(){
    // Swiper slides
    swiperWrapper.innerHTML = tracks.map(t=>`
      <div class="swiper-slide">
        <img src="${(t.cover||'').trim()}" alt="${html((t.artist||t.title||'Cover')+' cover')}" />
        <h1>${html(t.artist||t.title||'Unknown')}</h1>
      </div>
    `).join("");

    // Playlist rows
    playlistEl.innerHTML = tracks.map((t,i)=>`
      <div class="playlist-item${i===current?' active-playlist-item':''}" data-idx="${i}" role="button">
        <img src="${(t.cover||'').trim()}" alt="${html(t.artist||t.title||'Cover')}" />
        <div class="song"><p>${html(t.artist||'Unknown')}</p><p>${html(t.title||'Track')}</p></div>
        <p class="duration">--:--</p>
        <div class="actions">
          <i class="fa-${favs.has(i)?'solid':'regular'} fa-heart like-btn" title="Favorite" aria-hidden="true"></i>
          <i class="fa-regular fa-square-plus add-btn" title="Add to playlist" aria-hidden="true"></i>
        </div>
      </div>
    `).join("");

    // Row interactions
    playlistEl.querySelectorAll(".playlist-item").forEach(row=>{
      const i = +row.dataset.idx;
      const heart = row.querySelector(".like-btn");
      const addBtn = row.querySelector(".add-btn");

      row.addEventListener("click",(e)=>{
        if (e.target?.classList.contains("like-btn") || e.target?.classList.contains("add-btn")) return;
        current=i; load(i,{autoplay:true});
      });

      heart.addEventListener("click",(e)=>{
        e.stopPropagation();
        const liked = heart.classList.toggle("fa-solid");
        heart.classList.toggle("fa-regular", !liked);
        liked ? favs.add(i) : favs.delete(i);
        saveFavorites();
        updateFavs();
      });

      addBtn.addEventListener("click",(e)=>{
        e.stopPropagation();
        openPlaylistModal(i);
      });
    });

    // Swiper
    swiper = new Swiper(".swiper",{effect:"cards",cardsEffect:{perSlideOffset:9,perSlideRotate:3},grabCursor:true,speed:700,initialSlide:current});
    swiper.on("slideChange",()=>{
      const idx = swiper.realIndex;
      if (idx===current) return;
      const wasPlaying = isLoaded && !audio.paused;
      current=idx; load(current,{autoplay:wasPlaying});
    });

    // Preload durations
    const dEls = playlistEl.querySelectorAll(".duration");
    tracks.forEach((t,i)=>{
      const a = new Audio(); a.crossOrigin="anonymous"; a.preload="metadata"; a.src=srcs(i)[0];
      a.addEventListener("loadedmetadata",()=>{ dEls[i].textContent = fmt(a.duration); });
      a.addEventListener("error",()=>{ dEls[i].textContent = "--:--"; });
    });
  }

  // ===== Favorites panel (persist + robust toggle) =====
  let favOpen = false;
  function openFavs(){ favOpen=true; favBtn?.setAttribute("aria-expanded","true"); favPanel?.removeAttribute("hidden"); }
  function closeFavs(){ favOpen=false; favBtn?.setAttribute("aria-expanded","false"); favPanel?.setAttribute("hidden",""); }
  function toggleFavs(){ favOpen ? closeFavs() : openFavs(); }

  function updateFavs(){
    favCountEl.textContent = favs.size;
    if (!favList) return;
    if (favs.size === 0){
      favList.innerHTML = `<p style="opacity:.7">No favorites yet.</p>`;
      return;
    }
    const frag = document.createDocumentFragment();
    [...favs].sort((a,b)=>a-b).forEach(i=>{
      const t = tracks[i];
      const item = document.createElement("div");
      item.className = "fav-item";
      item.dataset.idx = String(i);
      item.innerHTML = `
        <img src="${(t.cover||'').trim()}" alt="">
        <div class="meta"><strong>${html(t.title||'Track')}</strong><small>${html(t.artist||'Unknown')}</small></div>
        <i class="fa-solid fa-play"></i>
      `;
      item.addEventListener("click", ()=>{ current=i; load(current,{autoplay:true}); closeFavs(); });
      frag.appendChild(item);
    });
    favList.innerHTML = "";
    favList.appendChild(frag);
  }

  // Close favorites if user clicks outside of the panel & button
  document.addEventListener("click",(e)=>{
    if (!favOpen) return;
    if (favPanel?.contains(e.target)) return;
    if (favBtn?.contains(e.target)) return;
    closeFavs();
  });
  // ESC to close
  document.addEventListener("keydown",(e)=>{
    if (e.key === "Escape" && favOpen) closeFavs();
  });

  // ===== Add to Playlist (lazy modal) =====
  function ensurePlaylists(){
    if (playlists==null) playlists = loadPlaylists();
  }
  function openPlaylistModal(trackIdx){
    ensurePlaylists();
    const { modal, newName } = modalRefs();
    if (!modal) return;
    modalTrackIdx = trackIdx;
    renderPlaylistCheckboxes(trackIdx);
    modal.removeAttribute("hidden");
    if (newName){ newName.value=""; newName.focus(); }
  }
  function closePlaylistModal(){
    const { modal } = modalRefs();
    if (modal) modal.setAttribute("hidden","");
    modalTrackIdx = null;
  }
  function renderPlaylistCheckboxes(trackIdx){
    const { list } = modalRefs();
    if (!list) return;
    const names = Object.keys(playlists||{}).sort((a,b)=>a.localeCompare(b));
    list.innerHTML = names.length ? names.map(name=>{
      const checked = (playlists[name]||[]).includes(trackIdx);
      const id = `pl_${name.replace(/\W+/g,'_')}`;
      const enc = encodeURIComponent(name); // store RAW name safely
      return `
        <div class="pl-row" style="display:flex;align-items:center;gap:8px;justify-content:space-between;">
          <label class="pl-item" for="${id}" style="flex:1;">
            <input id="${id}" type="checkbox" data-name-enc="${enc}" ${checked?"checked":""}/>
            <span>${html(name)}</span>
          </label>
          <button class="pl-del icon-btn" data-name-enc="${enc}" title="Delete playlist" aria-label="Delete ${html(name)}">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      `;
    }).join("") : `<p style="opacity:.75">No playlists yet. Create one above.</p>`;
  }
  function createPlaylist(){
    ensurePlaylists();
    const { newName } = modalRefs();
    if (!newName) return;
    const raw = newName.value.trim();
    if(!raw) return;
    if(!playlists[raw]) { playlists[raw] = []; savePlaylists(); }
    renderPlaylistCheckboxes(modalTrackIdx);
    const id = `pl_${raw.replace(/\W+/g,'_')}`;
    const el = document.getElementById(id);
    el && (el.checked = true);
    newName.value="";
  }
  function applyPlaylistChanges(){
    ensurePlaylists();
    if (modalTrackIdx==null) return;
    const { list } = modalRefs();
    if (!list) return;
    list.querySelectorAll('input[type="checkbox"]').forEach(box=>{
      const name = decodeURIComponent(box.dataset.nameEnc||"");
      if(!playlists[name]) playlists[name]=[];
      const arr = playlists[name];
      const idx = arr.indexOf(modalTrackIdx);
      if(box.checked && idx===-1) arr.push(modalTrackIdx);
      if(!box.checked && idx>-1) arr.splice(idx,1);
    });
    savePlaylists();
    closePlaylistModal();
  }
  function deletePlaylistByName(name){
    if (!name) return;
    if (!playlists || !(name in playlists)) return;
    const ok = confirm(`Delete playlist "${name}"? This cannot be undone.`);
    if (!ok) return;
    delete playlists[name];
    savePlaylists();
    renderPlaylistCheckboxes(modalTrackIdx);
  }

  // Modal overlay & controls (delegated)
  document.addEventListener("click",(e)=>{
    const { modal } = modalRefs();
    if (modal && !modal.hasAttribute("hidden") && e.target === modal) closePlaylistModal();
    if (e.target?.id === "plClose")  closePlaylistModal();
    if (e.target?.id === "plCancel") closePlaylistModal();
    if (e.target?.id === "plSave")   applyPlaylistChanges();
    if (e.target?.id === "plCreate") createPlaylist();
    const delBtn = e.target.closest?.(".pl-del");
    if (delBtn){ deletePlaylistByName(decodeURIComponent(delBtn.dataset.nameEnc||"")); }
  });
  document.addEventListener("keydown",(e)=>{
    const { modal } = modalRefs();
    if (e.key === "Escape" && modal && !modal.hasAttribute("hidden")) closePlaylistModal();
  });

  // ===== Player =====
  function fmt(s){ if(!Number.isFinite(s)) return "--:--"; const m=Math.floor(s/60), x=Math.floor(s%60); return `${m}:${String(x).padStart(2,"0")}`; }
  function highlight(i){
    playlistEl.querySelectorAll(".playlist-item").forEach((el,idx)=> el.classList.toggle("active-playlist-item", idx===i));
    if (swiper && swiper.realIndex!==i) swiper.slideTo(i);
  }
  function setIcon(p){ playIcon.classList.toggle("fa-pause",p); playIcon.classList.toggle("fa-play",!p); }
  function setShuffle(on){ isShuffle=on; shuffleBtn.style.color = on ? "var(--primary)" : ""; }

  function tryLoad(url, timeout=7000){
    return new Promise(res=>{
      if(!url) return res(false);
      let done=false; const finish=(ok)=>{ if(done) return; done=true; clearTimeout(t); audio.oncanplay=null; audio.onerror=null; res(ok); };
      audio.oncanplay=()=>finish(true); audio.onerror=()=>finish(false);
      audio.src=url; audio.load();
      const t=setTimeout(()=>finish(false),timeout);
    });
  }

  async function load(i,{autoplay=true}={}){
    const urls = srcs(i);
    bar.value=0; audio.currentTime=0;
    let ok=false; for(const u of urls){ ok = await tryLoad(u); if(ok) break; }
    highlight(i); isLoaded=ok; ok && autoplay ? play() : setIcon(false);
  }
  const play = () => audio.play().then(()=>setIcon(true)).catch(()=>setIcon(false));
  const pause= () => { audio.pause(); setIcon(false); };
  const next = () => { current = isShuffle ? ((tracks.length<=1)?current:((Math.floor(Math.random()*tracks.length)+(tracks.length>1 && Math.random()<.5?1:0))%tracks.length)) : (current+1)%tracks.length; load(current,{autoplay:true}); };
  const prev = () => { current = isShuffle ? ((tracks.length<=1)?current:((Math.floor(Math.random()*tracks.length)+tracks.length-1)%tracks.length)) : (current-1+tracks.length)%tracks.length; load(current,{autoplay:true}); };

  // ===== Search =====
  function applySearch(){
    const q = (searchInput?.value||"").trim().toLowerCase();
    const rows = playlistEl.querySelectorAll(".playlist-item");
    rows.forEach(row=>{
      const i = +row.dataset.idx, t = tracks[i];
      const hay = `${t.artist||""} ${t.title||""}`.toLowerCase();
      row.style.display = q && !hay.includes(q) ? "none" : "";
    });
  }

  // ===== Wire up =====
  playBtn.addEventListener("click", ()=> isLoaded ? (audio.paused?play():pause()) : load(current,{autoplay:true}));
  nextBtn.addEventListener("click", next);
  prevBtn.addEventListener("click", prev);
  shuffleBtn.addEventListener("click", ()=> setShuffle(!isShuffle));

  favBtn?.addEventListener("click", (e)=>{ e.preventDefault(); toggleFavs(); });
  closeFavsBtn?.addEventListener("click", (e)=>{ e.preventDefault(); closeFavs(); });

  vol && (audio.volume = Math.min(1, Math.max(0, (+vol.value||100)/100)));
  vol?.addEventListener("input", ()=>{ audio.volume = (+vol.value||0)/100; vol.style.setProperty("--val", vol.value); });

  audio.addEventListener("loadedmetadata", ()=>{ bar.max = Number.isFinite(audio.duration)?audio.duration:0; bar.value=0; });
  audio.addEventListener("timeupdate", ()=>{ if(Number.isFinite(audio.currentTime)) bar.value = audio.currentTime; });
  bar.addEventListener("input", ()=>{ const t=+bar.value; if(Number.isFinite(t)) audio.currentTime=t; });
  bar.addEventListener("change", ()=>{ if(!audio.paused) play(); });
  audio.addEventListener("ended", next);

  searchInput?.addEventListener("input", applySearch);
  clearSearch?.addEventListener("click", ()=>{ searchInput.value=""; applySearch(); searchInput.focus(); });
  searchInput?.addEventListener("keydown", (e)=>{ if(e.key==="Enter"){ const first = [...playlistEl.querySelectorAll(".playlist-item")].find(el=>el.style.display!=="none"); first?.click(); } });

  // ===== Init =====
  renderUI();
  updateFavs();
  setShuffle(false);
  setIcon(false);
  closeFavs(); // consistent initial state
  load(current,{autoplay:false});
});
