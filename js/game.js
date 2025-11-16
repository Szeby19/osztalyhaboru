// Simple Frogger-like game. Drop your images into assets/images/char1.png..char27.png
// Drop sounds into assets/sounds/ (catch.mp3, boss_line1.mp3, boss_line2.mp3 ...)

(function(){
  const CANVAS_ID = 'gameCanvas';
  const canvas = document.getElementById(CANVAS_ID);
  const ctx = canvas.getContext('2d');

  // --- Firebase / Leaderboard helpers ---
  let db = null;
  let firebaseHelpers = null;
  let auth = null;
  let firebaseInited = false;

  async function initFirebaseIfNeeded() {
    if (firebaseInited) return;
    try {
      const { initializeApp } = await import('https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js');
      const firestore = await import('https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js');
      const firebaseAuth = await import('https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js');

      const firebaseConfig = {
        apiKey: "AIzaSyD2-M33AAOllM_7lC0PCWvME7OyHw3p2qo",
        authDomain: "mygameleaderboard-9e0ff.firebaseapp.com",
        projectId: "mygameleaderboard-9e0ff",
        storageBucket: "mygameleaderboard-9e0ff.firebasestorage.app",
        messagingSenderId: "924426842403",
        appId: "1:924426842403:web:ffbc27e329a26c26e05c96",
        measurementId: "G-06N8BR7BLY"
      };

      const app = initializeApp(firebaseConfig);
      db = firestore.getFirestore(app);
      auth = firebaseAuth.getAuth(app);
      firebaseHelpers = firestore;
      firebaseInited = true;
      console.log('Firebase initialized for leaderboard');
    } catch (e) {
      console.error('Failed to initialize Firebase:', e);
    }
  }

  // --- Authentication UI wiring ---
  function showAuthOverlay(){
    const overlay = document.getElementById('auth-overlay');
    if(overlay) overlay.style.display = 'flex';
  }
  function hideAuthOverlay(){
    const overlay = document.getElementById('auth-overlay');
    if(overlay) overlay.style.display = 'none';
  }

  function setAuthMessage(msg, color){
    const el = document.getElementById('auth-msg');
    if(!el) return; el.textContent = msg || '';
    if(color) el.style.color = color; else el.style.color = '#ffcccb';
  }

  // Login using a username (we synthesize an email to work with Firebase Auth)
  async function doLogin(username, pass){
    const email = synthesizeEmailFromUsername(username);
    await initFirebaseIfNeeded();
    if(!auth){ setAuthMessage('Auth nem elérhető. Ellenőrizd a Firebase beállítást (Email/Password engedélyezése, localhost domain hozzáadása).'); return; }
    try{
      const { signInWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js');
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      const user = cred.user;
  localStorage.setItem('isLoggedIn','true');
  localStorage.setItem('playerName', user.displayName || username);
  // Load the player's progress from Firestore
  try{ await loadProgressForUser(user.uid); }catch(e){ console.warn('loadProgressForUser failed after login', e); }
      setAuthMessage('Sikeres bejelentkezés!', '#a6f3b1');
      hideAuthOverlay();
      drawMenu();
    }catch(e){
      console.error(e);
      if(e && e.code === 'auth/configuration-not-found'){
        setAuthMessage('Firebase Auth nincs teljesen beállítva. Kapcsold be az Email/Jelszó bejelentkezést a Firebase Console -> Authentication -> Sign-in method, és add hozzá a localhost-ot az Authorized domains listához.');
      } else {
        setAuthMessage('Bejelentkezés sikertelen: '+(e.message||e));
      }
    }
  }

  // Register using a username and password. We create a synthetic email so Firebase Auth (email/password) can be used.
  async function doRegister(username, pass){
    const email = synthesizeEmailFromUsername(username);
    await initFirebaseIfNeeded();
    if(!auth){ setAuthMessage('Auth nem elérhető. Ellenőrizd a Firebase beállítást (Email/Password engedélyezése, localhost domain hozzáadása).'); return; }
    try{
      const { createUserWithEmailAndPassword, updateProfile } = await import('https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js');
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      const user = cred.user;
      // set display name
      try{ await updateProfile(user, { displayName: username }); }catch(e){}
      // store a minimal user doc in Firestore for profile lookups
      try{ await initFirebaseIfNeeded(); const col = firebaseHelpers.collection(db, 'users'); await firebaseHelpers.addDoc(col, { uid: user.uid, name: username, email, created: Date.now() }); }catch(e){/* non-fatal */}
  localStorage.setItem('isLoggedIn','true');
  localStorage.setItem('playerName', username || email);
  // Initialize new player's progress (don't load from Firebase since it's a new account)
  totalPoints = 0;
  vBucks = 0;
  unlockedMusic = [];
  dlcCharacters.forEach(char => char.locked = true);
  musicList = [...baseMusicList];
  saveProgress();
      setAuthMessage('Regisztráció sikeres! Be vagy jelentkezve.', '#a6f3b1');
      hideAuthOverlay();
      drawMenu();
    }catch(e){ console.error(e); if(e && e.code === 'auth/configuration-not-found'){ setAuthMessage('Firebase Auth nincs teljesen beállítva. Kapcsold be az Email/Jelszó bejelentkezést a Firebase Console -> Authentication -> Sign-in method, és add hozzá a localhost-ot az Authorized domains listához.'); } else { setAuthMessage('Regisztráció sikertelen: '+(e.message||e)); } }
  }

  // Create a synthetic email from a username. This allows us to use Firebase Email/Password without asking the user for a real email.
  function synthesizeEmailFromUsername(username){
    if(!username) return 'user_'+Math.random().toString(36).slice(2,9)+'@osztaly.local';
    let s = username.trim().toLowerCase();
    s = s.replace(/\s+/g,'_');
    s = s.replace(/[^a-z0-9_\-\.]/g,'_');
    if(s.length < 2) s = 'u_'+s+Math.random().toString(36).slice(2,6);
    return `${s}@osztaly.local`;
  }

  // Draw leaderboard fetched from Firestore
  async function drawLeaderboard(){
    // mark current scene so click handler knows where we are
    scene = 'leaderboard';
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle='#7ec0ee'; ctx.fillRect(0,0,W,H);
    ctx.fillStyle='#111'; ctx.globalAlpha=0.75; ctx.fillRect(40,60,W-80,H-120); ctx.globalAlpha=1;
    ctx.fillStyle='#fff'; ctx.font='28px sans-serif'; ctx.textAlign='center'; ctx.fillText('Leaderboard', W/2, 100);

    // show loading
    ctx.font='16px sans-serif'; ctx.fillStyle='#fff'; ctx.fillText('Betöltés...', W/2, 140);

    // fetch top results
    let rows = [];
    try { rows = await fetchTopScores(10); } catch(e){ rows = []; }

    // draw list with columns: rank | name | level | points
    ctx.font='18px monospace';
    ctx.fillStyle='#fff';
    let y = 200;
    if(!rows || rows.length===0){
      ctx.fillText('Nincsenek még eredmények.', W/2, y+30);
    } else {
      // header
      ctx.font='16px sans-serif';
      ctx.fillText('Hely  Név                 Szint   Pontok', W/2-120, y-20);
      ctx.font='18px monospace';
      for(let i=0;i<rows.length;i++){
        const r = rows[i];
        const name = (r.name||'Anon').substring(0,18).padEnd(18,' ');
        const lvl = r.level || 0;
        const pts = r.points || 0;
        ctx.fillText(`${(i+1).toString().padEnd(4,' ')} ${name}   ${lvl.toString().padEnd(6,' ')} ${pts}`, W/2-170, y + i*35);
      }
    }

    // Back button
    const backBtn = {text:'Vissza', x:W/2-60, y:H-80, w:120, h:40, action:'back'};
    ctx.fillStyle='#444'; ctx.fillRect(backBtn.x, backBtn.y, backBtn.w, backBtn.h);
    ctx.fillStyle='#fff'; ctx.font='16px sans-serif'; ctx.fillText('Vissza', W/2, backBtn.y + 25);
    uiButtons.length = 0; uiButtons.push(backBtn);
    ctx.textAlign='start';
  }

  // submit player's result: name, level (highest completed), and points (total collected)
  // Stores a single leaderboard document per Firebase user (uid). If the user already has a doc,
  // only update it when the new result is strictly better (higher level, or same level but more points).
  async function submitScoreToFirestore(name, level = 0, points = 0) {
    await initFirebaseIfNeeded();
    if (!firebaseInited) return;
    try {
      const col = firebaseHelpers.collection(db, 'leaderboard');
      // If we have an authenticated user, prefer to store/update by uid
      const uid = (auth && auth.currentUser) ? auth.currentUser.uid : null;
      if(uid){
        // look for existing leaderboard entry for this uid
        const q = firebaseHelpers.query(col, firebaseHelpers.where('uid','==', uid));
        const snap = await firebaseHelpers.getDocs(q);
        if(snap && !snap.empty){
          // assume single doc per uid; take first
          const docSnap = snap.docs[0];
          const data = docSnap.data();
          const oldLevel = Number(data.level||0);
          const oldPoints = Number(data.points||0);
          const newLevel = Number(level||0);
          const newPoints = Number(points||0);
          // only update if new result is better
          if(newLevel > oldLevel || (newLevel === oldLevel && newPoints > oldPoints)){
            try{
              await firebaseHelpers.updateDoc(docSnap.ref, { name: name || data.name || 'Anon', level: newLevel, points: newPoints, ts: Date.now() });
              console.log('Updated leaderboard doc for uid', uid, newLevel, newPoints);
            }catch(e){
              // fallback to set (merge)
              try{ await firebaseHelpers.setDoc(docSnap.ref, { name: name || data.name || 'Anon', level: newLevel, points: newPoints, ts: Date.now() }, { merge: true }); }catch(e2){ console.error('Failed to update leaderboard doc', e2); }
            }
          } else {
            console.log('Not updating leaderboard; existing score is better or equal for uid', uid);
          }
        } else {
          // create new doc with uid
          try{
            await firebaseHelpers.addDoc(col, { uid, name: name || 'Anon', level: Number(level) || 0, points: Number(points) || 0, ts: Date.now() });
            console.log('Added leaderboard doc for uid', uid, level, points);
          }catch(e){ console.error('Failed to add leaderboard doc for uid', e); }
        }
      } else {
        // no uid (not authenticated) - fallback: add a new entry (cannot dedupe reliably)
        try{
          await firebaseHelpers.addDoc(col, { name: name || 'Anon', level: Number(level) || 0, points: Number(points) || 0, ts: Date.now() });
          console.log('Submitted result (no uid)', name, level, points);
        }catch(e){ console.error('Failed to submit result:', e); }
      }
    } catch (e) {
      console.error('Failed to submit result (outer):', e);
    }
  }

  async function fetchTopScores(limitCount = 10) {
    await initFirebaseIfNeeded();
    if (!firebaseInited) return [];
    try {
      const col = firebaseHelpers.collection(db, 'leaderboard');
      // order by level desc, then points desc (may require composite index)
      const q = firebaseHelpers.query(col, firebaseHelpers.orderBy('level', 'desc'), firebaseHelpers.orderBy('points', 'desc'), firebaseHelpers.limit(limitCount));
      const snap = await firebaseHelpers.getDocs(q);
      const out = [];
      snap.forEach(doc => out.push(doc.data()));
      return out;
    } catch (e) {
      console.error('Failed to fetch leaderboard using server query (will fallback to client-side):', e);
      // Fallback: fetch all docs and sort client-side (avoids needing composite index)
      try {
        const col = firebaseHelpers.collection(db, 'leaderboard');
        const snap = await firebaseHelpers.getDocs(col);
        const out = [];
        snap.forEach(doc => out.push(doc.data()));
        out.sort((a,b)=>{
          const la = Number(a.level||0), lb = Number(b.level||0);
          if(la !== lb) return lb - la;
          const pa = Number(a.points||0), pb = Number(b.points||0);
          return pb - pa;
        });
        return out.slice(0, limitCount);
      } catch (e2) {
        console.error('Fallback fetch also failed:', e2);
        return [];
      }
    }
  }

  // Confetti animation for purchases
  function startPurchaseAnimation(purchaseText) {
    const duration = 3 * 1000; // Reduced to 3 seconds
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

    function randomInRange(min, max) {
      return Math.random() * (max - min) + min;
    }

    // Show purchase message
    const messageDiv = document.createElement('div');
    messageDiv.style.position = 'fixed';
    messageDiv.style.top = '50%';
    messageDiv.style.left = '50%';
    messageDiv.style.transform = 'translate(-50%, -50%)';
    messageDiv.style.background = 'rgba(0, 0, 0, 0.8)';
    messageDiv.style.color = 'white';
    messageDiv.style.padding = '20px 40px';
    messageDiv.style.borderRadius = '10px';
    messageDiv.style.fontSize = '24px';
    messageDiv.style.zIndex = '1000';
    messageDiv.textContent = `Megszerezted: ${purchaseText}!`;
    document.body.appendChild(messageDiv);

    // Remove message after animation
    setTimeout(() => {
      messageDiv.remove();
    }, duration);

    const interval = setInterval(function() {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 30 * (timeLeft / duration);
      // since particles fall down, start a bit higher than random
      confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
      confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
    }, 250);
  }
 
  let W = canvas.width, H = canvas.height;

  function resizeCanvas(){
   
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1000, Math.round(rect.width));
    canvas.height = Math.max(500, Math.round(rect.height));
    W = canvas.width; H = canvas.height;
    
    if(scene === 'menu') drawMenu();
    else if(scene === 'charSelect') drawCharSelect();
    else if(scene === 'credits') drawCredits();
  }


  window.addEventListener('load', ()=>{ resizeCanvas(); });
  window.addEventListener('resize', ()=>{ resizeCanvas(); });
  // also resize as soon as DOM is ready to avoid initial layout glitches
  document.addEventListener('DOMContentLoaded', ()=>{ resizeCanvas(); });

  let scene = 'menu';

  
  const uiButtons = [];

  // --- ZENELEJÁTSZÓ KIEGÉSZÍTÉS ---
// Base music tracks (always available)
const baseMusicList = [
  { src: 'assets/sounds/MollywoodTHC.mp3', title: 'Mollywood THC', cover: 'assets/images/mollywood.jpg' },
  { src: 'assets/sounds/coronita.mp3', title: 'Lakatos Brendon coronita', cover: 'assets/images/Coronita.jpg' },
  { src: 'assets/sounds/Summermemories.mp3', title: 'MM - Summer memories', cover: 'assets/images/gabi.jpg' },
  { src: 'assets/sounds/BEVAGYALLVA.mp3', title: 'Hazetomika-BEVAGYALLVA', cover: 'assets/images/hazetomika.jpg' }
];

// Premium music tracks (need to be purchased)
const premiumMusicList = [
  { src: 'assets/sounds/mcisti66.mp3', title: 'MC Isti - A 66 OS ÚT !', cover: 'assets/images/mcisti.jpg', price: 5000 },
  { src: 'assets/sounds/HogyhaUgatnakaKutyák.mp3', title: 'Rostás Szabika 2016 Hogyha Ugatnak a Kutyák', cover: 'assets/images/zene.jpg', price: 7500 },
  { src: 'assets/sounds/KlárinéniDala.mp3', title: 'Klári néni Dala', cover: 'assets/images/klari.jpg', price: 10000 },
  { src: 'assets/sounds/JustVidmanTudodHmmm(Tom Lucas Remix).mp3', title: 'JustVidman - Tudod... Hmmm... (Tom Lucas Remix)', cover: 'assets/images/tudod.jpg', price: 20000 }
];

// Preload music cover images
premiumMusicList.forEach(music => {
  if (!music.img) {
    music.img = new Image();
    music.img.src = music.cover;
    music.img.onload = () => { /* ready */ };
    music.img.onerror = () => { /* fallback */ };
  }
});

// Special DLC characters (need to be purchased with V-Bucks)
const dlcCharacters = [
  { imgSrc: 'assets/images/pos.jpg', name: 'Lakatos Tomika', price: 5, locked: true },
  { imgSrc: 'assets/images/viktooor.png', name: 'Kréta Boss', price: 10, locked: true },
  { imgSrc: 'assets/images/csomcsy.png', name: 'Kopasz SAS', price: 15, locked: true }
];

  // Local storage functions
  function saveProgress() {
    const gameProgress = {
      totalPoints: totalPoints,
      vBucks: vBucks,
      unlockedMusic: unlockedMusic,
      dlcCharacters: dlcCharacters
    };
    // keep a local copy for offline fallback
    try{ localStorage.setItem('gameProgress', JSON.stringify(gameProgress)); }catch(e){}
    // also persist to Firestore for the logged-in user (fire-and-forget)
    try{ saveProgressToFirestore(); }catch(e){ /* non-fatal */ }
  }

// Firestore-backed save (per-account)
async function saveProgressToFirestore(){
  try{
    await initFirebaseIfNeeded();
    if(!firebaseInited || !auth) return;
    const user = auth.currentUser;
    if(!user) return;
    const docRef = firebaseHelpers.doc(db, 'users', user.uid);
    const data = { totalPoints: Number(totalPoints||0), vBucks: Number(vBucks||0), unlockedMusic: unlockedMusic || [], dlcCharacters: dlcCharacters || [], updated: Date.now() };
    await firebaseHelpers.setDoc(docRef, data, { merge: true });
  }catch(e){ console.warn('Failed to save progress to Firestore', e); }
}

// Load progress for a given user id from Firestore. Falls back to localStorage when missing.
async function loadProgressForUser(uid){
  try{
    await initFirebaseIfNeeded();
    if(!firebaseInited) return loadProgress();
    const docRef = firebaseHelpers.doc(db, 'users', uid);
    const snap = await firebaseHelpers.getDoc(docRef);
    if(snap && snap.exists && snap.data()){
      const d = snap.data();
      totalPoints = Number(d.totalPoints || 0);
      vBucks = Number(d.vBucks || 0);
      unlockedMusic = Array.isArray(d.unlockedMusic) ? d.unlockedMusic : [];
      // reconcile dlcCharacters locked state if provided
      if(Array.isArray(d.dlcCharacters)){
        d.dlcCharacters.forEach((savedChar, index)=>{
          if(index < dlcCharacters.length && typeof savedChar.locked === 'boolean'){
            dlcCharacters[index].locked = savedChar.locked;
          }
        });
      }
      musicList = [...baseMusicList, ...premiumMusicList.filter(m => unlockedMusic.includes(m.src))];
      // update any UI that shows currency
      drawMenu();
      return;
    }
  }catch(e){ console.warn('Failed to load user progress from Firestore', e); }
  // fallback to local storage
  loadProgress();
}

function loadProgress() {
  const savedProgress = localStorage.getItem('gameProgress');
  if (savedProgress) {
    const progress = JSON.parse(savedProgress);
    totalPoints = progress.totalPoints;
    vBucks = progress.vBucks;
    unlockedMusic = progress.unlockedMusic;
    if (progress.dlcCharacters) {
      // Update locked status of DLC characters
      progress.dlcCharacters.forEach((savedChar, index) => {
        if (index < dlcCharacters.length) {
          dlcCharacters[index].locked = savedChar.locked;
        }
      });
    }
    // Update music list with unlocked premium tracks
    musicList = [...baseMusicList, ...premiumMusicList.filter(m => unlockedMusic.includes(m.src))];
  }
}

  // Player progress
  let totalPoints = 0;
  let vBucks = 0;
  let unlockedMusic = [];
  let musicList = [...baseMusicList];



// Load saved progress when game starts
loadProgress();

let currentTrack = 0;
let isPlaying = false;
let audio = new Audio(musicList[currentTrack].src);
audio.volume = 0.8;

const cover = document.getElementById('music-cover');
const title = document.getElementById('music-title');
const playBtn = document.getElementById('play-btn');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const volDownBtn = document.getElementById('vol-down-btn');
const volUpBtn = document.getElementById('vol-up-btn');
const musicVolume = document.getElementById('music-volume');

function updateMusicUI() {
  title.textContent = musicList[currentTrack].title;
  cover.src = musicList[currentTrack].cover;
  if (musicVolume) musicVolume.textContent = 'Hangerő: ' + Math.round(audio.volume * 100) + '%';
}

function playMusic() {
  audio.src = musicList[currentTrack].src;
  audio.play();
  isPlaying = true;
  playBtn.textContent = '⏸️';
  updateMusicUI();
}

function pauseMusic() {
  audio.pause();
  isPlaying = false;
  playBtn.textContent = '▶️';
}

playBtn.addEventListener('click', () => {
  if (isPlaying) pauseMusic(); else playMusic();
});

nextBtn.addEventListener('click', () => {
  currentTrack = (currentTrack + 1) % musicList.length;
  playMusic();
});

prevBtn.addEventListener('click', () => {
  currentTrack = (currentTrack - 1 + musicList.length) % musicList.length;
  playMusic();
});

updateMusicUI();

// Volume control
if (volDownBtn) volDownBtn.addEventListener('click', () => {
  audio.volume = Math.max(0, audio.volume - 0.1);
  updateMusicUI();
});
if (volUpBtn) volUpBtn.addEventListener('click', () => {
  audio.volume = Math.min(1, audio.volume + 0.1);
  updateMusicUI();
});


// --- JÁTÉK MEGÁLLÍTÁS / FOLYTATÁS ---
let paused = false;
const pauseBtn = document.getElementById('pause-btn');
pauseBtn.addEventListener('click', () => {
  paused = !paused;
  if (paused) {
    pauseBtn.textContent = '▶️ Folytat';
  } else {
    pauseBtn.textContent = '⏸ Megállít';
    if (typeof window.__startGameDebug === 'function' && player) {
      lastTime = performance.now();
      requestAnimationFrame(loop);
    }
  }
});

  // General draw function for all scenes
  function draw() {
    if(scene === 'menu') drawMenu();
    else if(scene === 'charSelect') drawCharSelect();
    else if(scene === 'playing') drawGame();
    else if(scene === 'credits') drawCredits();
    else if(scene === 'shop') drawShop();
    else if(scene === 'updates') drawUpdates();
    else if(scene === 'leaderboard') drawLeaderboard();
  }

  // módosítjuk a loopot, hogy ne fusson pause alatt
  function loop(ts) {
    if (paused) {
      requestAnimationFrame(loop);
      return;
    }

    const dt = (ts-lastTime)/1000;
    lastTime = ts;

    if(scene === 'playing') {
      player.update(dt,input);
      for(const n of npcs) n.update(dt);

      for(const n of npcs){
        if(collide(player.rect(), n.rect())){
          if(catchSound){
            catchSound.volume=AUDIO_VOL;
            catchSound.play().catch(()=>{});
          }
          totalPoints += Math.floor(score/2); // Add half the score as points when game ends
          saveProgress();
          endRound(false);
          return;
        }
      }

      if(player.y <= 10){
        score += 1000;
        totalPoints += 1000; // Add points for completing a level
        vBucks += 1; // Add 1 V-Buck per level completed
        level += 1;
        spawnNpcsForLevel(level, player.idx);
        player.x = W/2;
        player.y = H-60;
      }

      drawGame();
    } else {
      draw();
    }

    requestAnimationFrame(loop);
  }

  // Define characters as an array of objects with imgSrc and name properties
  const characters = [
    {imgSrc: 'assets/images/szili.jpg', name: 'Szili'},
    {imgSrc: 'assets/images/akos.png', name: 'Ákos'},
    {imgSrc: 'assets/images/bajusz.jpg', name: 'Martin'},
    {imgSrc: 'assets/images/berci.png', name: 'Berci'},
    {imgSrc: 'assets/images/doni.jpg', name: 'Donát'},
    {imgSrc: 'assets/images/gabika.jpg', name: 'Gábor'},
    {imgSrc: 'assets/images/imi.jpg', name: 'Imre'},
    {imgSrc: 'assets/images/kereki.jpg', name: 'Kereki'},
    {imgSrc: 'assets/images/kkristof.jpg', name: 'Kkristof'},
    {imgSrc: 'assets/images/krisztian.jpg', name: 'Krisztián'},
    {imgSrc: 'assets/images/szebi.jpeg', name: 'Julio'},
    {imgSrc: 'assets/images/takony.jpg', name: 'Gergő'},
    {imgSrc: 'assets/images/tomika.jpg', name: 'Tomi'},
    {imgSrc: 'assets/images/enikő.png', name: 'Encike'},
    {imgSrc: 'assets/images/dörmi.jpg', name: 'Dominik'},
    {imgSrc: 'assets/images/csulok.jpg', name: 'SzKristof'},
    {imgSrc: 'assets/images/bozsan.jpg', name: 'Máté'},
    {imgSrc: 'assets/images/kokusz.jpg', name: 'Dávid'},
    {imgSrc: 'assets/images/zsani.jpg', name: 'Zsani'},
    {imgSrc: 'assets/images/laci.png', name: 'László'},
    {imgSrc: 'assets/images/janos.jpg', name: 'Jani'},
    {imgSrc: 'assets/images/stefan.jpg', name: 'Stefi'},
    {imgSrc: 'assets/images/regő.jpg', name: 'Regő'},
    {imgSrc: 'assets/images/kbalázs.jpg', name: 'Kbalázs'},
    {imgSrc: 'assets/images/balint.png', name: 'Bálint'},
    {imgSrc: 'assets/images/adrian.png', name: 'Adrián'},
    {imgSrc: 'assets/images/zsombi.png', name: 'Zsombor'}
  ];

  // Load images based on characters array and DLC characters
  const charImgs = new Array(characters.length + dlcCharacters.length);
  // Load regular characters
  for(let i=0; i<characters.length; i++){
    const img = new Image(); 
    img.src = characters[i].imgSrc;
    img.onload = ()=>{ /* ok */ };
    img.onerror = ()=>{ charImgs[i] = null; };
    charImgs[i] = img;
  }
  // Load DLC characters
  for(let i=0; i<dlcCharacters.length; i++){
    const img = new Image();
    img.src = dlcCharacters[i].imgSrc;
    img.onload = ()=>{ /* ok */ };
    img.onerror = ()=>{ charImgs[characters.length + i] = null; };
    charImgs[characters.length + i] = img;
  }

  // Names from characters array
  const charNames = characters.map(c => c.name);

  const menuBg = new Image(); menuBg.src = 'assets/images/menu_bg.png';
  menuBg.onload = ()=>{}; menuBg.onerror = ()=>{};


  let AUDIO_VOL = 0.8;
  function loadAudio(src){ const a=new Audio(src); a.volume=AUDIO_VOL; a.preload='auto'; return a; }


  class Player{ constructor(x,y,idx){ this.x=x; this.y=y; this.w=60; this.h=60; this.speed=200; this.idx=idx; this.img=null; this.loadImg(); }
    loadImg(){
      const i = new Image();
      // Check if it's a DLC character
      if(this.idx >= characters.length) {
        const dlcIndex = this.idx - characters.length;
        if(dlcIndex < dlcCharacters.length && !dlcCharacters[dlcIndex].locked) {
          i.src = dlcCharacters[dlcIndex].imgSrc;
        }
      } else {
        i.src = characters[this.idx].imgSrc;
      }
      i.onload=()=>this.img=i;
      i.onerror=()=>{};
    }
    update(dt,input){ const move=this.speed*dt; if(input.left) this.x-=move; if(input.right) this.x+=move; if(input.up) this.y-=move; if(input.down) this.y+=move; this.x=Math.max(0,Math.min(W-this.w,this.x)); this.y=Math.max(0,Math.min(H-this.h,this.y)); }
    draw(ctx){ if(this.img && this.img.complete) ctx.drawImage(this.img,this.x,this.y,this.w,this.h); else { ctx.fillStyle='#0a0'; ctx.fillRect(this.x,this.y,this.w,this.h); ctx.fillStyle='#fff'; ctx.fillText('TE',this.x+8,this.y+22); } }
    rect(){ return {x:this.x,y:this.y,w:this.w,h:this.h}; }
  }

  class NPC{ constructor(x,y,w,h,speed,dir,idx){ this.x=x; this.y=y; this.w=w; this.h=h; this.speed=speed; this.dir=dir; this.idx=idx; this.img=null; this.loadImg(); }
    loadImg(){ const i = new Image(); i.src = characters[this.idx].imgSrc; i.onload=()=>this.img=i; }
        update(dt){ this.x += this.speed*this.dir*dt; if(this.dir>0 && this.x>W+70) this.x = -50 - Math.random()*100; if(this.dir<0 && this.x<-50) this.x = W+70 + Math.random()*100; }
    draw(ctx){ if(this.img && this.img.complete) ctx.drawImage(this.img,this.x,this.y,this.w,this.h); else { ctx.fillStyle='#b33'; ctx.fillRect(this.x,this.y,this.w,this.h);} }
    rect(){ return {x:this.x,y:this.y,w:this.w,h:this.h}; }
  }

  class Projectile{ constructor(x,y,vx,vy){ this.x=x; this.y=y; this.vx=vx; this.vy=vy; this.r=8; } update(dt){ this.x += this.vx*dt; this.y += this.vy*dt; } draw(ctx){ ctx.fillStyle='#555'; ctx.beginPath(); ctx.arc(this.x,this.y,this.r,0,Math.PI*2); ctx.fill(); } rect(){ return {x:this.x-this.r,y:this.y-this.r,w:this.r*2,h:this.r*2}; } }

  function collide(a,b){ return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y; }


  // V-Buck image that appears in each level
  const vbuckImg = new Image();
  vbuckImg.src = 'assets/images/vbuck.png';

  let player=null, npcs=[];
  let vbuck = null; // Current level's V-Buck object
  let input = {left:false,right:false,up:false,down:false};
  let lastTime = 0, score=0, level=1; let catchSound=null;

  
  function drawMenu(){ ctx.clearRect(0,0,W,H); 
    if(menuBg && menuBg.complete){ try{ ctx.drawImage(menuBg, 0, 0, W, H); }catch(e){ ctx.fillStyle='#7ec0ee'; ctx.fillRect(0,0,W,H); } }
    else { ctx.fillStyle='#7ec0ee'; ctx.fillRect(0,0,W,H); }
    ctx.fillStyle='#111'; ctx.globalAlpha=0.7; ctx.fillRect(60,80,W-120,H-160); ctx.globalAlpha=1;
    ctx.fillStyle='#fff'; ctx.font='36px sans-serif'; ctx.textAlign='center'; ctx.fillText('Át kell jutnod az úton!', W/2, 140);

    const btns = [
      {text:'Start', x:W/2-80, y:200, w:160, h:48, action:'start'},
      {text:'Leaderboard', x:W/2-80, y:260, w:160, h:48, action:'leaderboard'},
      {text:'Shop', x:W/2-80, y:320, w:160, h:48, action:'shop'},
      {text:'Updates', x:W/2-80, y:380, w:160, h:48, action:'updates'},
      {text:'Credits', x:W/2-80, y:440, w:160, h:48, action:'credits'}
    ];
    uiButtons.length = 0;
    for(const b of btns){ 
      ctx.fillStyle='#444'; 
      ctx.fillRect(b.x,b.y,b.w,b.h); 
      ctx.strokeStyle='#888'; 
      ctx.strokeRect(b.x,b.y,b.w,b.h); 
      ctx.fillStyle='#fff'; 
      ctx.font='20px sans-serif'; 
      ctx.fillText(b.text, b.x+b.w/2, b.y+32); 
      uiButtons.push(b); 
    }
    // Show logged-in player name if available
    try{
      const pn = localStorage.getItem('playerName');
      if(pn){ ctx.fillStyle='#fff'; ctx.font='14px sans-serif'; ctx.textAlign='right'; ctx.fillText(pn, W-16, 28); }
    }catch(e){}
    ctx.textAlign='start';
  }

  function drawShop() {
    ctx.clearRect(0,0,W,H);
    // Fortnite-style background gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, '#1a1a2e');
    gradient.addColorStop(0.5, '#16213e');
    gradient.addColorStop(1, '#0f3460');
    ctx.fillStyle = gradient;
    ctx.fillRect(0,0,W,H);

    // Shop title
    ctx.fillStyle='#fff';
    ctx.font='36px sans-serif';
    ctx.textAlign='center';
    ctx.fillText('Item Shop', W/2, 60);

    // Currency display
    ctx.font='20px sans-serif';
    ctx.fillText(`🪙 ${totalPoints} pont    💎 ${vBucks} V-Buck`, W/2, 100);

    uiButtons.length = 0;

    // Music section
    ctx.fillStyle='#fff';
    ctx.font='24px sans-serif';
    ctx.fillText('Zenék', W/2, 140);

    const musicItems = premiumMusicList.map(m => ({...m, type: 'music', currency: '🪙', currencyType: 'points', purchased: unlockedMusic.includes(m.src)}));

    const cardWidth = 180;
    const cardHeight = 220;
    const cardsPerRow = Math.floor((W - 100) / (cardWidth + 20));
    const startX = (W - (cardsPerRow * (cardWidth + 20) - 20)) / 2;
    let x = startX;
    let y = 160;

    // Draw music cards
    for(let i = 0; i < musicItems.length; i++) {
      const item = musicItems[i];

      // Card background
      ctx.fillStyle = '#2a2a3e';
      ctx.fillRect(x, y, cardWidth, cardHeight);
      ctx.strokeStyle = '#4a4a6a';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, cardWidth, cardHeight);

      // Item image (placeholder or actual image)
      ctx.fillStyle = '#444';
      ctx.fillRect(x + 10, y + 10, cardWidth - 20, 120);

      // Try to draw actual image if available
      let img = null;
      if(item.type === 'music') {
        // For music, create and load image if not already loaded
        if(!item.img) {
          item.img = new Image();
          item.img.src = item.cover;
          item.img.onload = () => { /* will be drawn next frame */ };
          item.img.onerror = () => { /* fallback to emoji */ };
        }
        img = item.img;
      }

      if(img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, x + 10, y + 10, cardWidth - 20, 120);
      } else {
        // Placeholder emoji
        ctx.fillStyle = '#fff';
        ctx.font = '48px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🎵', x + cardWidth/2, y + 75);
      }

      // Item name (with text wrapping for long titles)
      ctx.fillStyle = '#fff';
      ctx.font = '14px sans-serif';
      const maxWidth = cardWidth - 20;
      const words = item.title.split(' ');
      let line = '';
      let yPos = y + 145;

      for (let i = 0; i < words.length; i++) {
        const testLine = line + words[i] + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && i > 0) {
          ctx.fillText(line, x + cardWidth/2, yPos);
          line = words[i] + ' ';
          yPos += 16;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line, x + cardWidth/2, yPos);

      // Price or purchased status
      if(item.purchased) {
        ctx.fillStyle = '#00ff88';
        ctx.font = '16px sans-serif';
        ctx.fillText('Megvásárolva', x + cardWidth/2, y + 190);
      } else {
        const canAfford = totalPoints >= item.price;
        ctx.fillStyle = canAfford ? '#00ff88' : '#ff4444';
        ctx.font = '18px sans-serif';
        ctx.fillText(`${item.currency} ${item.price}`, x + cardWidth/2, y + 180);
      }

      // Buy button or purchased indicator
      const btnY = y + 195;
      if(item.purchased) {
        ctx.fillStyle = '#666';
        ctx.fillRect(x + 20, btnY, cardWidth - 40, 25);
        ctx.strokeStyle = '#888';
        ctx.strokeRect(x + 20, btnY, cardWidth - 40, 25);
        ctx.fillStyle = '#fff';
        ctx.font = '14px sans-serif';
        ctx.fillText('Megvásárolva', x + cardWidth/2, btnY + 18);
      } else {
        const btn = {
          text: 'Vásárlás',
          x: x + 20,
          y: btnY,
          w: cardWidth - 40,
          h: 25,
          action: 'buyMusic',
          item: item
        };

        const canAfford = totalPoints >= item.price;
        ctx.fillStyle = canAfford ? '#4CAF50' : '#666';
        ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
        ctx.strokeStyle = '#888';
        ctx.strokeRect(btn.x, btn.y, btn.w, btn.h);
        ctx.fillStyle = '#fff';
        ctx.font = '14px sans-serif';
        ctx.fillText(btn.text, btn.x + btn.w/2, btn.y + 18);
        uiButtons.push(btn);
      }

      x += cardWidth + 20;
      if((i + 1) % cardsPerRow === 0) {
        x = startX;
        y += cardHeight + 20;
      }
    }

    // Characters section
    y += cardHeight + 40;
    ctx.fillStyle='#fff';
    ctx.font='24px sans-serif';
    ctx.fillText('Karakterek', W/2, y);

    const characterItems = dlcCharacters.map(c => ({...c, type: 'character', currency: '💎', currencyType: 'vBucks', purchased: !c.locked}));

    y += 20;
    x = startX;

    // Draw character cards
    for(let i = 0; i < characterItems.length; i++) {
      const item = characterItems[i];

      // Card background
      ctx.fillStyle = '#2a2a3e';
      ctx.fillRect(x, y, cardWidth, cardHeight);
      ctx.strokeStyle = '#4a4a6a';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, cardWidth, cardHeight);

      // Item image (placeholder or actual image)
      ctx.fillStyle = '#444';
      ctx.fillRect(x + 10, y + 10, cardWidth - 20, 120);

      // Try to draw actual image if available
      let img = null;
      if(item.type === 'character') {
        // For characters, use existing charImgs array
        const dlcIndex = dlcCharacters.findIndex(c => c.name === item.name);
        if(dlcIndex >= 0 && charImgs && charImgs[characters.length + dlcIndex]) {
          img = charImgs[characters.length + dlcIndex];
        }
      }

      if(img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, x + 10, y + 10, cardWidth - 20, 120);
      } else {
        // Placeholder emoji
        ctx.fillStyle = '#fff';
        ctx.font = '48px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('👤', x + cardWidth/2, y + 75);
      }

      // Item name
      ctx.fillStyle = '#fff';
      ctx.font = '16px sans-serif';
      ctx.fillText(item.name, x + cardWidth/2, y + 150);

      // Price or purchased status
      if(item.purchased) {
        ctx.fillStyle = '#00ff88';
        ctx.font = '18px sans-serif';
        ctx.fillText('Megvásárolva', x + cardWidth/2, y + 180);
      } else {
        const canAfford = vBucks >= item.price;
        ctx.fillStyle = canAfford ? '#00ff88' : '#ff4444';
        ctx.font = '18px sans-serif';
        ctx.fillText(`${item.currency} ${item.price}`, x + cardWidth/2, y + 180);
      }

      // Buy button or purchased indicator
      const btnY = y + 185;
      if(item.purchased) {
        ctx.fillStyle = '#666';
        ctx.fillRect(x + 20, btnY, cardWidth - 40, 25);
        ctx.strokeStyle = '#888';
        ctx.strokeRect(x + 20, btnY, cardWidth - 40, 25);
        ctx.fillStyle = '#fff';
        ctx.font = '14px sans-serif';
        ctx.fillText('Megvásárolva', x + cardWidth/2, btnY + 18);
      } else {
        const btn = {
          text: 'Vásárlás',
          x: x + 20,
          y: btnY,
          w: cardWidth - 40,
          h: 25,
          action: 'buyCharacter',
          item: item
        };

        const canAfford = vBucks >= item.price;
        ctx.fillStyle = canAfford ? '#4CAF50' : '#666';
        ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
        ctx.strokeStyle = '#888';
        ctx.strokeRect(btn.x, btn.y, btn.w, btn.h);
        ctx.fillStyle = '#fff';
        ctx.font = '14px sans-serif';
        ctx.fillText(btn.text, btn.x + btn.w/2, btn.y + 18);
        uiButtons.push(btn);
      }

      x += cardWidth + 20;
      if((i + 1) % cardsPerRow === 0) {
        x = startX;
        y += cardHeight + 20;
      }
    }

    // Back button
    const backBtn = {
      text:'Vissza',
      x: 20,
      y: H - 60,
      w: 100,
      h: 40,
      action:'back'
    };
    ctx.fillStyle='#444';
    ctx.fillRect(backBtn.x, backBtn.y, backBtn.w, backBtn.h);
    ctx.strokeStyle='#888';
    ctx.strokeRect(backBtn.x, backBtn.y, backBtn.w, backBtn.h);
    ctx.fillStyle='#fff';
    ctx.font='16px sans-serif';
    ctx.fillText(backBtn.text, backBtn.x + backBtn.w/2, backBtn.y + 26);
    uiButtons.push(backBtn);

    ctx.textAlign='start';
  }

  function drawUpdates() {
    // Clear and draw background
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle='#7ec0ee';
    ctx.fillRect(0,0,W,H);

    // Draw semi-transparent overlay
    ctx.fillStyle='#111';
    ctx.globalAlpha=0.75;
    ctx.fillRect(40,60,W-80,H-120);
    ctx.globalAlpha=1;

    // Title
    ctx.fillStyle='#fff';
    ctx.font='28px sans-serif';
    ctx.textAlign='center';
    ctx.fillText('Frissítések', W/2, 100);

    // Update content
    ctx.font='18px sans-serif';
    ctx.fillStyle='#ffd700';
    ctx.fillText('Legújabb fejlesztések:', W/2, 150);

    ctx.font='16px sans-serif';
    ctx.fillStyle='#fff';
    let y = 180;
    const updates = [
      '• Megállító gomb hozzáadása játék közben',
      '• Ctrl+görgő zoom megakadályozása csalás ellen',
      '• fix pozicionálása minden monitoron',
      '• "Special Karakterek" szöveg animált szivárvány effekt',
      '• Kijelentkezéskor Firebase-ből törlődik a játékos előrehaladása(akinek volt fiókja annak mentésre kerül az elért eredménye),',
      '• Új felhasználók tiszta játékállapottal indulnak',
      '• Shop hozzáadása prémium zenékkel és karakterekkel',
      '• Zenei borítók előtöltése a shopban',
      '• Hosszú zenei címek szöveg tördelése',
      '• Vásárolt elemek egyértelmű jelzése a shopban',
      '• Karakter vásárlás javítása - azonnali feloldás'
    ];

    for(const update of updates) {
      ctx.fillText(update, W/2, y);
      y += 25;
    }

    // Version info
    ctx.font='14px sans-serif';
    ctx.fillStyle='#aaa';
    ctx.fillText('Verzió: 1.0.1 - 2025', W/2, H-100);

    // Back button
    const backBtn = {text:'Vissza', x:W/2-60, y:H-80, w:120, h:40, action:'back'};
    ctx.fillStyle='#444';
    ctx.fillRect(backBtn.x, backBtn.y, backBtn.w, backBtn.h);
    ctx.fillStyle='#fff';
    ctx.font='16px sans-serif';
    ctx.fillText('Vissza', W/2, backBtn.y + 25);

    // Store button for click handling
    uiButtons.length = 0;
    uiButtons.push(backBtn);

    // Reset text align for consistency
    ctx.textAlign='start';
  }



  function drawCredits() {
    // Clear and draw background
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle='#7ec0ee';
    ctx.fillRect(0,0,W,H);

    // Draw semi-transparent overlay
    ctx.fillStyle='#111';
    ctx.globalAlpha=0.75;
    ctx.fillRect(40,60,W-80,H-120);
    ctx.globalAlpha=1;

    // Title
    ctx.fillStyle='#fff';
    ctx.font='28px sans-serif';
    ctx.textAlign='center';
    ctx.fillText('Készítők', W/2, 100);

    // Development credits
    ctx.font='20px sans-serif';
    ctx.fillStyle='#ffd700'; // Arany színű főcím
    ctx.fillText('Fejlesztői Csapat', W/2, 150);

    ctx.font='16px sans-serif';
    ctx.fillStyle='#fff';
    ctx.fillText('Julio és Ákos', W/2, 180);
    ctx.fillText('Grafikai Tervezés: Az Osztály Művészei', W/2, 210);
    ctx.fillText('Játékmenet Tervezés: Julio és Ákos', W/2, 240);

    // Special thanks
    ctx.fillStyle='#ffd700';
    ctx.font='20px sans-serif';
    ctx.fillText('Külön Köszönet', W/2, 290);

    ctx.fillStyle='#fff';
    ctx.font='16px sans-serif';
    ctx.fillText('A tesztelésben résztvevő diákoknak', W/2, 350);
    ctx.fillText('Tanárainknak a támogatásért és hogy ilyen jó képek születtek róluk <3', W/2, 380);

    // Version info
    ctx.font='14px sans-serif';
    ctx.fillStyle='#aaa';
    ctx.fillText('Verzió: 1.0.1 - 2025', W/2, H-100);

    // Back button
    const backBtn = {text:'Vissza', x:W/2-60, y:H-80, w:120, h:40, action:'back'};
    ctx.fillStyle='#444';
    ctx.fillRect(backBtn.x, backBtn.y, backBtn.w, backBtn.h);
    ctx.fillStyle='#fff';
    ctx.font='16px sans-serif';
    ctx.fillText('Vissza', W/2, backBtn.y + 25);

    // Store button for click handling
    uiButtons.length = 0;
    uiButtons.push(backBtn);

    // Reset text align for consistency
    ctx.textAlign='start';
  }



  // Draw character selection grid using images when available
  function drawCharSelect(){
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle='#7ec0ee';
    ctx.fillRect(0,0,W,H);
    ctx.fillStyle='#111';
    ctx.globalAlpha=0.75;
    ctx.fillRect(30,40,W-60,H-80);
    ctx.globalAlpha=1;
    ctx.fillStyle='#fff';
    ctx.font='22px sans-serif';
    ctx.textAlign='center';
    ctx.fillText('Válassz karaktert', W/2,78);

    // Show currency
    ctx.font='18px sans-serif';
    ctx.fillText(`🪙 ${totalPoints} pont    💎 ${vBucks} V-Buck`, W/2, 100);



    // Fixed grid layout for consistent appearance across monitors
    const cols = 7;
    const padding = 25;
    const thumbSize = 100;
    const startX = (W - (cols * thumbSize + (cols - 1) * padding)) / 2;
    const startY = 130;

    uiButtons.length = 0;

    // Draw regular characters
    let x = startX, y = startY;
    for(let i=0; i<characters.length; i++){
      const col = (i)%cols;
      const row = Math.floor((i)/cols);
      x = startX + col*(thumbSize+padding);
      y = startY + row*(thumbSize+padding);

      // draw slot
      ctx.fillStyle='#222';
      ctx.fillRect(x,y,thumbSize,thumbSize);
      ctx.strokeStyle='#666';
      ctx.strokeRect(x,y,thumbSize,thumbSize);

      // draw image if loaded
      const img = charImgs[i];
      if(img && img.complete){
        ctx.drawImage(img, x, y, thumbSize, thumbSize);
      } else {
        ctx.fillStyle='#888';
        ctx.font='14px sans-serif';
        ctx.fillText(characters[i].name, x+8, y+44);
      }

      // draw name
      const name = characters[i].name;
      ctx.fillStyle='#fff';
      ctx.font='14px sans-serif';
      ctx.textAlign='center';
      const nameX = x + thumbSize/2;
      const nameY = y + thumbSize + 20;
      ctx.fillText(name, nameX, nameY);

      uiButtons.push({
        action:'pick',
        index:i,
        x:x,
        y:y,
        w:thumbSize,
        h:thumbSize + 24,
        locked: false
      });
    }

    // Draw DLC characters at the bottom with lock icon if locked
    y += thumbSize + padding * 2;
    ctx.font='20px sans-serif';

    // Animated rainbow effect for "Special Karakterek"
    const text = 'Special Karakterek';
    const time = Date.now() * 0.02; // Faster animation speed for smooth flow
    let xPos = W/2 - ctx.measureText(text).width / 2;
    for (let i = 0; i < text.length; i++) {
      const hue = (time + i * 15) % 360; // Closer color spacing for smoother flow
      ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
      ctx.fillText(text[i], xPos, y);
      xPos += ctx.measureText(text[i]).width;
    }

    y += padding;

    for(let i=0; i<dlcCharacters.length; i++) {
      const char = dlcCharacters[i];
      x = startX + i*(thumbSize+padding);

      ctx.fillStyle='#333';
      ctx.fillRect(x, y, thumbSize, thumbSize);
      ctx.strokeStyle = char.locked ? '#f00' : '#0f0';
      ctx.strokeRect(x, y, thumbSize, thumbSize);

      if(char.locked) {
        ctx.fillStyle='#fff';
        ctx.font='32px sans-serif';
        ctx.fillText('🔒', x + thumbSize/2, y + thumbSize/2);
        ctx.font='14px sans-serif';
        ctx.fillText(`${char.price} 💎`, x + thumbSize/2, y + thumbSize/2 + 24);
      } else {
        if(charImgs[characters.length + i] && charImgs[characters.length + i].complete) {
          ctx.drawImage(charImgs[characters.length + i], x, y, thumbSize, thumbSize);
        } else {
          ctx.fillStyle='#888';
          ctx.font='14px sans-serif';
          ctx.fillText(char.name, x+8, y+44);
        }
      }

      ctx.fillStyle='#fff';
      ctx.font='14px sans-serif';
      ctx.fillText(char.name, x + thumbSize/2, y + thumbSize + 20);

      if(!char.locked) {
        uiButtons.push({
          action:'pick',
          index: characters.length + i,
          x:x,
          y:y,
          w:thumbSize,
          h:thumbSize + 24,
          locked: false
        });
      }
    }

    // Add back button at the bottom
    ctx.textAlign='center';
    const backBtn = {
      text:'Vissza',
      x:W/2-60,
      y:H-50,
      w:120,
      h:40,
      action:'back'
    };
    ctx.fillStyle='#444';
    ctx.fillRect(backBtn.x, backBtn.y, backBtn.w, backBtn.h);
    ctx.strokeStyle='#888';
    ctx.strokeRect(backBtn.x, backBtn.y, backBtn.w, backBtn.h);
    ctx.fillStyle='#fff';
    ctx.font='18px sans-serif';
    ctx.fillText(backBtn.text, backBtn.x + backBtn.w/2, backBtn.y + 26);
    uiButtons.push(backBtn);

    ctx.textAlign='start';
  }

  // Canvas mouse handling
  canvas.addEventListener('click', (ev) => {
    const rect = canvas.getBoundingClientRect(); 
    const mx = ev.clientX - rect.left; 
    const my = ev.clientY - rect.top;
    
    // check UI buttons/hitboxes
    for(const b of uiButtons){ 
      if(mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h){ 
        handleUIButton(b, mx, my); 
        return; 
      } 
    }
    

  });

  function handleUIButton(b, mx, my){ 
    if(scene==='menu'){ 
      if(b.action==='start'){ 
        // Require login before starting. If not logged in, show auth overlay.
        try{
          const isLogged = localStorage.getItem('isLoggedIn');
          if(isLogged !== 'true'){
            showAuthOverlay();
            return;
          }
        }catch(e){ showAuthOverlay(); return; }

        scene='charSelect';
        drawCharSelect();
      } else if(b.action==='leaderboard'){
        drawLeaderboard();
      } else if(b.action==='shop'){
        scene='shop';
        drawShop();
      } else if(b.action==='updates'){
        scene='updates';
        drawUpdates();
      } else if(b.action==='credits'){
        scene='credits';
        drawCredits();
      }
    }
    else if(scene==='leaderboard'){
      if(b.action==='back'){
        scene='menu';
        drawMenu();
      }
    }
    else if(scene==='shop'){ 
      if(b.action==='back'){ 
        scene='menu'; 
        drawMenu(); 
      } else if(b.action==='buyMusic') {
        const music = b.item;
        if(totalPoints >= music.price) {
          totalPoints -= music.price;
          unlockedMusic.push(music.src);
          musicList = [...baseMusicList, ...premiumMusicList.filter(m => unlockedMusic.includes(m.src))];
          saveProgress();
          startPurchaseAnimation(music.title);
          drawShop();
        }
      } else if(b.action==='buyCharacter') {
        const char = b.item;
        if(vBucks >= char.price) {
          vBucks -= char.price;
          // Find and unlock the original character in dlcCharacters array
          const dlcIndex = dlcCharacters.findIndex(c => c.name === char.name);
          if(dlcIndex >= 0) {
            dlcCharacters[dlcIndex].locked = false;
          }
          saveProgress();
          startPurchaseAnimation(char.name);
          drawShop();
        }
      }
    }
    else if(scene==='updates'){
      if(b.action==='back'){
        scene='menu';
        drawMenu();
      }
    }
    else if(scene==='credits'){
      if(b.action==='back'){
        scene='menu';
        drawMenu();
      }
    }
    else if(scene==='charSelect'){
      if(b.action==='pick' && !b.locked){
        startGame(b.index);
      } else if(b.action==='back'){
        scene='menu';
        drawMenu();
      }
    }
  }

  // Prevent scrolling with Ctrl+wheel
  window.addEventListener('wheel', e => {
    if (e.ctrlKey) {
      e.preventDefault();
    }
  }, { passive: false });

  // Keyboard input - always update flags on key events, but we'll reset them on scene changes
  window.addEventListener('keydown', e=>{
    if(e.key==='ArrowLeft'||e.key==='a') input.left=true;
    if(e.key==='ArrowRight'||e.key==='d') input.right=true;
    if(e.key==='ArrowUp'||e.key==='w') input.up=true;
    if(e.key==='ArrowDown'||e.key==='s') input.down=true;
  });
  window.addEventListener('keyup', e=>{
    if(e.key==='ArrowLeft'||e.key==='a') input.left=false;
    if(e.key==='ArrowRight'||e.key==='d') input.right=false;
    if(e.key==='ArrowUp'||e.key==='w') input.up=false;
    if(e.key==='ArrowDown'||e.key==='s') input.down=false;
  });

  // Start the game state with a selected character index
  function startGame(selectedIdx){
    // reset input to avoid carrying over held keys
    input = {left:false,right:false,up:false,down:false};
    scene='playing';
    
    // Check if it's a DLC character
    if(selectedIdx >= characters.length) {
      const dlcIndex = selectedIdx - characters.length;
      if(dlcIndex < dlcCharacters.length && !dlcCharacters[dlcIndex].locked) {
        player = new Player(W/2, H-80, selectedIdx);
      } else {
        scene = 'charSelect';
        drawCharSelect();
        return;
      }
    } else {
      player = new Player(W/2, H-80, selectedIdx);
    }
    
    npcs=[]; 
    score=0; 
    level=1; 
    loadSounds(); 
    spawnNpcsForLevel(level, selectedIdx); 
    lastTime = performance.now(); 
    requestAnimationFrame(loop);
  }

 function loadSounds(){ try{ catchSound = loadAudio('assets/sounds/catch.mp3'); }catch(e){ catchSound=null; } }
  function spawnNpcsForLevel(l, selectedIdx){ 
    const lanes = 5; 
    // Do not use the bottom-most lane for NPCs to avoid immediate collisions when changing levels
    const usableLanes = Math.max(1, lanes-1);
    const laneH = (H-120)/lanes; 
    npcs = []; 
    const pool=[]; 
    for(let i=0;i<characters.length;i++) if(i!==selectedIdx) pool.push(i); 
    
    // Spawn NPCs in lanes
    for(let lane=0;lane<usableLanes;lane++){ 
      const y = 60 + lane*laneH + (laneH-60)/2; 
      const dir = (lane%2===0)?1:-1; 
      const count = 4 + Math.min(level,3); 
      for(let j=0;j<count;j++){ 
        const idx = pool[Math.floor(Math.random() * pool.length)]; 
        const speed = 80 + Math.random()*120 + level*10; 
        const x = Math.random()*W; 
        npcs.push(new NPC(x,y,60,60,speed,dir,idx)); 
      } 
    }

    // Spawn V-Buck for this level
    const randomLane = Math.floor(Math.random() * usableLanes);
    const vbuckY = 60 + randomLane*laneH + (laneH-30)/2;
    const vbuckX = Math.random() * (W-30);
    vbuck = {
      x: vbuckX,
      y: vbuckY,
      w: 30,
      h: 30,
      collected: false
    };
  }
  // main loop when playing (boss and projectiles removed)
  function loop(ts){
    if (paused) {
      return;
    }

    const dt = (ts-lastTime)/1000;
    lastTime = ts;
    if(scene!=='playing') return;

    player.update(dt,input);
    for(const n of npcs) n.update(dt);

    for(const n of npcs){
      if(collide(player.rect(), n.rect())){
        if(catchSound){
          catchSound.volume=AUDIO_VOL;
          catchSound.play().catch(()=>{});
        }
        totalPoints += Math.floor(score/2); // Add half the score as points when game ends
        endRound(false);
        return;
      }
    }

    // Check for V-Buck collection
    if(vbuck && !vbuck.collected) {
      if(collide(player.rect(), vbuck)) {
        vbuck.collected = true;
        vBucks += 1; // Only add V-Buck when collected
        saveProgress();
      }
    }

    // Level complete
    if(player.y <= 60){
      score += 1000;
      totalPoints += 1000; // Add points for completing a level
      saveProgress();
      level += 1;
      spawnNpcsForLevel(level, player.idx);
      player.x = W/2;
      player.y = H-80;
      // Show level completion message
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(W/2-150, H/2-40, 300, 80);
      ctx.fillStyle = '#fff';
      ctx.font = '24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${level-1}. szint teljesítve!`, W/2, H/2);
    }

    drawGame();
    requestAnimationFrame(loop);
  }
  async function endRound(success){
    // submit final score to leaderboard if player is known
    try{
      const pn = localStorage.getItem('playerName');
      if(pn){
        // highest completed level is level-1 (if level increments after completion)
        const completedLevel = Math.max(0, (typeof level === 'number') ? (level-1) : 0);
        await submitScoreToFirestore(pn, completedLevel, totalPoints);
      }
    }catch(e){ console.error('Error submitting final score', e); }

    // reset input so restarting doesn't immediately move the player
    input = {left:false,right:false,up:false,down:false};
    scene='menu'; player=null; npcs=[]; score = 0; drawMenu();
  }
  function drawGame(){
    ctx.clearRect(0,0,W,H);
    // default blue background
    ctx.fillStyle='#7ec0ee'; ctx.fillRect(0,0,W,H);
    // Road area with safe zones at top and bottom
    ctx.fillStyle='#444'; ctx.fillRect(0,60,W,H-140);
    ctx.strokeStyle='rgba(255,255,255,0.12)'; ctx.lineWidth=2;
    for(let y=60+40;y<H-60;y+=60){ ctx.beginPath(); for(let x=0;x<W;x+=30){ ctx.moveTo(x,y); ctx.lineTo(x+15,y); } ctx.stroke(); }
    // Draw NPCs and player
    for(const n of npcs) n.draw(ctx);
    if(player) player.draw(ctx);

    // Draw V-Buck if not collected
    if(vbuck && !vbuck.collected) {
      if(vbuckImg && vbuckImg.complete) {
        ctx.drawImage(vbuckImg, vbuck.x, vbuck.y, vbuck.w, vbuck.h);
      } else {
        // Fallback if image not loaded
        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        ctx.arc(vbuck.x + vbuck.w/2, vbuck.y + vbuck.h/2, vbuck.w/2, 0, Math.PI*2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('V', vbuck.x + vbuck.w/2, vbuck.y + vbuck.h/2 + 6);
      }
    }

    // Draw score overlay
    ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(8,8,260,36);
    ctx.fillStyle='#fff'; ctx.font='14px sans-serif'; ctx.textAlign='left'; 
    ctx.fillText(`Pontszám: ${score}    Szint: ${level}    💎 ${vBucks}`,16,32);
    // show player name if available
    try{
      const pn = localStorage.getItem('playerName');
      if(pn){ ctx.fillStyle='#fff'; ctx.font='12px sans-serif'; ctx.textAlign='right'; ctx.fillText(pn, W-16, 20); ctx.textAlign='left'; }
    }catch(e){}
  }
  // Define initial loop function before it's used
  let _originalLoop = null;

  // initial draw (ensure canvas sized first)
  resizeCanvas();
  drawMenu();
  
  // expose debug helper
  window.__startGameDebug = startGame;

  // Wire auth overlay controls
  (function wireAuthUI(){
    // safe-guard if elements missing
    try{
      // Ensure Firebase is initialized and listen for auth state changes so we can load per-account progress
      (async function(){
        try{
          await initFirebaseIfNeeded();
          if(auth){
            const { onAuthStateChanged } = await import('https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js');
            onAuthStateChanged(auth, async (user)=>{
              try{
                if(user){
                  localStorage.setItem('isLoggedIn','true');
                  localStorage.setItem('playerName', user.displayName || user.email || '');
                  await loadProgressForUser(user.uid);
                  hideAuthOverlay();
                  drawMenu();
                } else {
                  localStorage.removeItem('isLoggedIn');
                  showAuthOverlay();
                }
              }catch(e){ console.warn('onAuthStateChanged handler error', e); }
            });
          }
        }catch(e){ /* ignore init errors here */ }
      })();

      const showReg = document.getElementById('show-register');
      const showLog = document.getElementById('show-login');
      const loginForm = document.getElementById('login-form');
      const registerForm = document.getElementById('register-form');
  const loginBtn = document.getElementById('login-btn');
  const regBtn = document.getElementById('reg-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const overlay = document.getElementById('auth-overlay');

      if(showReg) showReg.addEventListener('click', (e)=>{ e.preventDefault(); if(loginForm) loginForm.style.display='none'; if(registerForm) registerForm.style.display='flex'; document.getElementById('auth-title').textContent='Regisztráció'; setAuthMessage(''); });
      if(showLog) showLog.addEventListener('click', (e)=>{ e.preventDefault(); if(loginForm) loginForm.style.display='flex'; if(registerForm) registerForm.style.display='none'; document.getElementById('auth-title').textContent='Belépés'; setAuthMessage(''); });

      if(loginBtn) loginBtn.addEventListener('click', ()=>{
        const username = document.getElementById('login-username').value.trim();
        const pass = document.getElementById('login-pass').value;
        if(!username || !pass){ setAuthMessage('Töltsd ki a felhasználónevet és jelszót.'); return; }
        setAuthMessage('Bejelentkezés...','');
        doLogin(username, pass);
      });

      if(regBtn) regBtn.addEventListener('click', ()=>{
        const name = document.getElementById('reg-name').value.trim();
        const pass = document.getElementById('reg-pass').value;
        if(!name || !pass){ setAuthMessage('Töltsd ki a mezőket.'); return; }
        setAuthMessage('Regisztráció...','');
        doRegister(name, pass);
      });

      // Wire logout button (DOM button was added to index.html). Initially hidden unless logged in.
      if(logoutBtn){
        try{ logoutBtn.style.display = (localStorage.getItem('isLoggedIn') === 'true') ? 'block' : 'none'; }catch(e){}
        logoutBtn.addEventListener('click', async ()=>{
          try{
            // Get current user before signing out
            const currentUser = auth ? auth.currentUser : null;
            if(auth){ const { signOut } = await import('https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js'); await signOut(auth); }

            // Clear user's progress from Firebase after logout
            if(currentUser && db){
              const { deleteDoc, doc } = await import('https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js');
              try{
                await deleteDoc(doc(db, 'progress', currentUser.uid));
                console.log('User progress cleared from Firebase');
              }catch(e){
                console.warn('Failed to clear progress from Firebase:', e);
              }
            }
          }catch(e){ console.warn('SignOut failed', e); }
          try{
            localStorage.removeItem('isLoggedIn');
            localStorage.removeItem('playerName');
          }catch(e){}
          // hide logout button and show auth overlay
          try{ logoutBtn.style.display='none'; }catch(e){}
          showAuthOverlay(); drawMenu();
        });
      }

      // Also watch auth state to toggle logout button visibility
      (async function(){
        try{
          await initFirebaseIfNeeded();
          if(auth){ const { onAuthStateChanged } = await import('https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js'); onAuthStateChanged(auth, (user)=>{ try{ if(logoutBtn) logoutBtn.style.display = user ? 'block' : 'none'; }catch(e){} }); }
        }catch(e){ /* ignore */ }
      })();

      // Show overlay if user not logged in
      try{
        const isLogged = localStorage.getItem('isLoggedIn');
        if(isLogged !== 'true'){
          showAuthOverlay();
        } else {
          hideAuthOverlay();
        }
      }catch(e){ showAuthOverlay(); }
    }catch(e){ /* ignore if DOM not present */ }
  })();
})();