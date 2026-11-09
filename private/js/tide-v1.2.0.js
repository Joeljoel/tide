(() => {
  'use strict';
  window.__TIDE_BUILD__ = '1.2.0';
  const themePreference = (()=>{try{return localStorage.getItem('tide_appearance')||'dark';}catch{return 'dark';}})();
  const systemAppearance=window.matchMedia?.('(prefers-color-scheme: light)');
  function setAppearance(value){
    const preference=['system','dark','light'].includes(value)?value:'system';
    const light=preference==='light'||(preference==='system'&&!!systemAppearance?.matches);
    document.documentElement.dataset.tideTheme=light?'light':'dark';
    document.documentElement.style.colorScheme=light?'light':'dark';
    const themeMeta=document.querySelector('meta[name="theme-color"]');
    if(themeMeta)themeMeta.content=light?'#e8eff3':'#111722';
    try{localStorage.setItem('tide_appearance',preference);}catch{}
    return preference;
  }
  let appearance=setAppearance(themePreference);
  systemAppearance?.addEventListener?.('change',()=>{if(appearance==='system')setAppearance('system');});
  // iPhone Duo Split View: the successful display lab established that
  // both halves are portrait-shaped (~469 x 669 CSS px) while the physical
  // device reports landscape. Left reports safe L/R = 0/0, right = 0/~84.
  // screenX reports 0 on both, so it cannot determine window position.
  const splitSafeProbe=document.getElementById('tideSplitSafeProbe');
  let splitProbePhase=false;
  let lastSplitSide=null;
  function classifyDuoSplitSide(m){
    const candidate=m.iphone && !m.desktop && m.width>=350 && m.width<=540
      && m.height>m.width && m.landscapeReported;
    if(!candidate)return null;
    if(m.safeLeft<=10 && m.safeRight>=35)return 'right';
    if(m.safeLeft<=10 && m.safeRight<=10)return 'left';
    return null; // Unrecognised insets: retain Tide's default right rail.
  }
  function detectDuoSplitSide(){
    const landscapeReported=/^landscape/i.test(screen.orientation?.type||'')
      || (typeof window.orientation==='number' && Math.abs(window.orientation)===90);
    const width=window.innerWidth,height=window.innerHeight;
    const fine=window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;
    // Avoid style measurements outside plausible Duo Split View windows.
    if(!splitSafeProbe || !/iPhone/i.test(navigator.userAgent) || fine
      || width<350 || width>540 || height<=width || !landscapeReported)return null;
    // Side changes do not necessarily emit a resize event on iOS. Toggle
    // equivalent env() declarations before reading computed insets.
    splitProbePhase=!splitProbePhase;
    const insetStyle=edge=>splitProbePhase
      ? 'env(safe-area-inset-'+edge+',0px)'
      : 'calc(env(safe-area-inset-'+edge+',0px) + 0px)';
    splitSafeProbe.style.paddingLeft=insetStyle('left');
    splitSafeProbe.style.paddingRight=insetStyle('right');
    const computed=getComputedStyle(splitSafeProbe);
    const safeLeft=parseFloat(computed.paddingLeft);
    const safeRight=parseFloat(computed.paddingRight);
    if(!Number.isFinite(safeLeft)||!Number.isFinite(safeRight))return null;
    return classifyDuoSplitSide({
      iphone:true,desktop:false,width,height,landscapeReported,safeLeft,safeRight
    });
  }
  function syncDuoSplitPlacement(){
    const side=detectDuoSplitSide();
    if(side===lastSplitSide)return;
    lastSplitSide=side;
    document.body.classList.toggle('tide-split-left',side==='left');
    document.body.classList.toggle('tide-split-right',side==='right');
    document.body.dataset.tideSplitSide=side||'unknown';
  }
  // Input capabilities determine the desktop mode; width alone cannot distinguish
  // an unfolded Duo from a laptop. Folded and unfolded landscape retain the rail.
  // Unfolded portrait gets a floating bottom control group.
  const syncDeviceGeometry = () => {
    const standalone=window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone===true;
    const fine=window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;
    const portrait=window.innerHeight>window.innerWidth;
    const desktop=Boolean(fine && window.innerWidth>=600);
    const duoPortrait=Boolean(!desktop && portrait && window.innerWidth>=600);
    const duoLandscape=Boolean(!desktop && !portrait && window.innerWidth>=850);
    document.body.classList.toggle('tide-desktop',desktop);
    document.body.classList.toggle('tide-duo-portrait',duoPortrait);
    document.body.classList.toggle('tide-duo-landscape',duoLandscape);
    const controls=document.querySelector('.controls');
    const slot=document.getElementById('landscapeControlsSlot');
    const home=document.getElementById('controlsHome');
    if(controls && slot && home){
      if((duoLandscape || desktop) && controls.parentElement!==slot)slot.appendChild(controls);
      else if(!(duoLandscape || desktop) && controls.parentElement===slot)home.after(controls);
    }
    document.body.classList.toggle('duo-standalone',!!standalone);
    const editing=document.activeElement?.matches?.('input,textarea,[contenteditable=true]');
    // Some versions of WebKit expose screen and web viewport dimensions that
    // differ by an OS-reserved strip. Do not require screen.width to equal the
    // viewport width: foldables can report physical/outer-screen dimensions.
    const vv=window.visualViewport;
    const candidates=[window.innerHeight,window.outerHeight,screen.height,screen.availHeight,
      vv ? vv.height+vv.offsetTop : 0].map(Number).filter(Number.isFinite);
    const plausible=candidates.filter(h=>h>=window.innerHeight && h<=window.innerHeight+190);
    const fullHeight=Math.max(window.innerHeight,...plausible);
    const allowed=standalone && !desktop && duoPortrait && !editing && (!vv || Math.abs(vv.scale-1)<.01);
    // The host may reserve a physical strip outside WebKit's layout viewport.
    // Stretch only when a second browser-provided metric confirms the extra space.
    // Never guess based on a hardcoded Duo screen size, since folding changes it.
    const gap=allowed?Math.round(fullHeight-window.innerHeight):0;
    document.documentElement.style.setProperty('--pwa-bottom-gap',(allowed&&gap<1?82:gap)+'px');
    const rootHeight=document.documentElement.getBoundingClientRect().height;
    const bodyHeight=document.body.getBoundingClientRect().height;
    const cssCandidate=Math.max(rootHeight,bodyHeight,window.innerHeight,document.documentElement.clientHeight);
    // Large viewport units occasionally exceed dynamic ones during a PWA pose transition.
    const lvProbe=document.getElementById('tideLargeViewportProbe');
    const largeViewport=lvProbe?.getBoundingClientRect().height||0;
    const portraitHeaderTrial=allowed&&fullHeight<=window.innerHeight+1?82:0;
    const shellHeight=allowed?Math.max(cssCandidate,fullHeight,largeViewport,window.innerHeight+portraitHeaderTrial):cssCandidate;
    document.documentElement.style.setProperty('--tide-shell-height',Math.round(shellHeight)+'px');
    // Keep keyboard calculations separate from the physical-screen gap.
    const covered=vv && vv.scale===1 ? Math.max(0,window.innerHeight-(vv.height+vv.offsetTop)) : 0;
    const keyboard=editing && covered>115 ? Math.round(covered) : 0;
    document.documentElement.style.setProperty('--keyboard-lift',keyboard+'px');
    const searchingWithKeyboard=!desktop && document.body.classList.contains('tide-search-open')
      && document.activeElement?.id==='searchInput' && keyboard>0;
    // VisualViewport gives the obscured portion without shrinking the torrent pane.
    document.documentElement.style.setProperty('--tide-search-keyboard-space',
      (searchingWithKeyboard?keyboard+16:0)+'px');
    const diagnostics=document.getElementById('viewportDiagnostics');
    if(diagnostics){
      diagnostics.hidden=new URLSearchParams(location.search).get('viewport')!=='1';
      if(!diagnostics.hidden) diagnostics.textContent=`Tide viewport · ${desktop?'desktop':duoPortrait?'Duo portrait':'rail'}\nscreen ${screen.width}×${screen.height} · avail ${screen.availHeight} · outer ${outerHeight}\ninner ${innerWidth}×${innerHeight} · doc ${document.documentElement.clientHeight}\nvisual ${Math.round(vv?.width||0)}×${Math.round(vv?.height||0)} + ${Math.round(vv?.offsetTop||0)}\nstandalone ${standalone} · gap ${gap} · root ${Math.round(rootHeight)} · body ${Math.round(bodyHeight)} · large ${Math.round(largeViewport)} · trial ${portraitHeaderTrial} · shell ${Math.round(document.getElementById('app')?.getBoundingClientRect().height||0)}`;
    }
    syncDuoSplitPlacement();
  };
  window.addEventListener('resize',syncDeviceGeometry,{passive:true});
  window.addEventListener('orientationchange',syncDeviceGeometry,{passive:true});
  window.visualViewport?.addEventListener('scroll',syncDeviceGeometry,{passive:true});
  window.visualViewport?.addEventListener('resize',syncDeviceGeometry,{passive:true});
  window.matchMedia?.('(hover: hover) and (pointer: fine)')?.addEventListener?.('change',syncDeviceGeometry);
  window.addEventListener('pageshow',syncDeviceGeometry,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncDeviceGeometry();});
  syncDeviceGeometry();
  // Split View can move between halves with unchanged viewport dimensions.
  // Re-read the safe area only while the page is visible; the normal
  // orientation/resize listeners above also update the placement.
  setInterval(()=>{if(!document.hidden)syncDuoSplitPlacement();},400);
  window.addEventListener('focus',syncDuoSplitPlacement,{passive:true});
  const $ = (selector, root=document) => root.querySelector(selector);
  const demo = location.protocol === 'file:' || new URLSearchParams(location.search).get('demo') === '1';
  const readPref = (key, fallback) => { try { return localStorage.getItem('tide_' + key) || fallback; } catch { return fallback; } };
  const savePref = (key, value) => { try { localStorage.setItem('tide_' + key, value); } catch {} };
  const state = {
    torrents: [], filter: readPref('filter', 'all'), sort: readPref('sort','eta'), descending: readPref('descending', 'false') === 'true',
    settingsTab:'tide', search: '', searchOpen: false, selected: null, selection: new Set(), detailOpen: false, files: [], collapsedFolders: new Set(), version: 5, modal: '', busy: false, error: null, lastUpdate: null
  };
  // Search uses the normal torrent workspace. Its floating controls sit above
  // the results and keep their position when the software keyboard appears.
  const mobileSearchInput=document.getElementById('searchInput');
  const searchWrap=document.getElementById('searchWrap');
  const mobileRail=document.getElementById('actionRail');
  const prefersReducedMotion=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let searchTransition=null;
  let searchTransitionId=0;

  function setMobileSearchTop(){
    // The search row occupies the header area, above the Duo's status controls.
    document.documentElement.style.setProperty('--tide-search-top',
      'max(16px, calc(env(safe-area-inset-top, 0px) + 8px))');
  }
  mobileSearchInput.addEventListener('focus',syncDeviceGeometry);
  mobileSearchInput.addEventListener('blur',syncDeviceGeometry);
  window.addEventListener('orientationchange',()=>{if(state.searchOpen)setMobileSearchTop();},{passive:true});
  window.addEventListener('resize',()=>{
    if(state.searchOpen && document.activeElement!==mobileSearchInput)setMobileSearchTop();
  },{passive:true});

  function animateSearchControl(from,to,opening){
    if(prefersReducedMotion() || !from || !to)return Promise.resolve();
    const ghost=document.createElement('div');
    ghost.className='tide-search-morph';
    ghost.setAttribute('aria-hidden','true');
    ghost.style.cssText=`left:${from.left}px;top:${from.top}px;width:${from.width}px;height:${from.height}px`;
    ghost.innerHTML='<span class="tide-morph-search">'+icons.search+'</span><span class="tide-morph-close">'+icons.close+'</span>';
    document.body.appendChild(ghost);
    const dx=to.left-from.left,dy=to.top-from.top;
    const duration=430;
    const movement=ghost.animate([
      {transform:'translate3d(0,0,0) scale(1)',offset:0},
      {transform:`translate3d(${dx*1.012}px,${dy*1.012}px,0) scale(1.095)`,offset:.83},
      {transform:`translate3d(${dx}px,${dy}px,0) scale(1)`,offset:1}
    ],{duration,easing:'cubic-bezier(.22,1,.36,1)',fill:'forwards'});
    ghost.querySelector('.tide-morph-search').animate([
      {opacity:opening?1:0,transform:opening?'rotate(0deg) scale(1)':'rotate(-35deg) scale(.6)'},
      {opacity:opening?0:1,transform:opening?'rotate(35deg) scale(.6)':'rotate(0deg) scale(1)'}
    ],{duration:240,delay:opening?140:90,fill:'forwards',easing:'ease-in-out'});
    ghost.querySelector('.tide-morph-close').animate([
      {opacity:opening?0:1,transform:opening?'rotate(-30deg) scale(.65)':'rotate(0deg) scale(1)'},
      {opacity:opening?1:0,transform:opening?'rotate(0deg) scale(1)':'rotate(30deg) scale(.65)'}
    ],{duration:240,delay:opening?140:90,fill:'forwards',easing:'ease-in-out'});
    const result=movement.finished.catch(()=>{}).then(()=>{ghost.remove();});
    searchTransition={ghost,movement};
    return result;
  }
  function animateSearchCapsule(opening){
    if(prefersReducedMotion())return;
    searchWrap.animate(opening?[
      {opacity:0,clipPath:'inset(0 0 0 98% round 999px)',transform:'translateX(20px) scale(.94)'},
      {opacity:1,clipPath:'inset(0 0 0 0 round 999px)',transform:'translateX(0) scale(1)'}
    ]:[
      {opacity:1,clipPath:'inset(0 0 0 0 round 999px)',transform:'translateX(0) scale(1)'},
      {opacity:0,clipPath:'inset(0 0 0 98% round 999px)',transform:'translateX(20px) scale(.94)'}
    ],{duration:opening?450:350,delay:opening?55:0,easing:'cubic-bezier(.22,1,.36,1)',fill:'none'});
  }
  async function openMobileSearch(source){
    if(state.searchOpen || searchTransitionId && document.body.classList.contains('tide-search-morphing'))return;
    const id=++searchTransitionId;
    const from=source?.getBoundingClientRect();
    state.searchOpen=true;
    document.body.classList.add('tide-search-open','tide-search-morphing');
    searchWrap.hidden=false;
    setMobileSearchTop();
    renderRail();
    const close=document.querySelector('[data-action="clear-search"]');
    const to=close?.getBoundingClientRect();
    animateSearchCapsule(true);
    const travel=animateSearchControl(from,to,true);
    // Focus during the original tap so iOS opens its keyboard without a second tap.
    // The field is already positioned in the header before focus is requested.
    mobileSearchInput.focus({preventScroll:true});
    syncDeviceGeometry();
    await travel;
    if(searchTransitionId!==id || !state.searchOpen)return;
    document.body.classList.remove('tide-search-morphing');
  }
  async function closeMobileSearch(){
    if(!state.searchOpen)return;
    const id=++searchTransitionId;
    const oldClose=document.querySelector('[data-action="clear-search"]');
    const from=oldClose?.getBoundingClientRect();
    mobileSearchInput.blur();
    document.body.classList.add('tide-search-morphing','tide-search-closing');
    state.searchOpen=false;
    renderRail();
    const to=document.querySelector('[data-action="search"]')?.getBoundingClientRect();
    animateSearchCapsule(false);
    await animateSearchControl(from,to,false);
    if(searchTransitionId!==id)return;
    searchWrap.hidden=true;
    document.body.classList.remove('tide-search-open','tide-search-morphing','tide-search-closing');
    state.search='';mobileSearchInput.value='';
    render();
  }
  function exitMobileSearch(){
    ++searchTransitionId;
    searchTransition?.movement.cancel();searchTransition?.ghost.remove();
    searchWrap.hidden=true;
    mobileSearchInput.blur();
    document.body.classList.remove('tide-search-open','tide-search-morphing','tide-search-closing');
    state.searchOpen=false;
  }
  const allowedFilters = ['all','downloading','stalled','completed','paused','seeding'];
  const allowedSorts = ['eta','availability','dlspeed','progress','size','name','state'];
  if (!allowedFilters.includes(state.filter)) state.filter = 'all';
  if (!allowedSorts.includes(state.sort)) state.sort = 'eta';
  const mock = [
    {hash:'demo-ubuntu',name:'Ubuntu LTS Desktop ISO (amd64).iso',size:5.9*1024**3,progress:.68,dlspeed:7.7*1024**2,upspeed:.23*1024**2,eta:1038,availability:12.4,state:'downloading',num_seeds:26,num_leechs:8,ratio:.05,save_path:'/downloads/linux-isos'},
    {hash:'demo-fedora',name:'Fedora Workstation Live ISO (x86_64).iso',size:2.8*1024**3,progress:.41,dlspeed:5.2*1024**2,upspeed:.14*1024**2,eta:1956,availability:8.7,state:'downloading',num_seeds:17,num_leechs:12,ratio:.03,save_path:'/downloads/linux-isos'},
    {hash:'demo-debian',name:'Debian Stable Netinst ISO (amd64).iso',size:678*1024**2,progress:1,dlspeed:0,upspeed:.65*1024**2,eta:8640000,availability:23.0,state:'uploading',num_seeds:31,num_leechs:3,ratio:2.14,save_path:'/downloads/linux-isos'},
    {hash:'demo-night',name:'Night of the Living Dead (1968) — Public Domain.mp4',size:2.6*1024**3,progress:.87,dlspeed:3.5*1024**2,upspeed:0,eta:234,availability:3.25,state:'downloading',num_seeds:9,num_leechs:4,ratio:.12,save_path:'/downloads/public-domain-films'},
    {hash:'demo-moon',name:'A Trip to the Moon (1902) — Public Domain.mp4',size:1.32*1024**3,progress:1,dlspeed:0,upspeed:0,eta:8640000,availability:5.9,state:'stoppedUP',num_seeds:0,num_leechs:0,ratio:0.8,save_path:'/downloads/public-domain-films'},
    {hash:'demo-arch',name:'Arch Linux Installation ISO (x86_64).iso',size:1.25*1024**3,progress:.54,dlspeed:0,upspeed:0,eta:8640000,availability:.82,state:'stalledDL',num_seeds:1,num_leechs:1,ratio:0,save_path:'/downloads/linux-isos'},
    {hash:'demo-bunny',name:'Big Buck Bunny (Blender Open Movie, CC BY).mp4',size:876*1024**2,progress:1,dlspeed:0,upspeed:0.45*1024**2,eta:8640000,availability:17.2,state:'uploading',num_seeds:11,num_leechs:3,ratio:3.1,save_path:'/downloads/open-movies'},
    {hash:'demo-freebsd',name:'FreeBSD Release Installer ISO (amd64).iso',size:3.1*1024**3,progress:.23,dlspeed:1.5*1024**2,upspeed:0,eta:3408,availability:1.21,state:'downloading',num_seeds:4,num_leechs:1,ratio:0,save_path:'/downloads/os-images'}
  ];
  const icons = {
    settings:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.3a3.7 3.7 0 1 0 0 7.4 3.7 3.7 0 0 0 0-7.4Z"/><path d="m10.1 2.9-.4 1.8a7.8 7.8 0 0 0-1.5.9l-1.7-.6-2.1 3.6 1.3 1.2a8 8 0 0 0 0 1.8l-1.3 1.2 2.1 3.6 1.7-.6c.5.4 1 .7 1.5.9l.4 1.8h4l.4-1.8c.5-.2 1-.5 1.5-.9l1.7.6 2.1-3.6-1.3-1.2a8 8 0 0 0 0-1.8l1.3-1.2-2.1-3.6-1.7.6c-.5-.4-1-.7-1.5-.9l-.4-1.8h-4Z" transform="translate(0 1.1)"/></svg>',
    dots:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/></svg>',
    close:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    play:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.4 4.7c0-.89.95-1.44 1.72-.99l11.2 7.33c.69.45.69 1.47 0 1.92l-11.2 7.33c-.77.45-1.72-.1-1.72-.99Z" fill="currentColor" stroke="none"/></svg>',
    pause:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5.8" y="4.2" width="4.1" height="15.6" rx="1.1" fill="currentColor" stroke="none"/><rect x="14.1" y="4.2" width="4.1" height="15.6" rx="1.1" fill="currentColor" stroke="none"/></svg>',
    trash:'<svg class="symbol-refined sf-trash" viewBox="0 0 24 24" aria-hidden="true"><path d="M5.35 7.15h13.3"/><path d="M9.1 7V5.5a1.25 1.25 0 0 1 1.25-1.25h3.3A1.25 1.25 0 0 1 14.9 5.5V7"/><path d="m6.65 8.25.66 10.3c.06.99.74 1.65 1.73 1.65h5.92c.99 0 1.67-.66 1.73-1.65l.66-10.3"/><path d="M10.2 10.65v6.4M13.8 10.65v6.4"/></svg>',
    arrow:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
    eye:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6S2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.6"/></svg>',
    check:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
    info:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="7.5" r=".8" fill="currentColor" stroke="none"/></svg>',
    refresh:'<svg class="symbol-refined" viewBox="0 0 24 24" aria-hidden="true"><path d="M19.3 10.3a7.65 7.65 0 1 0-1.55 6.45"/><path d="M19.3 4.9v5.4h-5.4"/></svg>',
    search:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.3"/><path d="m16 16 4.5 4.5"/></svg>',
    plus:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    back:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 18-6-6 6-6"/></svg>'
  };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const bytes = (n, unit=false) => { if (!Number.isFinite(Number(n)) || n < 0) return '—'; if (+n === 0) return unit ? '0 B/s' : '0 B'; const sizes=['B','KB','MB','GB','TB','PB']; const i=Math.min(Math.floor(Math.log(+n)/Math.log(1024)),sizes.length-1); const value=+n/1024**i; const fixed=value>=100?0:value>=10?1:2; return value.toFixed(fixed).replace(/(\.\d*?[1-9])0+$|\.0+$/,'$1')+' '+sizes[i]+(unit?'/s':''); };
  const speedParts=n=>{const val=bytes(n,true).split(' ');return {amount:val[0],unit:val.slice(1).join(' ')};};
  const duration = s => { if (!Number.isFinite(Number(s)) || s < 0 || s >= 8640000) return '—'; if(s<60)return `${Math.max(0,Math.floor(s))}s`; const min=Math.floor(s/60);if(min<60)return `${min}m`;const h=Math.floor(min/60);if(h<24)return `${h}h ${min%60}m`;return `${Math.floor(h/24)}d ${h%24}h`; };
  const stateInfo=t=>{const s=String(t.state||'unknown');if(/error|missing/i.test(s))return {kind:'error',text:/missing/i.test(s)?'Missing files':'Error'};if(/paused|stopped/i.test(s))return {kind:'paused',text:'Paused'};if(/stalled/i.test(s))return {kind:'stalled',text:'Stalled'};if(/checking/i.test(s))return {kind:'paused',text:'Checking'};if(/queued/i.test(s))return {kind:'paused',text:'Queued'};if(/uploading|forcedUP/i.test(s))return {kind:'seeding',text:'Seeding'};if(/allocating|moving|metaDL/i.test(s))return {kind:'paused',text:s==='metaDL'?'Fetching metadata':s==='moving'?'Moving files':'Preparing'};if(/downloading|forcedDL/i.test(s))return {kind:'downloading',text:'Downloading'};if(Number(t.progress)>=1)return {kind:'completed',text:'Completed'};return {kind:'paused',text:'Waiting'};};
  const avail=v=>{const n=Number(v);if(!Number.isFinite(n)||n<0)return {text:'—',tone:'unknown'};return {text:n.toFixed(2),tone:n>=1?'good':n>0?'poor':'zero'};};
  const isPaused=t=>/paused|stopped/i.test(String(t.state||''));
  const matches=(t,filter)=>{const s=stateInfo(t).kind;if(filter==='all')return true;if(filter==='completed')return Number(t.progress)>=1;if(filter==='paused')return isPaused(t);if(filter==='downloading')return s==='downloading';if(filter==='seeding')return s==='seeding';if(filter==='stalled')return s==='stalled';return true;};
  const sorted = () => {
    const torrents=state.torrents.filter(t=>matches(t,state.filter) && String(t.name||'').toLowerCase().includes(state.search.toLowerCase()));
    const k=state.sort,dir=state.descending?-1:1;
    torrents.sort((a,b)=>{
      let x=a[k],y=b[k];
      if(k==='name'||k==='state')return dir*String(x??'').localeCompare(String(y??''),undefined,{numeric:true,sensitivity:'base'});
      if(k==='eta'){x=(Number(x)>=8640000||Number(x)<0)?Number.POSITIVE_INFINITY:Number(x);y=(Number(y)>=8640000||Number(y)<0)?Number.POSITIVE_INFINITY:Number(y);if(!Number.isFinite(x)&&!Number.isFinite(y))return 0;if(!Number.isFinite(x))return 1;if(!Number.isFinite(y))return -1;}
      x=Number(x);y=Number(y); if(!Number.isFinite(x))x=-1;if(!Number.isFinite(y))y=-1;return dir*(x-y);
    }); return torrents;
  };
  const card = t => {
    const status=stateInfo(t),a=avail(t.availability),p=Math.min(100,Math.max(0,Number(t.progress||0)*100));
    const percent=p.toFixed(1).replace(/\.0$/,'');
    const total = Math.max(0,Number(t.size)||0), done = total * (p/100), left = Math.max(0,total-done);
    return `<article class="torrent-card ${state.selection.has(t.hash)?'selected':''}" data-hash="${esc(t.hash)}" role="button" tabindex="0" aria-pressed="${state.selection.has(t.hash)}" aria-label="${state.selection.has(t.hash)?'Deselect':'Select'} ${esc(t.name)}">
      <div class="torrent-card-top"><div class="torrent-title">${esc(t.name)}</div><span class="selection-indicator" aria-hidden="true">${state.selection.has(t.hash)?icons.check:''}</span></div>
      <div class="card-status status-${status.kind}"><span class="status-dot"></span>${status.text}</div>
      <div class="progress-row"><div class="progress-value">${percent}<small>%</small></div><div class="size-value" aria-label="${esc(bytes(done))} complete, ${esc(bytes(left))} remaining, ${esc(bytes(total))} total">${bytes(done)} / ${bytes(left)} <span class="size-sep">·</span> <span class="size-total">${bytes(total)}</span></div></div>
      <div class="progress-track" role="progressbar" aria-label="Download progress" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100"><div class="progress-fill ${status.kind}" style="width:${p}%"></div></div>
      <div class="metric-grid"><div class="metric"><div class="metric-label">SPEED</div><div class="metric-value">${bytes(t.dlspeed,true)}</div></div><div class="metric"><div class="metric-label">ETA</div><div class="metric-value">${duration(t.eta)}</div></div><div class="metric"><div class="metric-label">Availability</div><div class="metric-value av-${a.tone}">${a.text}</div></div></div>
    </article>`;
  };
  // FLIP: animate individual card positions after a desktop details layout switch.
  // Uses short compositor transforms, never animated top/left or a full re-render timer.
  function snapshotDesktopCards(){
    if(!(document.body.classList.contains('tide-desktop') || document.body.classList.contains('tide-duo-landscape')) ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return null;
    return new Map(Array.from(document.querySelectorAll('#torrentList .torrent-card[data-hash]'),
      el=>[el.dataset.hash,el.getBoundingClientRect()]));
  }
  function animateDesktopReflow(before){
    if(!before)return;
    const cards=document.querySelectorAll('#torrentList .torrent-card[data-hash]');
    for(const card of cards){
      const old=before.get(card.dataset.hash);
      if(!old || typeof card.animate!=='function')continue;
      const now=card.getBoundingClientRect();
      const dx=old.left-now.left, dy=old.top-now.top;
      if(Math.abs(dx)<1 && Math.abs(dy)<1)continue;
      card.animate([
        {transform:`translate3d(${dx}px, ${dy}px, 0)`,opacity:.84},
        {transform:'translate3d(0, 0, 0)',opacity:1}
      ],{duration:265,easing:'cubic-bezier(.22, 1, .36, 1)',fill:'none'});
    }
  }

  function render() {
    const shown=sorted(),all=state.torrents;
    const totals=all.reduce((a,t)=>({dl:a.dl+Math.max(0,Number(t.dlspeed)||0),up:a.up+Math.max(0,Number(t.upspeed)||0)}),{dl:0,up:0});
    for(const [id,n] of [['totalDownload',totals.dl],['totalUpload',totals.up]]){const e=$('#'+id),s=speedParts(n);e.innerHTML=state.error || (!state.lastUpdate&&!demo)?'—':`${esc(s.amount)} <small>${esc(s.unit)}</small>`;}
    $('#demoTag').hidden=!demo;
    const sortText=({eta:'ETA',availability:'Avail.',dlspeed:'Speed',progress:'Progress',size:'Size',name:'Name',state:'Status'}[state.sort]||'ETA');
    $('[data-action="sort"]').title='Sort · '+sortText;
    $('#sortLabel').textContent=sortText;
    $$('#filterRow .filter-chip').forEach(b=>{b.classList.toggle('active',b.dataset.filter===state.filter);b.setAttribute('aria-pressed',String(b.dataset.filter===state.filter));});
    $('#listDescription').textContent=state.selection.size?`${state.selection.size} selected · ${shown.length} torrents`:(state.filter==='all'&&!state.search?`${shown.length} torrents`:`${shown.length} of ${all.length} torrents`);
    $('#lastUpdated').textContent=state.error?'Offline':'';
    const list=$('#torrentList'),scrollPane=$('.list-panel'),savedScrollTop=scrollPane.scrollTop;
    if(state.error){list.innerHTML=`<div class="empty-state"><div class="empty-icon">!</div><strong>Connection unavailable</strong><p>${esc(state.error)}</p><div class="error-actions"><button class="retry" data-action="refresh">Retry</button><button class="retry retry-alt" data-action="reload-page">Reload app</button></div></div>`;}
    else if(!all.length && !state.lastUpdate){list.innerHTML=`<div class="empty-state"><div class="loader"></div><p>Connecting to qBittorrent…</p></div>`;}
    else if(!all.length){list.innerHTML=`<div class="empty-state"><div class="empty-icon">≋</div><strong>No torrents yet</strong><p>Use Add to add a magnet link or torrent file.</p></div>`;}
    else if(!shown.length){list.innerHTML=`<div class="empty-state"><div class="empty-icon">⌕</div><strong>Nothing here</strong><p>Try a different filter or search term.</p></div>`;}
    else list.innerHTML=shown.map(card).join('');
    scrollPane.scrollTop=savedScrollTop;
    renderRail();
    if(state.selected && state.detailOpen)renderDetail();
    updateFilterFade();
  }
  const selectedTorrents=()=>state.torrents.filter(t=>state.selection.has(t.hash));
  const currentHashes=()=>selectedTorrents().map(t=>t.hash);
  function renderRail(){
    const items=selectedTorrents(), count=items.length, item=count===1?items[0]:null;
    const rail=$('#actionRail'),mount=$('#railButtons');
    const btn=(action, icon, label,opts={})=>`<button type="button" class="rail-button ${opts.style||''}" data-action="${action}" ${opts.hash?`data-hash="${esc(opts.hash)}"`:''} ${opts.disabled?'disabled aria-disabled="true"':''} aria-label="${esc(label)}" title="${esc(label)}">${icons[icon]}</button>`;
    let markup,mode;
    const action=items.every(isPaused)?'resume':'pause';
    const actionLabel=(action==='resume'?'Resume':'Pause')+(count>1?` ${count} torrents`:' torrent');
    if(count===1 && state.detailOpen){
      mode='detail';
      markup=`<div class="rail-cluster rail-top">${btn('close-detail','back','Back to torrent list')}</div><div class="rail-cluster rail-bottom">${btn('delete-confirm','trash','Remove torrent',{style:'rail-destructive'})}${btn(action,action==='resume'?'play':'pause',actionLabel)}${btn('settings','settings','Settings',{style:'rail-settings'})}</div>`;
    }else if(count){
      mode='selected';
      markup=`<div class="rail-cluster rail-top">${btn('deselect','close',`Deselect ${count} torrent${count===1?'':'s'}`)}</div><div class="rail-cluster rail-bottom">${btn('detail','info',count===1?'View torrent details':'Select one torrent to view details',{disabled:count!==1})}${btn('delete-confirm','trash',count>1?`Remove ${count} torrents`:'Remove torrent',{style:'rail-destructive'})}${btn(action,action==='resume'?'play':'pause',actionLabel)}${btn('settings','settings','Settings',{style:'rail-settings'})}</div>`;
    }else{
      mode=state.searchOpen?'search':'global';
      markup=state.searchOpen?`<div class="rail-cluster rail-bottom">${btn('clear-search','close','Close search')}</div>`:`<div class="rail-cluster rail-bottom">${btn('add','plus','Add torrent')}${btn('settings','settings','Settings',{style:'rail-settings'})}${btn('refresh','refresh','Refresh torrents')}${btn('search','search','Search torrents')}</div>`;
    }
    const signature=[mode,items.map(t=>t.hash).join('|'),action].join(':');
    if(rail.dataset.signature!==signature){mount.innerHTML=markup;rail.dataset.signature=signature;}
    rail.dataset.mode=mode;
    rail.setAttribute('aria-label',count?`${count} torrent${count===1?'':'s'} selected. Actions`:'Tide controls');
    const desktop=$('#desktopSelectionBar');
    if(desktop){
      desktop.hidden=count===0;
      if(count){
        const toolbarAction=items.every(isPaused)?'resume':'pause';
        const button=(act,ico,label,extra='')=>`<button type="button" class="desktop-tool ${extra}" data-action="${act}" title="${esc(label)}" aria-label="${esc(label)}">${icons[ico]}<span>${esc(label)}</span></button>`;
        desktop.innerHTML=`<span class="desktop-selection-count">${count} selected</span><div class="desktop-selection-actions">${button('deselect','close','Clear selection')}${count===1?button(state.detailOpen?'close-detail':'detail',state.detailOpen?'back':'info',state.detailOpen?'Close details':'Details'):''}${button(toolbarAction,toolbarAction==='resume'?'play':'pause',toolbarAction==='resume'?'Resume':'Pause')}${button('delete-confirm','trash','Remove','destructive')}</div>`;
      }
    }
  }
  function updateFilterFade(){
    const row=$('#filterRow'), viewport=row?.closest('.filter-viewport');
    if(!viewport)return;
    const remaining=row.scrollWidth-row.clientWidth-row.scrollLeft;
    viewport.classList.toggle('fade-right',remaining>3);
    viewport.classList.toggle('fade-left',row.scrollLeft>3);
  }
  $('#filterRow').addEventListener('scroll',updateFilterFade,{passive:true});
  window.addEventListener('resize',updateFilterFade,{passive:true});
  const sortScrollParent=document.querySelector('.list-panel');
  sortScrollParent?.addEventListener('scroll',()=>{
    if(state.modal==='sort' && document.body.classList.contains('tide-desktop'))dismiss();
  },{passive:true});
  function $$(selector,root=document){return Array.from(root.querySelectorAll(selector));}
  const api = async (method,endpoint,body,form=false) => {
    const makeOpts=() => {
      const opts={method,credentials:'same-origin',cache:'no-store',redirect:'follow',headers:{'Accept':'application/json, text/plain, */*'}};
      if(body){opts.body=form?body:new URLSearchParams(body);if(!form)opts.headers['Content-Type']='application/x-www-form-urlencoded; charset=UTF-8';}
      return opts;
    };
    const relative = 'api/v2/' + endpoint;
    const root = '/api/v2/' + endpoint;
    let res;
    for (const target of [relative, ...(location.pathname !== '/' ? [root] : [])]) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 11000);
      try { res = await fetch(target, {...makeOpts(),signal:controller.signal}); }
      catch(e){ if(e?.name==='AbortError') throw new Error('Connection timed out after 11 seconds. Check the server address and reload.');
        throw new Error('Could not reach the qBittorrent API from this device. Check the remote URL and network.'); }
      finally { clearTimeout(timer); }
      if(res.status !== 404 || target === root || relative === root) break;
    }
    if(res.status===401 || res.status===403){ const error = new Error(`Authentication rejected (HTTP ${res.status}). Sign in to qBittorrent in this PWA, then refresh.`); error.auth=true; throw error; }
    if(!res.ok) throw new Error(`qBittorrent API responded with HTTP ${res.status}.`);
    const contentType=(res.headers.get('content-type')||'').toLowerCase();
    const raw = await res.text();
    if(method==='GET' && /html/i.test(contentType+' '+raw.slice(0,100))) throw new Error('The server returned a web page instead of API data. Check the login and reverse proxy.');
    if(method==='GET'){
      if(endpoint==='app/version') return raw.replace(/^"|"$/g,'');
      try { return JSON.parse(raw); }catch{ throw new Error('The API returned invalid JSON. Check the reverse proxy and login.'); }
    }
    return raw;
  };
  let polling=false;
  async function refresh(){
    if(demo){state.torrents=[...mock];state.error=null;state.lastUpdate=Date.now();render();return;}
    if(polling)return;polling=true;
    try {const data=await api('GET','torrents/info?filter=all');if(!Array.isArray(data))throw new Error('Unexpected response from the qBittorrent API.');state.torrents=data;state.error=null;state.lastUpdate=Date.now();for(const h of state.selection){if(!data.some(t=>t.hash===h))state.selection.delete(h);}if(state.selected&&!state.selection.has(state.selected)){state.selected=currentHashes()[0]||null;state.detailOpen=false;$('#detailPanel').classList.remove('mobile-open');document.body.classList.remove('detail-active');$('#app').classList.remove('detail-open');}render();}
    catch(e){state.error=e.message;render();}
    finally{polling=false;}
  }
  async function loadVersion(){if(demo)return;try{let v=String(await api('GET','app/version'));state.version=parseInt(v,10)||5;}catch{state.version=5;}}
  function clearSelection(){
    state.selection.clear();state.selected=null;state.files=[];state.collapsedFolders.clear();
    if(state.detailOpen){state.detailOpen=false;$('#app').classList.remove('detail-open');$('#detailPanel').classList.remove('mobile-open');document.body.classList.remove('detail-active');}
    render();
  }
  function selectTorrent(hash){
    if(state.detailOpen && (document.body.classList.contains('tide-desktop') || document.body.classList.contains('tide-duo-landscape'))){
      if(hash!==state.selected || state.selection.size!==1){
        state.selection=new Set([hash]);state.selected=hash;state.files=[];state.collapsedFolders.clear();
        openDetails(hash);
      }
      return;
    }
    if(state.detailOpen)closeDetail();
    if(state.selection.has(hash))state.selection.delete(hash);else state.selection.add(hash);
    state.selected=state.selection.has(hash)?hash:(currentHashes().at(-1)||null);
    state.files=[];state.collapsedFolders.clear();
    if(state.searchOpen)exitMobileSearch();
    render();
  }
  async function openDetails(hash){
    if(state.selection.size!==1)return;
    const previousPositions=snapshotDesktopCards();
    if(hash && state.selection.has(hash))state.selected=hash;
    if(!state.selected)return;
    exitMobileSearch();
    state.detailOpen=true;
    $('#app').classList.add('detail-open');
    $('#detailPanel').classList.add('mobile-open');
    document.body.classList.add('detail-active');
    $('#detailPanel').scrollTop=0;
    render();
    animateDesktopReflow(previousPositions);
    if(!demo){
      const target=state.selected;
      try{const files=await api('GET','torrents/files?hash='+encodeURIComponent(target));
        if(state.selected===target && state.detailOpen){state.files=Array.isArray(files)?files:[];renderDetail();}}
      catch{/* File API failures should not block viewing the torrent. */}
    }
  }
  function closeDetail(){
    const previousPositions=snapshotDesktopCards();
    state.detailOpen=false;
    $('#app').classList.remove('detail-open');
    $('#detailPanel').classList.remove('mobile-open');
    document.body.classList.remove('detail-active');
    render();
    animateDesktopReflow(previousPositions);
  }
  // qBittorrent's torrents/files endpoint returns relative paths in name (e.g.
  // 'Season 1/Episode 1.mkv'). We build a tree without assuming a save path or
  // operating-system separator, and aggregate folder progress by file bytes.
  function demoFiles(t){
    if(t.hash==='demo-bunny')return [
      {name:'Big Buck Bunny/Film/Big Buck Bunny.mp4',size:t.size*.94,progress:t.progress},
      {name:'Big Buck Bunny/Extras/Production featurette.mp4',size:t.size*.035,progress:.71},
      {name:'Big Buck Bunny/Extras/Stills/poster.jpg',size:t.size*.005,progress:1},
      {name:'Big Buck Bunny/Subtitles/English.srt',size:98000,progress:1},
      {name:'Big Buck Bunny/Subtitles/Japanese.srt',size:91000,progress:.58},
      {name:'readme.txt',size:1200,progress:1}
    ];
    return [
      {name:'Video/'+t.name,size:Math.max(0,t.size-140000),progress:t.progress},
      {name:'Artwork/Cover.jpg',size:78000,progress:1},
      {name:'Artwork/Thumbnails/Preview.jpg',size:45000,progress:.75},
      {name:'Info.txt',size:17000,progress:1}
    ];
  }
  const folderIcon='<svg class="folder-symbol" viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 7.3A2.3 2.3 0 0 1 4.8 5h4.6l2 2.2h7.8a2.3 2.3 0 0 1 2.3 2.3v9.1a2.3 2.3 0 0 1-2.3 2.3H4.8a2.3 2.3 0 0 1-2.3-2.3z"/></svg>';
  const fileIcon='<svg class="file-symbol" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.3 2.8H14l4.2 4.4v13.2c0 .5-.5.9-1 .9H6.3c-.6 0-1-.4-1-1V3.8c0-.5.4-1 1-1Z"/><path d="M14 2.8v4.4h4.2"/></svg>';
  function renderFileTree(files){
    const root={name:'',key:'',folders:new Map(),files:[],size:0,received:0,count:0};
    for(const f of files){
      const parts=String(f.name??'Unnamed file').replace(/\\/g,'/').split('/').filter(Boolean);
      if(!parts.length)parts.push('Unnamed file');
      let node=root;
      const size=Math.max(0,Number(f.size)||0),received=size*Math.max(0,Math.min(1,Number(f.progress)||0));
      node.size+=size;node.received+=received;node.count++;
      for(const part of parts.slice(0,-1)){
        const key=node.key?node.key+'/'+part:part;
        if(!node.folders.has(part))node.folders.set(part,{name:part,key,folders:new Map(),files:[],size:0,received:0,count:0});
        node=node.folders.get(part);node.size+=size;node.received+=received;node.count++;
      }
      node.files.push({name:parts[parts.length-1],size,progress:Math.max(0,Math.min(1,Number(f.progress)||0))});
    }
    const renderNode=(node,depth)=>{
      const folderRows=[...node.folders.values()].sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'})).map(folder=>{
        const collapsed=state.collapsedFolders.has(folder.key),pct=folder.size?Math.round(folder.received/folder.size*100):100;
        return `<div class="tree-group" role="treeitem" aria-expanded="${!collapsed}" aria-label="Folder ${esc(folder.name)}">
          <button type="button" class="file-folder-row" data-folder-toggle="${esc(folder.key)}" style="--tree-indent:${8+Math.min(depth,8)*11}px" aria-expanded="${!collapsed}" aria-label="${collapsed?'Expand':'Collapse'} ${esc(folder.name)}">
            <span class="file-folder-icon">${folderIcon}</span><span class="file-folder-name">${esc(folder.name)}</span><span class="file-folder-summary">${folder.count} ${folder.count===1?'file':'files'} · ${bytes(folder.size)}</span><span class="file-folder-percentage">${pct}%</span><svg class="folder-chevron ${collapsed?'':'expanded'}" viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4"/></svg>
          </button>${collapsed?'':`<div class="tree-children" role="group">${renderNode(folder,depth+1)}</div>`}
        </div>`;
      }).join('');
      const fileRows=node.files.sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'})).map(f=>`<div class="file-item tree-file" role="treeitem" style="--tree-indent:${8+Math.min(depth,8)*11}px"><span class="file-leaf-icon">${fileIcon}</span><div class="file-leaf-main"><div class="file-name">${esc(f.name)}</div><div class="file-secondary">${bytes(f.size)}</div></div><div class="file-progress">${Math.round(f.progress*100)}%</div></div>`).join('');
      return folderRows+fileRows;
    };
    return renderNode(root,0);
  }
  function renderDetail(){
    const t=state.torrents.find(x=>x.hash===state.selected);if(!t)return;
    const status=stateInfo(t),a=avail(t.availability),p=Math.min(100,Math.max(0,Number(t.progress||0)*100)),percent=p.toFixed(1).replace(/\.0$/,'');
    const actPaused=isPaused(t),action=actPaused?'resume':'pause';
    const files=demo ? demoFiles(t) : state.files;
    const total=Math.max(0,Number(t.size)||0),done=total*(p/100),left=Math.max(0,total-done);
    $('#detailInner').innerHTML=`<button type="button" class="desktop-detail-back" data-action="close-detail" aria-label="Back to torrent list">${icons.back}<span>Back to torrents</span></button><h2 class="detail-name">${esc(t.name)}</h2><div class="detail-status status-${status.kind}"><span class="status-dot"></span>${status.text}</div>
      <div class="detail-progress"><strong>${percent}%</strong><span>${bytes(done)} / ${bytes(left)} · ${bytes(total)}</span></div><div class="progress-track detail-track"><div class="progress-fill ${status.kind}" style="width:${p}%"></div></div>
      <div class="detail-stats"><div class="detail-stat"><div class="detail-stat-label">Download speed</div><div class="detail-stat-value">${bytes(t.dlspeed,true)}</div></div><div class="detail-stat"><div class="detail-stat-label">ETA</div><div class="detail-stat-value">${duration(t.eta)}</div></div><div class="detail-stat"><div class="detail-stat-label">Availability</div><div class="detail-stat-value av-${a.tone}">${a.text}</div></div><div class="detail-stat"><div class="detail-stat-label">Upload speed</div><div class="detail-stat-value">${bytes(t.upspeed,true)}</div></div></div>
      <h3 class="section-title">Files ${files.length?'· '+files.length:''}</h3><div class="files-list" role="tree" aria-label="Torrent folder and file structure">${files.length?renderFileTree(files):'<div class="file-secondary">File details will appear here when available.</div>'}</div>
      <div class="detail-fine">${t.save_path?'Save location · '+esc(t.save_path)+'<br>':''}Seeds · ${esc(t.num_seeds??'—')} &nbsp; Peers · ${esc(t.num_leechs??'—')} &nbsp; Ratio · ${Number(t.ratio||0).toFixed(2)}</div>`;
  }
  // About Tide: qBittorrent provides session totals through transfer/info; 
  // sync/maindata?rid=0 additionally exposes alltime_dl and alltime_ul.
  const settingsAboutOpen=()=>state.modal==='settings'&&state.settingsTab==='about';
  const infoValue = v => Number.isFinite(Number(v)) && v!==null && v!==undefined && v!=='' && +v>=0 ? bytes(Number(v)) : '—';
  // SemVer 2.0.0, including prerelease ordering and ignored build metadata.
  const semverPattern=/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
  const parseVersion=value=>{
    const m=semverPattern.exec(String(value??''));
    return m?{core:m.slice(1,4).map(Number),pre:m[4]?m[4].split('.'):[]}:null;
  };
  function compareVersions(a,b){
    const x=parseVersion(a),y=parseVersion(b);
    if(!x||!y)throw new Error('Invalid semantic version');
    for(let i=0;i<3;i++)if(x.core[i]!==y.core[i])return x.core[i]>y.core[i]?1:-1;
    if(!x.pre.length&&!y.pre.length)return 0;
    if(!x.pre.length)return 1;
    if(!y.pre.length)return -1;
    for(let i=0;i<Math.min(x.pre.length,y.pre.length);i++){
      const left=x.pre[i],right=y.pre[i];
      if(left===right)continue;
      const ln=/^\d+$/.test(left),rn=/^\d+$/.test(right);
      if(ln&&rn)return Number(left)>Number(right)?1:-1;
      if(ln!==rn)return ln?-1:1;
      return left>right?1:-1;
    }
    return Math.sign(x.pre.length-y.pre.length);
  }
  function setInfoText(id,text){const el=document.getElementById(id);if(el)el.textContent=text;}
  async function loadAboutTransferTotals(){
    if(!settingsAboutOpen())return;
    if(demo){
      setInfoText('infoSessionDown',bytes(18.2*1024**3));setInfoText('infoSessionUp',bytes(2.8*1024**3));
      setInfoText('infoLifetimeDown',bytes(11.7*1024**4));setInfoText('infoLifetimeUp',bytes(8.4*1024**4));
      setInfoText('infoTransferNote','Sample values · Preview mode');return;
    }
    let transfer;
    try{
      transfer=await api('GET','transfer/info');
      if(!settingsAboutOpen())return;
      setInfoText('infoSessionDown',infoValue(transfer?.dl_info_data));
      setInfoText('infoSessionUp',infoValue(transfer?.up_info_data));
      // Some client builds may already include lifetime totals in transfer/info.
      setInfoText('infoLifetimeDown',infoValue(transfer?.alltime_dl));
      setInfoText('infoLifetimeUp',infoValue(transfer?.alltime_ul));
      setInfoText('infoTransferNote','Totals reported by qBittorrent');
    }catch(e){
      if(settingsAboutOpen())setInfoText('infoTransferNote','qBittorrent statistics unavailable: '+(e.message||'Connection error'));
      return;
    }
    if(transfer?.alltime_dl!==undefined && transfer?.alltime_ul!==undefined)return;
    try{
      const main=await api('GET','sync/maindata?rid=0');
      if(!settingsAboutOpen())return;
      const totals=main?.server_state||{};
      setInfoText('infoLifetimeDown',infoValue(totals.alltime_dl));
      setInfoText('infoLifetimeUp',infoValue(totals.alltime_ul));
      if(totals.alltime_dl===undefined || totals.alltime_ul===undefined)
        setInfoText('infoTransferNote','Lifetime totals are unavailable on this qBittorrent version.');
    }catch(e){
      if(settingsAboutOpen())setInfoText('infoTransferNote','Session totals shown; lifetime totals could not be retrieved.');
    }
  }
  async function checkAboutUpdates(){
    if(!settingsAboutOpen())return;
    const current=window.__TIDE_BUILD__||'1.2.0';
    const parsed=parseVersion(current);
    if(!parsed){setInfoText('infoUpdateStatus','Unrecognised installed version');return;}
    const beta=parsed.pre.length>0;
    setInfoText('infoUpdateStatus','Checking GitHub…');
    const link=document.getElementById('infoUpdateLink');if(link)link.hidden=true;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7000);
    try{
      const sources=[{ref:'main',url:'https://github.com/Joeljoel/tide'}];
      // Prerelease builds follow their active feature branch as well as main.
      if(beta)sources.push({ref:'feature/duo-split-edge-controls-1.2.0',url:'https://github.com/Joeljoel/tide/tree/feature/duo-split-edge-controls-1.2.0'});
      const results=await Promise.allSettled(sources.map(async source=>{
        const response=await fetch('https://raw.githubusercontent.com/Joeljoel/tide/'+source.ref+'/version.json?nocache='+Date.now(),
          {credentials:'omit',cache:'no-store',signal:controller.signal,headers:{'Accept':'application/json'}});
        if(!response.ok)throw new Error('HTTP '+response.status);
        const data=await response.json();
        if(!parseVersion(data.version))throw new Error('Invalid version data');
        return {...source,version:data.version};
      }));
      if(!settingsAboutOpen())return;
      const valid=results.filter(r=>r.status==='fulfilled').map(r=>r.value);
      if(!valid.length)throw new Error('No available version data');
      const latest=valid.reduce((best,next)=>compareVersions(next.version,best.version)>0?next:best);
      const cmp=compareVersions(latest.version,current);
      if(cmp>0){
        setInfoText('infoUpdateStatus','Update available: v'+latest.version);
        if(link){link.href=latest.url;link.hidden=false;}
      }else if(cmp===0)setInfoText('infoUpdateStatus',beta?'Up to date · beta channel':'Up to date');
      else setInfoText('infoUpdateStatus',beta?'Newer than published beta':'Newer than published build');
    }catch(error){if(settingsAboutOpen())setInfoText('infoUpdateStatus','Could not check GitHub · Try again');}
    finally{clearTimeout(timer);}
  }
  async function signOut(){
    if(state.busy)return;
    if(demo){dismiss();notify('Sign Out is available when connected to qBittorrent.');return;}
    const button=mount.querySelector('[data-action="sign-out"]');
    state.busy=true;
    if(button){button.disabled=true;button.textContent='Signing out…';}
    try{
      await api('POST','auth/logout');
      state.torrents=[];
      state.selection.clear();
      state.selected=null;
      state.error=null;
      // Use the current path's base so reverse-proxy subpaths stay intact.
      window.location.replace(new URL('./',window.location.href).href);
    }catch(error){
      notify(error?.message||'Could not sign out. Try again.');
      if(button?.isConnected){button.disabled=false;button.textContent='Sign Out';}
    }finally{state.busy=false;}
  }

  const qbDemoPreferences={
    dl_limit:0,up_limit:1024,alt_dl_limit:5120,alt_up_limit:512,
    save_path:'/downloads',start_paused_enabled:false,queueing_enabled:true,auto_tmm_enabled:false
  };
  let qbPreferences=null;
  let qbAltMode=false;
  let qbSettingsBusy=false;
  let qbSettingsRequest=0;
  const settingBoolean=(key,label,description)=>{
    if(!Object.prototype.hasOwnProperty.call(qbPreferences||{},key))return '';
    return `<label class="settings-toggle-row"><span><strong>${label}</strong><small>${description}</small></span><input type="checkbox" data-pref="${key}" ${qbPreferences[key]?'checked':''}><span class="settings-switch" aria-hidden="true"></span></label>`;
  };
  const settingLimit=(key,label)=>{
    if(!Object.prototype.hasOwnProperty.call(qbPreferences||{},key))return '';
    return `<label class="settings-field"><span>${label} <small>KiB/s · 0 = unlimited</small></span><input type="number" inputmode="numeric" data-pref="${key}" min="0" max="100000000" step="1" value="${esc(qbPreferences[key]??0)}"></label>`;
  };
  function settingsAboutHTML(){
    return `<div class="info-current"><span>Installed version</span><strong>v${esc(window.__TIDE_BUILD__||'1.1.0')}</strong></div>
      <div class="info-update-row"><span id="infoUpdateStatus" role="status" aria-live="polite">Checking GitHub…</span><a id="infoUpdateLink" href="https://github.com/Joeljoel/tide" target="_blank" rel="noopener noreferrer" hidden>View update</a></div>
      <div class="info-section-label">This session</div>
      <div class="info-metrics"><div><span>Downloaded</span><strong id="infoSessionDown">—</strong></div><div><span>Uploaded</span><strong id="infoSessionUp">—</strong></div></div>
      <div class="info-section-label">Lifetime</div>
      <div class="info-metrics"><div><span>Downloaded</span><strong id="infoLifetimeDown">—</strong></div><div><span>Uploaded</span><strong id="infoLifetimeUp">—</strong></div></div>
      <p id="infoTransferNote" class="info-note">Loading transfer statistics…</p>
      <div class="info-bottom-actions"><button type="button" data-action="check-updates" class="info-check">Check updates</button><a href="https://github.com/Joeljoel/tide" target="_blank" rel="noopener noreferrer">GitHub</a></div>
      <button type="button" class="info-signout" data-action="sign-out">Sign Out</button>`;
  }
  function settingsQBHTML(){
    if(!qbPreferences)return `<div class="settings-loading">Loading qBittorrent preferences…</div>`;
    return `<form id="qbSettingsForm" class="settings-form">
      <p class="settings-caption">Changes are applied to qBittorrent when saved.</p>
      <h3 class="settings-group-heading">Speed limits</h3>
      <div class="settings-pair">${settingLimit('dl_limit','Download')}${settingLimit('up_limit','Upload')}</div>
      <h3 class="settings-group-heading">Alternative limits</h3>
      <label class="settings-toggle-row"><span><strong>Use alternative limits</strong><small>Switch between normal and alternative speeds</small></span><input type="checkbox" id="qbAltLimits" ${qbAltMode?'checked':''}><span class="settings-switch" aria-hidden="true"></span></label>
      <div class="settings-pair">${settingLimit('alt_dl_limit','Download')}${settingLimit('alt_up_limit','Upload')}</div>
      <h3 class="settings-group-heading">Downloads</h3>
      ${Object.prototype.hasOwnProperty.call(qbPreferences,'save_path')?`<label class="settings-field settings-path"><span>Default save location</span><input type="text" data-pref="save_path" spellcheck="false" autocomplete="off" value="${esc(qbPreferences.save_path||'')}" placeholder="/downloads"></label>`:''}
      ${settingBoolean('start_paused_enabled','Start new torrents paused','New torrents wait until you resume them')}
      ${settingBoolean('queueing_enabled','Torrent queueing','Limit simultaneous active torrents')}
      ${settingBoolean('auto_tmm_enabled','Automatic torrent management','Organise new torrents with automatic management')}
    </form>`;
  }
  function renderSettingsTab(tab){
    if(state.modal!=='settings')return;
    state.settingsTab=['tide','qbittorrent','about'].includes(tab)?tab:'tide';
    mount.querySelectorAll('[data-settings-tab]').forEach(button=>{
      const active=button.dataset.settingsTab===state.settingsTab;
      button.classList.toggle('active',active);
      button.setAttribute('aria-selected',String(active));
      button.tabIndex=active?0:-1;
    });
    const target=mount.querySelector('#settingsPanel');if(!target)return;
    const footer=mount.querySelector('#qbSettingsFooter');
    if(footer)footer.hidden=state.settingsTab!=='qbittorrent'||!qbPreferences;
    if(target.dataset.activeTab!==state.settingsTab){
      target.scrollTop=0;
      target.dataset.activeTab=state.settingsTab;
    }
    if(state.settingsTab==='about'){
      target.innerHTML=settingsAboutHTML();
      void loadAboutTransferTotals();void checkAboutUpdates();
    }else if(state.settingsTab==='qbittorrent'){
      target.innerHTML=settingsQBHTML();
      if(!qbPreferences)void loadQBSettings();
    }else{
      target.innerHTML=`<div class="settings-group-heading">Appearance</div>
        <p class="settings-caption">Choose how Tide looks on this device.</p>
        <div class="settings-appearance" role="radiogroup" aria-label="Appearance">
        ${[['system','System','Match your device'],['dark','Dark','Dark interface'],['light','Light','Light interface']].map(([value,label,desc])=>`<button type="button" role="radio" aria-checked="${appearance===value}" class="settings-appearance-option ${appearance===value?'active':''}" data-appearance="${value}"><span>${label}<small>${desc}</small></span><span aria-hidden="true">${appearance===value?'✓':''}</span></button>`).join('')}
        </div>`;
    }
  }
  async function loadQBSettings(){
    if(state.modal!=='settings'||state.settingsTab!=='qbittorrent')return;
    const request=++qbSettingsRequest;
    if(demo){qbPreferences={...qbDemoPreferences};qbAltMode=false;renderSettingsTab('qbittorrent');return;}
    try{
      const [prefs,mode]=await Promise.all([api('GET','app/preferences'),api('GET','transfer/speedLimitsMode')]);
      if(request!==qbSettingsRequest||state.modal!=='settings'||state.settingsTab!=='qbittorrent')return;
      if(!prefs||typeof prefs!=='object'||Array.isArray(prefs))throw new Error('Unexpected preferences response');
      qbPreferences=prefs;
      qbAltMode=Number(mode)===1;
      renderSettingsTab('qbittorrent');
    }catch(error){
      if(request!==qbSettingsRequest||state.modal!=='settings'||state.settingsTab!=='qbittorrent')return;
      mount.querySelector('#settingsPanel').innerHTML=`<div class="settings-error">Unable to load qBittorrent settings.<p>${esc(error.message||'Connection error')}</p><button type="button" data-action="reload-qb-settings">Retry</button></div>`;
    }
  }
  async function saveQBSettings(event){
    event.preventDefault();
    if(qbSettingsBusy||!qbPreferences||state.modal!=='settings')return;
    const form=event.target;
    const changed={};
    for(const input of form.querySelectorAll('[data-pref]')){
      const key=input.dataset.pref;
      if(!Object.prototype.hasOwnProperty.call(qbPreferences,key))continue;
      let value;
      if(input.type==='checkbox')value=input.checked;
      else if(input.type==='number'){
        if(!/^\d+$/.test(input.value.trim())||Number(input.value)>100000000){
          input.setCustomValidity('Enter a whole number between 0 and 100,000,000');
          input.reportValidity();input.addEventListener('input',()=>input.setCustomValidity(''),{once:true});return;
        }
        value=Number(input.value);
      }else{
        value=input.value.trim();
        if(!value){input.setCustomValidity('Enter a save location');input.reportValidity();input.addEventListener('input',()=>input.setCustomValidity(''),{once:true});return;}
      }
      if(value!==qbPreferences[key])changed[key]=value;
    }
    const alternate=form.querySelector('#qbAltLimits')?.checked;
    const modeChanged=Boolean(alternate)!==qbAltMode;
    const status=mount.querySelector('#qbSettingsStatus');
    if(!Object.keys(changed).length&&!modeChanged){status.textContent='No changes';return;}
    const button=mount.querySelector('#qbSettingsFooter .settings-save');
    qbSettingsBusy=true;button.disabled=true;status.textContent='Saving…';
    try{
      if(!demo){
        if(Object.keys(changed).length)await api('POST','app/setPreferences',{json:JSON.stringify(changed)});
        if(modeChanged)await api('POST','transfer/toggleSpeedLimitsMode');
        const [newPrefs,newMode]=await Promise.all([api('GET','app/preferences'),api('GET','transfer/speedLimitsMode')]);
        qbPreferences=newPrefs;qbAltMode=Number(newMode)===1;
      }else{Object.assign(qbPreferences,changed);qbAltMode=Boolean(alternate);}
      if(state.modal==='settings'&&state.settingsTab==='qbittorrent'){
        renderSettingsTab('qbittorrent');
        const feedback=mount.querySelector('#qbSettingsStatus');if(feedback)feedback.textContent=demo?'Saved in preview':'Saved';
      }
    }catch(error){
      if(status.isConnected)status.textContent='Could not save: '+(error.message||'Connection error');
    }finally{qbSettingsBusy=false;if(button.isConnected)button.disabled=false;}
  }

  const overlay=$('#overlay'),mount=$('#modalMount');
  function openModal(kind,hash=null){state.modal=kind;overlay.hidden=false;document.body.style.overflow='hidden';document.body.classList.toggle('delete-dialog-open',['delete','sort','add'].includes(kind));
    const torrent=state.torrents.find(t=>t.hash===hash);const top=(title,desc='')=>`${['sort','add'].includes(kind)?'':'<div class="sheet-grab" aria-label="Swipe down to dismiss"><div class="sheet-handle"></div></div>'}<div class="dialog-top"><h2>${title}</h2><button class="dialog-close" data-action="dismiss" aria-label="Close">${icons.close}</button></div>${desc?`<p class="dialog-sub">${desc}</p>`:''}`;
    if(kind==='settings'){
      mount.innerHTML=`<section class="dialog floating-dialog tide-settings-dialog" role="dialog" aria-modal="true" aria-label="Settings">
        <div class="settings-toolbar">
          <div class="settings-tabs" role="tablist" aria-label="Settings sections">
            <button type="button" role="tab" data-settings-tab="tide">Tide</button>
            <button type="button" role="tab" data-settings-tab="qbittorrent">qBittorrent</button>
            <button type="button" role="tab" data-settings-tab="about">About</button>
          </div>
          <button type="button" class="dialog-close settings-close" data-action="dismiss" aria-label="Close settings" title="Close settings">${icons.close}</button>
        </div>
        <div class="settings-panel" id="settingsPanel" role="tabpanel"></div>
        <div class="settings-footer" id="qbSettingsFooter" hidden>
          <span id="qbSettingsStatus" role="status" aria-live="polite"></span>
          <button class="settings-save" type="submit" form="qbSettingsForm">Save changes</button>
        </div>
      </section>`;
      renderSettingsTab(state.settingsTab);
    }
    if(kind==='sort')mount.innerHTML=`<section class="dialog floating-dialog sort-alert" role="dialog" aria-modal="true" aria-label="Sort torrents">${top('Sort torrents')}<div class="sort-options">${[['eta','ETA'],['availability','Availability'],['dlspeed','Download speed'],['progress','Progress'],['size','Size'],['name','Name'],['state','Status']].map(([k,label])=>`<button class="sort-option ${state.sort===k?'active':''}" data-sort="${k}">${label}<span>${state.sort===k?'✓':' '}</span></button>`).join('')}</div><div class="sort-order"><span>Sort direction</span><button class="toggle-order" data-action="reverse">${state.descending?'Descending ↓':'Ascending ↑'}</button></div></section>`;
    if(kind==='add')mount.innerHTML=`<section class="dialog floating-dialog add-alert" role="dialog" aria-modal="true" aria-label="Add torrent">${top('Add a torrent','Paste a magnet link or upload a .torrent file.')}
      <form id="addForm"><label class="dialog-label" for="magnetInput">Magnet link or torrent URL</label><textarea id="magnetInput" spellcheck="false" autocomplete="off" placeholder="magnet:?xt=urn:btih:..." aria-label="Magnet or torrent URL" rows="2"></textarea><label class="dialog-label" for="torrentFile">Or select a .torrent file</label><label class="file-picker" for="torrentFile"><span class="file-picker-choose">Choose file</span><span class="file-selected" id="selectedFile">No file selected</span></label><input id="torrentFile" type="file" accept=".torrent,application/x-bittorrent"><button type="submit" class="add-alert-primary">Add torrent</button><button type="button" class="delete-alert-dismiss" data-action="dismiss">Cancel</button></form></section>`;
    if(kind==='menu'&&torrent){const paused=isPaused(torrent);mount.innerHTML=`<section class="dialog" role="dialog" aria-modal="true" aria-label="Torrent actions">${top('Torrent actions',esc(torrent.name))}<div class="sort-options"><button class="sort-option" data-action="${paused?'resume':'pause'}" data-hash="${esc(hash)}">${paused?'Resume torrent':'Pause torrent'}<span>${icons[paused?'play':'pause']}</span></button><button class="sort-option" data-action="detail" data-hash="${esc(hash)}">Open details<span>${icons.arrow}</span></button><button class="sort-option" style="color:var(--red)" data-action="delete-confirm" data-hash="${esc(hash)}">Remove torrent<span>${icons.trash}</span></button></div></section>`;}
    if(kind==='delete'){
      const deleting=hash?state.torrents.filter(t=>t.hash===hash):selectedTorrents();
      if(!deleting.length){dismiss();return;}
      const multiple=deleting.length>1;
      const heading=multiple?`Remove ${deleting.length} torrents?`:'Remove torrent?';
      const description=multiple?`The ${deleting.length} selected torrents will be removed from qBittorrent.`:'This torrent will be removed from qBittorrent.';
      const selectedName=multiple?`${esc(deleting[0].name)} and ${deleting.length-1} more`:`${esc(deleting[0].name)}`;
      mount.innerHTML=`<section class="dialog floating-dialog delete-alert" role="alertdialog" aria-modal="true" aria-labelledby="deleteHeading" aria-describedby="deleteDescription" tabindex="-1">
        <h2 class="delete-alert-heading" id="deleteHeading">${heading}</h2>
        <p class="delete-alert-copy" id="deleteDescription">${description}</p>
        <p class="delete-alert-name" title="${esc(deleting[0].name)}">${selectedName}</p>
        <p class="delete-alert-note">Downloaded files will stay on disk unless you choose to remove them too.</p>
        <label class="delete-alert-files"><input id="deleteFiles" type="checkbox"><span class="delete-alert-checkbox" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5.5 12 4.3 4.3 8.7-8.7"/></svg></span><span>Also delete downloaded files</span></label>
        <button type="button" class="delete-alert-primary" data-action="delete-execute" ${hash?`data-hash="${esc(hash)}"`:''}>${multiple?`Remove ${deleting.length} torrents`:'Remove torrent'}</button>
        <button type="button" class="delete-alert-dismiss" data-action="dismiss">Cancel</button>
      </section>`;
      mount.querySelector('.delete-alert-dismiss')?.focus({preventScroll:true});
    }
    const dialog=mount.querySelector('.dialog');if(dialog){
      dialog.style.setProperty('--sheet-drag','0px');
      if(kind==='sort' && (document.body.classList.contains('tide-desktop') || document.body.classList.contains('tide-duo-portrait'))){
        const trigger=document.querySelector('.inline-sort');
        if(trigger){
          const rect=trigger.getBoundingClientRect();
          const menuWidth=Math.min(316,window.innerWidth-24);
          const x=Math.max(12,Math.min(window.innerWidth-menuWidth-12,rect.right-menuWidth));
          const y=Math.max(10,Math.min(window.innerHeight-145,rect.bottom+9));
          dialog.style.setProperty('--desktop-sort-x',x+'px');
          dialog.style.setProperty('--desktop-sort-y',y+'px');
          dialog.style.setProperty('--portrait-sort-x',x+'px');
          dialog.style.setProperty('--portrait-sort-y',Math.min(y,window.innerHeight-515)+'px');
        }
      }
      if(['sort','add'].includes(kind))dialog.querySelector('.dialog-close')?.focus({preventScroll:true});

    }
  }
  function dismiss(){++qbSettingsRequest;state.modal='';overlay.hidden=true;mount.innerHTML='';document.body.style.overflow='';document.body.classList.remove('delete-dialog-open');sheetGesture=null;}
  let toastTimer;
  function notify(message){const e=$('#toast');e.textContent=message;e.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>e.classList.remove('show'),3200);}
  async function mutate(action,hash,deleteFiles=false){
    const targets=hash?[hash]:currentHashes();
    const existing=state.torrents.filter(t=>targets.includes(t.hash));
    if(!existing.length||state.busy)return;
    state.busy=true;
    try{
      if(demo){
        for(const t of existing){
          if(action==='delete'){
            const i=mock.findIndex(x=>x.hash===t.hash);if(i>=0)mock.splice(i,1);
            state.selection.delete(t.hash);
          }else{
            t.state=action==='pause'?(Number(t.progress)>=1?'stoppedUP':'stoppedDL'):(Number(t.progress)>=1?'uploading':'downloading');
            const mt=mock.find(x=>x.hash===t.hash);if(mt)Object.assign(mt,t);
          }
        }
        if(action==='delete'&&state.detailOpen){state.detailOpen=false;$('#app').classList.remove('detail-open');$('#detailPanel').classList.remove('mobile-open');document.body.classList.remove('detail-active');}
      }else{
        const op=action==='delete'?'delete':action==='pause'?(state.version>=5?'stop':'pause'):(state.version>=5?'start':'resume');
        const data=action==='delete'?{hashes:existing.map(t=>t.hash).join('|'),deleteFiles:String(!!deleteFiles)}:{hashes:existing.map(t=>t.hash).join('|')};
        const result=await api('POST','torrents/'+op,data);
        if(result&&!/^(ok\.?|)$/i.test(result.trim()))throw new Error(result);
        if(action==='delete'){for(const t of existing)state.selection.delete(t.hash);}
      }
      if(action==='delete')state.selected=currentHashes().at(-1)||null;
      dismiss();
      notify(`${existing.length} torrent${existing.length===1?'':'s'} ${action==='pause'?'paused':action==='resume'?'resumed':'removed'}`);
      await refresh();
    }catch(e){notify(e.message||'Action failed');}finally{state.busy=false;}
  }
  async function addTorrent(e){e.preventDefault();if(state.busy)return;const input=$('#magnetInput'),file=$('#torrentFile'),value=input.value.trim(),blob=file.files?.[0];if(!value&&!blob){notify('Paste a link or select a torrent file.');return;}state.busy=true;
    try{if(demo){mock.unshift({hash:'demo-'+Date.now(),name:blob?blob.name:value.slice(0,52),size:0,progress:0,dlspeed:0,upspeed:0,eta:8640000,availability:0,state:'metaDL'});}else{const body=new FormData();if(value)body.append('urls',value);if(blob)body.append('torrents',blob,blob.name);const result=await api('POST','torrents/add',body,true);if(!/^ok\.?$/i.test(result.trim()))throw new Error(result||'qBittorrent refused this torrent.');}dismiss();notify('Torrent added');state.filter='all';savePref('filter','all');await refresh();}
    catch(err){notify(err.message||'Could not add torrent');}finally{state.busy=false;}
  }
  // iOS standalone WebKit can swallow synthetic clicks next to the status island.
  // Respond to finger release, then cancel the duplicate synthetic click.
  const settingsHeaderButton=document.querySelector('.header-settings-button');
  const openHeaderSettings=()=>{if(state.modal==='settings')return;state.settingsTab='tide';openModal('settings');};
  let settingsTouch=null;
  settingsHeaderButton?.addEventListener('touchstart',event=>{
    const t=event.touches.length===1?event.touches[0]:null;
    settingsTouch=t?{x:t.clientX,y:t.clientY}:null;
  },{passive:true});
  settingsHeaderButton?.addEventListener('touchcancel',()=>{settingsTouch=null;},{passive:true});
  settingsHeaderButton?.addEventListener('touchend',event=>{
    const start=settingsTouch;
    settingsTouch=null;
    if(!start||event.changedTouches.length!==1)return;
    const t=event.changedTouches[0];
    if(Math.hypot(t.clientX-start.x,t.clientY-start.y)>14)return;
    if(event.cancelable)event.preventDefault();
    event.stopPropagation();
    openHeaderSettings();
  },{passive:false});
  settingsHeaderButton?.addEventListener('click',event=>{
    event.preventDefault();
    event.stopPropagation();
    openHeaderSettings();
  });

  // Unfolded portrait uses a native action-rail Settings control. The header
  // button remains in place for folded, landscape and desktop layouts.
  document.addEventListener('click', e=>{
    const fold=e.target.closest('[data-folder-toggle]');if(fold){const key=fold.dataset.folderToggle;if(state.collapsedFolders.has(key))state.collapsedFolders.delete(key);else state.collapsedFolders.add(key);renderDetail();return;}
    const tab=e.target.closest('[data-settings-tab]');if(tab){renderSettingsTab(tab.dataset.settingsTab);return;}
    const theme=e.target.closest('[data-appearance]');if(theme){appearance=setAppearance(theme.dataset.appearance);renderSettingsTab('tide');return;}
    const filter=e.target.closest('[data-filter]');if(filter){state.filter=filter.dataset.filter;savePref('filter',state.filter);render();return;}
    const sort=e.target.closest('[data-sort]');if(sort){state.sort=sort.dataset.sort;savePref('sort',state.sort);dismiss();render();return;}
    const b=e.target.closest('[data-action]');if(b){const a=b.dataset.action,hash=b.dataset.hash;
      if(a==='sort')openModal('sort');if(a==='add')openModal('add');if(a==='info'){state.settingsTab='about';openModal('settings');}if(a==='settings'){state.settingsTab='tide';openModal('settings');}if(a==='check-updates')void checkAboutUpdates();if(a==='sign-out')void signOut();
      if(a==='search')void openMobileSearch(b);
      if(a==='clear-search')void closeMobileSearch();
      if(a==='reload-qb-settings'){qbPreferences=null;renderSettingsTab('qbittorrent');}
      if(a==='deselect')clearSelection();
      if(a==='select-visible'){
        document.querySelectorAll('.torrent-card[data-hash]').forEach(card=>state.selection.add(card.dataset.hash));
        state.selected=currentHashes().at(-1)||null;
        render();
      }
      if(a==='refresh')refresh();if(a==='reload-page')location.reload();if(a==='dismiss')dismiss();if(a==='menu')openModal('menu',hash);if(a==='close-detail')closeDetail();if(a==='detail'){dismiss();if(state.selection.size===1)openDetails(hash||state.selected);}
      if(a==='reverse'){state.descending=!state.descending;savePref('descending',String(state.descending));openModal('sort');render();}
      if(a==='pause'||a==='resume')mutate(a,hash);if(a==='delete-confirm')openModal('delete',hash);if(a==='delete-execute')mutate('delete',hash,$('#deleteFiles')?.checked);
      return;
    }
    const card=e.target.closest('.torrent-card');if(card)selectTorrent(card.dataset.hash);
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(state.modal)dismiss();else if(state.searchOpen)document.querySelector('[data-action=clear-search]')?.click();else if(state.detailOpen)closeDetail();else if(state.selection.size)clearSelection();}if((e.key==='Enter'||e.key===' ')&&(e.target.matches('.torrent-card'))){e.preventDefault();selectTorrent(e.target.dataset.hash);}});
  $('#searchInput').addEventListener('input',e=>{state.search=e.target.value;render();});
  $('#desktopSearchInput').addEventListener('input',e=>{state.search=e.target.value;render();});
  $('#desktopSearchInput').addEventListener('keydown',e=>{if(e.key==='Escape'){e.target.value='';state.search='';render();}});
  document.addEventListener('keydown',e=>{
    if(document.body.classList.contains('tide-desktop') && (e.metaKey||e.ctrlKey) && e.key.toLowerCase()==='f'){
      e.preventDefault();$('#desktopSearchInput').focus();$('#desktopSearchInput').select();
    }
    if(document.body.classList.contains('tide-desktop') && (e.key==='Delete'||e.key==='Backspace') &&
       !e.target.closest('input,textarea,[contenteditable=true]') && state.selection.size && !state.modal){
      e.preventDefault();openModal('delete');
    }
  });
  $('#searchInput').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();e.target.blur();}});
  mount.addEventListener('submit',e=>{if(e.target.id==='addForm')addTorrent(e);if(e.target.id==='qbSettingsForm')void saveQBSettings(e);});
  mount.addEventListener('change',e=>{if(e.target.id==='torrentFile'){const target=$('#selectedFile');if(target)target.textContent=e.target.files?.[0]?.name||'No file selected';}});
  overlay.addEventListener('click',dismiss);
  // Drag any non-editable sheet surface down to close. Native scrolling is kept when
  // moving upward; on iOS use touch events because pointercancel can interrupt pans.
  let sheetGesture=null;
  const resetSheet = g => {if(g?.dialog?.isConnected){g.dialog.classList.remove('is-dragging');g.dialog.style.setProperty('--sheet-drag','0px');}};
  const finishGesture = (g,cancel=false) => {
    if(!g)return;
    if(!cancel && (g.dy>=68 || (g.dy>38 && performance.now()-g.t<230))){
      dismiss();
    } else resetSheet(g);
  };
  const canStartSheetGesture = target => {
    const dialog=target.closest('.dialog');
    if(!dialog || target.closest('textarea,input,select,a,label,[contenteditable=true]'))return null;
    // Settings content owns its scroll surface; swipes there must scroll, not dismiss the sheet.
    if(dialog.classList.contains('tide-settings-dialog') && target.closest('.settings-panel'))return null;
    if(dialog.scrollTop>1)return null;
    return dialog;
  };
  const trackGesture = (g,x,y) => {
    if(!g||!g.dialog.isConnected)return;
    const dx=x-g.x,dy=y-g.y;
    if(Math.abs(dx)>Math.abs(dy)*1.3 && Math.abs(dx)>18)return;
    if(dy>0){g.dy=Math.max(0,dy);g.dialog.classList.add('is-dragging');g.dialog.style.setProperty('--sheet-drag',g.dy+'px');}
    else if(g.dy)resetSheet(g);
  };
  mount.addEventListener('touchstart',e=>{
    if(e.touches.length!==1)return;
    const dialog=canStartSheetGesture(e.target);
    if(!dialog)return;
    const touch=e.touches[0];
    sheetGesture={kind:'touch',id:touch.identifier,dialog,x:touch.clientX,y:touch.clientY,dy:0,t:performance.now()};
  },{passive:true});
  mount.addEventListener('touchmove',e=>{
    const g=sheetGesture;
    if(!g||g.kind!=='touch')return;
    const touch=Array.from(e.touches).find(x=>x.identifier===g.id);
    if(!touch)return;
    if(touch.clientY>g.y+7 && g.dialog.scrollTop<=1) e.preventDefault();
    trackGesture(g,touch.clientX,touch.clientY);
  },{passive:false});
  mount.addEventListener('touchend',e=>{
    const g=sheetGesture;
    if(!g||g.kind!=='touch')return;
    if(!Array.from(e.changedTouches).some(t=>t.identifier===g.id))return;
    sheetGesture=null;finishGesture(g);
  },{passive:true});
  mount.addEventListener('touchcancel',()=>{const g=sheetGesture;sheetGesture=null;finishGesture(g,true);},{passive:true});
  mount.addEventListener('pointerdown',e=>{
    if(e.pointerType==='touch' || !e.isPrimary || e.target.closest('button'))return;
    const dialog=canStartSheetGesture(e.target);if(!dialog)return;
    sheetGesture={kind:'pointer',id:e.pointerId,dialog,x:e.clientX,y:e.clientY,dy:0,t:performance.now()};
    try{dialog.setPointerCapture(e.pointerId);}catch{}
  });
  mount.addEventListener('pointermove',e=>{const g=sheetGesture;if(g?.kind==='pointer'&&g.id===e.pointerId)trackGesture(g,e.clientX,e.clientY);});
  mount.addEventListener('pointerup',e=>{const g=sheetGesture;if(g?.kind==='pointer'&&g.id===e.pointerId){sheetGesture=null;finishGesture(g);}});
  mount.addEventListener('pointercancel',e=>{const g=sheetGesture;if(g?.kind==='pointer'&&g.id===e.pointerId){sheetGesture=null;finishGesture(g,true);}});
  // On compact screens, a swipe from the left edge closes torrent details (iOS back gesture).
  let detailTouch=null;
  const detailPanel=$('#detailPanel');
  detailPanel.addEventListener('touchstart',e=>{
    const touch=e.touches[0];
    detailTouch=(e.touches.length===1 && touch.clientX<=65 && window.innerWidth<850)?{x:touch.clientX,y:touch.clientY}:null;
  },{passive:true});
  detailPanel.addEventListener('touchend',e=>{
    if(!detailTouch || !e.changedTouches.length)return;
    const t=e.changedTouches[0],dx=t.clientX-detailTouch.x,dy=t.clientY-detailTouch.y;
    detailTouch=null;if(dx>75 && Math.abs(dy)<65 && state.detailOpen)closeDetail();
  },{passive:true});
  detailPanel.addEventListener('touchcancel',()=>{detailTouch=null;},{passive:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  if(demo){refresh();}else{render();loadVersion();refresh();setInterval(()=>{if(!document.hidden&&!state.modal)refresh();},3500);}
})();
