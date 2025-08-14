// playlists.js (pro UI + full player controls: play/pause/stop/prev/next/shuffle + per-item play)
// Also supports search, create, rename, delete playlist, remove track from playlist.

document.addEventListener("DOMContentLoaded", () => {
  const LS_PL = "mp.playlists.v1";
  const tracks = Array.isArray(window.APP_TRACKS) ? window.APP_TRACKS : [];

  // ---------- DOM ----------
  const $ = (s, r=document) => r.querySelector(s);
  const plContainer = $("#plContainer");
  const newPlName   = $("#newPlName");
  const createBtn   = $("#createPlBtn");
  const search      = $("#plSearch");
  const clear       = $("#plClear");

  // Player DOM (shared styling from style.css)
  const audio       = $("#plAudio");
  const npText      = $("#npText");
  const bar         = $("#progress-bar");
  const vol         = $("#volume-range");
  const playBtn     = $("#playPauseBtn");
  const playIcon    = $("#playPauseIcon");
  const stopBtn     = $("#stopBtn");
  const prevBtn     = $("#prevBtn");
  const nextBtn     = $("#nextBtn");
  const shuffleBtn  = $("#shuffleBtn");

  // ---------- State ----------
  const load = () => { try { return JSON.parse(localStorage.getItem(LS_PL)||"{}"); } catch { return {}; } };
  const save = (obj) => localStorage.setItem(LS_PL, JSON.stringify(obj||{}));
  let playlists = load();

  let queue = [];     // array of track indices in play order
  let qPos  = 0;      // position inside queue
  let isLoaded = false;
  let isShuffle = false;

  // ---------- Utils ----------
  const escapeHTML = (s='') => s
    .replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");

  const toCDN = (u) => {
    const m1 = u?.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/raw\/([^/]+)\/(.+)$/i);
    if (m1) return `https://cdn.jsdelivr.net/gh/${m1[1]}/${m1[2]}@${m1[3]}/${m1[4]}`;
    const m2 = u?.match(/^https?:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/i);
    if (m2) return `https://cdn.jsdelivr.net/gh/${m2[1]}/${m2[2]}@${m2[3]}/${m2[4]}`;
    return u;
  };

  const fmt = (s)=> Number.isFinite(s) ? `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,"0")}` : "--:--";

  const trackMeta = (i)=>{
    const t = tracks[i] || {};
    return { title:t?.title||"Track", artist:t?.artist||"Unknown", cover:(t?.cover||"").trim(), idx:i, src:toCDN(t?.src||"") };
  };

  const setIcon = (playing)=> {
    playIcon.classList.toggle("fa-pause", playing);
    playIcon.classList.toggle("fa-play", !playing);
  };

  const setNP = (i)=>{
    const t = trackMeta(i);
    npText.textContent = `${t.artist} – ${t.title}`;
  };

  const setShuffle = (on)=>{
    isShuffle = on;
    shuffleBtn.style.color = on ? "var(--primary)" : "";
  };

  function buildQueueFromPlaylist(name, startIdx=null){
    const arr = (playlists[name]||[]).slice();
    if (!arr.length) return false;
    queue = arr.slice();
    qPos  = Math.max(0, startIdx==null ? 0 : queue.indexOf(startIdx));
    if (qPos === -1) qPos = 0;
    return true;
  }

  function tryLoad(url, timeout=7000){
    return new Promise(res=>{
      if(!url){ res(false); return; }
      let done=false;
      const finish = (ok)=>{ if(done) return; done=true; clearTimeout(t); audio.oncanplay=null; audio.onerror=null; res(ok); };
      audio.oncanplay=()=>finish(true);
      audio.onerror  =()=>finish(false);
      audio.src=url; audio.load();
      const t=setTimeout(()=>finish(false), timeout);
    });
  }

  async function loadAndPlayByIndex(trackIndex, {autoplay=true}={}){
    const t = trackMeta(trackIndex);
    isLoaded = false;
    bar.value = 0; audio.currentTime = 0;
    const ok = await tryLoad(t.src);
    isLoaded = ok;
    setNP(trackIndex);
    if (ok && autoplay) play(); else setIcon(false);
  }

  function currentTrackIndex(){ return queue[qPos]; }

  function next(){
    if (!queue.length) return;
    if (isShuffle && queue.length>1){
      let r = Math.floor(Math.random()*queue.length);
      if (r===qPos) r = (r+1)%queue.length;
      qPos = r;
    } else {
      qPos = (qPos + 1) % queue.length;
    }
    loadAndPlayByIndex(currentTrackIndex(), {autoplay:true});
  }

  function prev(){
    if (!queue.length) return;
    if (isShuffle && queue.length>1){
      let r = Math.floor(Math.random()*queue.length);
      if (r===qPos) r = (r+queue.length-1)%queue.length;
      qPos = r;
    } else {
      qPos = (qPos - 1 + queue.length) % queue.length;
    }
    loadAndPlayByIndex(currentTrackIndex(), {autoplay:true});
  }

  const play = ()=> audio.play().then(()=>setIcon(true)).catch(()=>setIcon(false));
  const pause= ()=> { audio.pause(); setIcon(false); };
  const stop = ()=> { audio.pause(); audio.currentTime=0; setIcon(false); };

  // ---------- Render ----------
  function render(){
    const q = (search.value||"").trim().toLowerCase();
    const names = Object.keys(playlists).sort((a,b)=>a.localeCompare(b));
    if (!names.length){
      plContainer.innerHTML = `<p style="opacity:.75">No playlists yet. Create one above.</p>`;
      return;
    }

    plContainer.innerHTML = names.map(name=>{
      const arr = (playlists[name]||[]);
      // visible items filtered by search
      const items = arr.map(trackMeta);
      const nameMatch = name.toLowerCase().includes(q);
      const visible = q ? items.filter(x => (`${x.artist} ${x.title} ${name}`).toLowerCase().includes(q)) : items;
      if (q && !nameMatch && !visible.length) return "";

      const listHTML = visible.map(x=>`
        <div class="pl-item" style="display:grid;grid-template-columns:52px 1fr auto;align-items:center;gap:10px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);padding:8px;border-radius:10px;">
          <img src="${x.cover}" alt="" style="width:52px;height:52px;border-radius:8px;object-fit:cover"/>
          <div class="meta">
            <strong>${escapeHTML(x.title)}</strong><br/>
            <small style="opacity:.7">${escapeHTML(x.artist)}</small>
          </div>
          <div style="display:inline-flex;gap:8px;align-items:center;">
            <button class="icon-btn track-play"  data-name="${escapeHTML(name)}" data-idx="${x.idx}" title="Play"><i class="fa-solid fa-play"></i></button>
            <button class="icon-btn remove-track" data-name="${escapeHTML(name)}" data-idx="${x.idx}" title="Remove from playlist"><i class="fa-solid fa-xmark"></i></button>
          </div>
        </div>
      `).join("");

      return `
        <article class="playlist-card" data-name="${escapeHTML(name)}" style="display:grid;gap:12px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);border-radius:14px;padding:14px;">
          <header style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
            <div style="display:flex;align-items:center;gap:10px;">
              <i class="fa-solid fa-list"></i>
              <h3 style="font-size:1rem">${escapeHTML(name)}</h3>
              <span style="opacity:.75;font-size:.85rem">(${arr.length})</span>
            </div>
            <div style="display:inline-flex;gap:8px;align-items:center;">
              <button class="btn" class="play-all" data-name="${escapeHTML(name)}" onclick="void(0)" style="display:inline-flex;gap:6px;align-items:center">
                <i class="fa-solid fa-play"></i> Play all
              </button>
              <button class="icon-btn rename-pl" data-name="${escapeHTML(name)}" title="Rename"><i class="fa-solid fa-pen"></i></button>
              <button class="icon-btn delete-pl" data-name="${escapeHTML(name)}" title="Delete"><i class="fa-solid fa-trash"></i></button>
            </div>
          </header>
          ${listHTML || `<p style="opacity:.7">No matching tracks.</p>`}
        </article>
      `;
    }).join("");
  }

  // ---------- Create / Search ----------
  createBtn.addEventListener("click", ()=>{
    const name = (newPlName.value||"").trim();
    if(!name) return;
    if(!playlists[name]) playlists[name] = [];
    save(playlists);
    newPlName.value="";
    render();
  });

  clear.addEventListener("click", ()=>{ search.value=""; render(); });
  search.addEventListener("input", render);

  // ---------- Delegated actions (play all, play track, remove, rename, delete) ----------
  document.addEventListener("click",(e)=>{
    const playAll = e.target.closest(".btn") && e.target.closest(".btn").textContent.trim().startsWith("Play all");
    const card = e.target.closest(".playlist-card");

    if (playAll && card){
      const name = card.dataset.name;
      if (buildQueueFromPlaylist(name)){
        loadAndPlayByIndex(currentTrackIndex(), {autoplay:true});
      }
      return;
    }

    const tp = e.target.closest(".track-play");
    if (tp){
      const name = tp.dataset.name;
      const idx  = +tp.dataset.idx;
      if (buildQueueFromPlaylist(name, idx)){
        loadAndPlayByIndex(idx, {autoplay:true});
      }
      return;
    }

    const rm = e.target.closest(".remove-track");
    if (rm){
      const name = rm.dataset.name;
      const idx  = +rm.dataset.idx;
      const arr = playlists[name]||[];
      const pos = arr.indexOf(idx);
      if (pos>-1){
        arr.splice(pos,1);
        save(playlists);
        // If removing current playing track, adjust queue
        if (queue.length){
          const inQueuePos = queue.indexOf(idx);
          if (inQueuePos>-1){
            queue.splice(inQueuePos,1);
            if (qPos >= queue.length) qPos = Math.max(0, queue.length-1);
          }
        }
        render();
      }
      return;
    }

    const ren = e.target.closest(".rename-pl");
    if (ren){
      const oldName = ren.dataset.name;
      if(!(oldName in playlists)) return;
      const next = prompt("New playlist name:", oldName);
      if(!next || next.trim()===oldName) return;
      const newName = next.trim();
      if(playlists[newName]){ alert("A playlist with that name already exists."); return; }
      playlists[newName] = playlists[oldName];
      delete playlists[oldName];
      save(playlists);
      render();
      return;
    }

    const del = e.target.closest(".delete-pl");
    if (del){
      const name = del.dataset.name;
      if(!(name in playlists)) return;
      if (confirm(`Delete playlist "${name}"? This cannot be undone.`)){
        // If current queue came from this list, clear it
        if (queue.length && (playlists[name]||[]).some(i => queue.includes(i))){
          queue = []; qPos = 0; stop(); npText.textContent = "Nothing playing";
        }
        delete playlists[name];
        save(playlists);
        render();
      }
      return;
    }
  });

  // ---------- Player wiring ----------
  playBtn.addEventListener("click", ()=>{
    if (!isLoaded && queue.length) {
      loadAndPlayByIndex(currentTrackIndex(), {autoplay:true});
    } else {
      audio.paused ? play() : pause();
    }
  });

  stopBtn.addEventListener("click", stop);
  nextBtn.addEventListener("click", next);
  prevBtn.addEventListener("click", prev);
  shuffleBtn.addEventListener("click", ()=> setShuffle(!isShuffle));

  vol && (audio.volume = Math.min(1, Math.max(0, (+vol.value||100)/100)));
  vol?.addEventListener("input", ()=>{ audio.volume = (+vol.value||0)/100; vol.style.setProperty("--val", vol.value); });

  audio.addEventListener("loadedmetadata", ()=>{ bar.max = Number.isFinite(audio.duration)?audio.duration:0; bar.value=0; });
  audio.addEventListener("timeupdate", ()=>{ if(Number.isFinite(audio.currentTime)) bar.value = audio.currentTime; });
  bar.addEventListener("input", ()=>{ const t=+bar.value; if(Number.isFinite(t)) audio.currentTime=t; });
  bar.addEventListener("change", ()=>{ if(!audio.paused) play(); });
  audio.addEventListener("ended", next);

  // ---------- Init ----------
  render();
  setShuffle(false);
  setIcon(false);
  npText.textContent = "Nothing playing";
});
