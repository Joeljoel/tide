(() => {
  'use strict';
  // Split View shares the full unfolded landscape viewport.
  const poses={
    desktop:{label:'Desktop',width:1280,height:800},
    'folded-portrait':{label:'Outer · portrait',width:466,height:678},
    'folded-landscape':{label:'Outer · landscape',width:678,height:466},
    'unfolded-portrait':{label:'Inner · portrait',width:669,height:951},
    'partially-folded-portrait':{label:'Inner · partially folded · portrait',width:669,height:951},
    'partially-folded-landscape':{label:'Inner · partially folded · landscape',width:951,height:669},
    'partially-folded-split-left':{label:'Split View · partially folded · Tide left',width:951,height:669,split:true},
    'partially-folded-split-right':{label:'Split View · partially folded · Tide right',width:951,height:669,split:true},
    'unfolded-landscape':{label:'Inner · landscape',width:951,height:669},
    'split-left':{label:'Split View · Tide left',width:951,height:669,split:true},
    'split-right':{label:'Split View · Tide right',width:951,height:669,split:true}
  };
  const get=id=>document.getElementById(id);
  const stage=get('stage'),holder=get('frameHolder'),frame=get('deviceFrame'),iframe=get('tidePreview');
  const screen=get('deviceScreen'),nearPlane=get('foldNearPlane'),tide=get('tidePanel'),home=get('homePanel');
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  const desktopBtn=get('desktopBtn'),duoBtn=get('duoBtn'),duoChoices=get('duoChoices');
  const foldedBtn=get('foldedBtn'),partialBtn=get('partialBtn'),unfoldedBtn=get('unfoldedBtn');
  const foldButtons=[foldedBtn,partialBtn,unfoldedBtn];
  const rotateBtn=get('rotateBtn'),splitBtn=get('splitBtn'),shiftBtn=get('shiftBtn');
  const foldIframe=get('tideFoldPreview'),foldFlap=get('foldFlap');
  const nearSheen=get('foldNearSheen'),farSheen=foldFlap.querySelector('.fold-flap-light'),
    hingeSheen=get('hingeSheen');
  const foldInteraction=get('foldInteraction');
  const statusTemplate=get('systemUi').querySelector('.status-indicators');
  const foldStatus=get('foldFlapViewport').querySelector('.fold-flap-status');
  foldStatus.replaceChildren(...Array.from(statusTemplate.children,child=>child.cloneNode(true)));
  let device='desktop',foldState='folded',orientation='portrait',split=false,side='left',loaded=false,foldLoaded=false;
  let transitioning=false;
  let currentPose='desktop';

  // Orientation describes the outside/closed device. When opening its
  // book-style inner screen, the physical display direction turns 90 degrees:
  // portrait OUTER -> landscape INNER and landscape OUTER -> portrait INNER.
  // Keep this mapping for both the partially folded and unfolded positions.
  function innerOrientation(){
    return orientation==='portrait'?'landscape':'portrait';
  }

  function selectedPose(){
    if(device==='desktop')return 'desktop';
    if(foldState==='folded')return 'folded-'+orientation;
    const inner=innerOrientation();
    if(foldState==='partial'){
      if(inner==='landscape' && split)return 'partially-folded-split-'+side;
      return 'partially-folded-'+inner;
    }
    if(inner==='portrait')return 'unfolded-portrait';
    return split?'split-'+side:'unfolded-landscape';
  }

  function sendPose(){
    for(const [element,ready] of [[iframe,loaded],[foldIframe,foldLoaded]]){
      if(ready && element.contentWindow){
        // Split View has exactly the same app UI and viewport at either
        // physical hinge angle: only the outer device presentation changes.
        const appPose=currentPose.startsWith('partially-folded-split-')
          ?currentPose.replace('partially-folded-',''):currentPose;
        element.contentWindow.postMessage({type:'tide-demo-set-pose',pose:appPose},location.origin);
        element.contentDocument?.documentElement.classList.toggle(
          'tide-demo-fold-visual',currentPose.startsWith('partially-folded-'));
      }
    }
  }

  function resizeFrame(){
    const config=poses[currentPose];
    const desktop=currentPose==='desktop';
    // Use one continuous physical bezel thickness across Duo's folded,
    // partially folded and fully unfolded states. Previously 9px of unequal
    // frame padding was disguised as thicker side/top bezels on the inner
    // display, producing inconsistent curved edges between states.
    const bezel=desktop?6:8;
    const w=config.width+bezel*2,h=config.height+bezel*2;
    const maximumW=Math.max(110,stage.clientWidth-20);
    const maximumH=Math.max(350,Math.min(970,window.innerHeight*1.5));
    // Use a common scale for every Duo pose, including the swept rotation.
    const duoDiagonal=Math.hypot(961,688);
    const scale=desktop?Math.min(1,maximumW/w,maximumH/h):
      Math.min(1,maximumW/duoDiagonal,maximumH/961);
    frame.style.width=w+'px';
    frame.style.height=h+'px';
    frame.style.borderWidth=bezel+'px';
    frame.style.setProperty('--device-scale',scale);
    frame.dataset.pose=currentPose;
    frame.classList.toggle('is-split',!!config.split);
    frame.classList.toggle('is-partially-folded',currentPose.startsWith('partially-folded-'));
    // The outer panel is a D, not a rounded rectangle. Rotating it clockwise
    // moves its two large-radius corners from right to bottom.
    const radii=currentPose==='folded-portrait'?[9,73,73,9]:
      currentPose==='folded-landscape'?[9,9,73,73]:
      currentPose==='desktop'?[18,18,18,18]:
      currentPose.endsWith('portrait')?[53,51,51,53]:[51,51,51,51];
    ['tl','tr','br','bl'].forEach((name,i)=>{
      frame.style.setProperty('--'+name,radii[i]+'px');
      holder.style.setProperty('--outer-'+name,(radii[i]*scale)+'px');
    });
    holder.style.width=Math.ceil(w*scale)+'px';
    holder.style.height=Math.ceil(h*scale)+'px';
    stage.style.minHeight=Math.ceil(h*scale)+38+'px';
    get('poseName').textContent=config.label;
    get('poseDimensions').textContent=config.width+' × '+config.height;
    get('previewNote').textContent=currentPose.startsWith('partially-folded-')?'3D hinge preview · simulated posture · v1.4.0-beta.1':'Interactive preview · v1.4.0-beta.1';
  }

  function showPose(pose){
    currentPose=pose;
    resizeFrame();
    sendPose();
    // Both visual halves follow the same logical screen offset.
    requestAnimationFrame(()=>{
      sendPose();
      requestAnimationFrame(()=>{sendPose();alignScrolls();});
    });
  }

  function play(element,keyframes,duration,easing='cubic-bezier(.2,.7,.25,1)'){
    return element.animate(keyframes,{duration,easing,fill:'both'});
  }

  function turn(nextPose){
    const direction=currentPose.endsWith('portrait')?1:-1;
    const transform=angle=>'translate(-50%,-50%) scale(var(--device-scale)) rotate('+angle+'deg)';
    const outgoing=play(frame,[{transform:transform(0)},{transform:transform(direction*45)}],150,'ease-in');
    return outgoing.finished.then(()=>{
      outgoing.cancel();
      showPose(nextPose);
      const incoming=play(frame,[{transform:transform(-direction*45)},{transform:transform(0)}],190);
      return incoming.finished.then(()=>incoming.cancel());
    });
  }

  // The phone-level shadow + rim highlight live on frame-holder and never
  // unmount. Rotate the physical glass planes while their hinge-only lighting
  // smoothly approaches zero as the device opens.
  async function foldTransition(nextPose){
    const entering=nextPose.startsWith('partially-folded-');
    const leaving=currentPose.startsWith('partially-folded-');
    const portrait=(entering?nextPose:currentPose).endsWith('portrait');
    const open='rotate'+(portrait?'X':'Y')+'(0deg)';
    const firstBend=portrait?'rotateX(-6deg)':'rotateY(10deg)';
    const secondBend=portrait?'rotateX(10deg)':'rotateY(-10deg)';
    const sheens=[nearSheen,farSheen,hingeSheen];
    const hingeAlpha=0.20;
    if(entering){
      showPose(nextPose);
      const motions=[
        play(nearPlane,[{transform:open},{transform:firstBend}],330),
        play(foldFlap,[{transform:open},{transform:secondBend}],330),
        ...sheens.map((element,i)=>play(element,[
          {opacity:0},{opacity:i===2?hingeAlpha:1}
        ],330))
      ];
      await Promise.all(motions.map(motion=>motion.finished));
      motions.forEach(motion=>motion.cancel());
    }else if(leaving){
      const motions=[
        play(nearPlane,[{transform:firstBend},{transform:open}],290),
        play(foldFlap,[{transform:secondBend},{transform:open}],290),
        ...sheens.map((element,i)=>play(element,[
          {opacity:i===2?hingeAlpha:1},{opacity:0}
        ],290))
      ];
      await Promise.all(motions.map(motion=>motion.finished));
      showPose(nextPose);
      motions.forEach(motion=>motion.cancel());
    }else{
      showPose(nextPose);
      const motion=play(frame,[{opacity:.8},{opacity:1}],220);
      await motion.finished;
      motion.cancel();
    }
  }

  async function slide(nextPose,kind){
    const closing=!poses[nextPose].split;
    const before={left:tide.offsetLeft,width:tide.offsetWidth};
    if(!closing)showPose(nextPose);
    const after=closing?{left:0,width:screen.clientWidth}:
      {left:tide.offsetLeft,width:tide.offsetWidth};
    const duration=kind==='shift'?420:280;
    const tideMotion=play(tide,[
      {left:before.left+'px',width:before.width+'px',right:'auto'},
      {left:after.left+'px',width:after.width+'px',right:'auto'}
    ],duration);
    const homeLeft=home.offsetLeft;
    const homeWidth=home.offsetWidth;
    const opposite=screen.clientWidth-homeLeft-homeWidth;
    const outside=homeLeft===0?-homeWidth:screen.clientWidth;
    const travel=(kind==='shift'?opposite:outside)-homeLeft;
    const homeFrames=[{transform:'translateX('+travel+'px)'},{transform:'translateX(0)'}];
    const homeMotion=play(home,closing?homeFrames.reverse():homeFrames,duration);
    const handleMotion=play(get('deviceScreen').querySelector('.split-handle'),
      closing?[{opacity:1},{opacity:0}]:[{opacity:0},{opacity:1}],duration);
    const motions=[tideMotion,homeMotion,handleMotion];
    await Promise.all(motions.map(motion=>motion.finished));
    if(closing)showPose(nextPose);
    motions.forEach(motion=>motion.cancel());
  }

  async function transition(kind,action){
    if(transitioning)return;
    action();
    const nextPose=selectedPose();
    if(nextPose===currentPose)return;
    if(reducedMotion.matches||!frame.animate||kind==='switch'){
      update();
      return;
    }
    transitioning=true;
    frame.setAttribute('aria-busy','true');
    try{
      if(kind==='rotate')await turn(nextPose);
      else if(kind==='fold')await foldTransition(nextPose);
      else await slide(nextPose,kind);
    }finally{
      transitioning=false;
      frame.removeAttribute('aria-busy');
      update();
    }
  }

  function update(){
    showPose(selectedPose());
    desktopBtn.setAttribute('aria-pressed',String(device==='desktop'));
    duoBtn.setAttribute('aria-pressed',String(device==='duo'));
    duoChoices.hidden=device!=='duo';
    const selectedIndex=['folded','partial','unfolded'].indexOf(foldState);
    foldButtons.forEach((button,index)=>{
      button.setAttribute('aria-checked',String(index===selectedIndex));
      button.tabIndex=index===selectedIndex?0:-1;
    });
    rotateBtn.setAttribute('aria-label','Rotate '+(orientation==='portrait'?'to landscape':'to portrait'));
    splitBtn.hidden=foldState==='folded'||innerOrientation()!=='landscape';
    splitBtn.textContent=split?'Unsplit':'Split';
    splitBtn.setAttribute('aria-pressed',String(split));
    shiftBtn.hidden=!split;
    shiftBtn.textContent=side==='left'?'Move Tide right':'Move Tide left';
  }

  desktopBtn.addEventListener('click',()=>transition('switch',()=>{device='desktop';}));
  duoBtn.addEventListener('click',()=>transition('switch',()=>{
    if(device==='duo')return;
    device='duo';
    foldState='folded';
    orientation='portrait';
    split=false;
    side='left';
  }));
  foldButtons.forEach(button=>{
    button.addEventListener('click',()=>transition('fold',()=>{
      foldState=button.dataset.foldState;
      if(foldState==='folded'||innerOrientation()!=='landscape')split=false;
    }));
    button.addEventListener('keydown',event=>{
      const i=foldButtons.indexOf(button);
      const next=event.key==='ArrowRight'?Math.min(2,i+1):
        event.key==='ArrowLeft'?Math.max(0,i-1):
        event.key==='Home'?0:event.key==='End'?2:null;
      if(next===null)return;
      event.preventDefault();
      foldButtons[next].click();
      foldButtons[next].focus();
    });
  });
  rotateBtn.addEventListener('click',()=>transition('rotate',()=>{
    orientation=orientation==='portrait'?'landscape':'portrait';
    split=false;
  }));
  splitBtn.addEventListener('click',()=>transition('split',()=>{split=!split;}));
  shiftBtn.addEventListener('click',()=>transition('shift',()=>{side=side==='left'?'right':'left';}));
  // Each 3D surface has a full-resolution copy of the fake-data app.
  // Proxy common UI events between the same-origin frames so either half
  // stays interactive and the demo's two views remain visually synchronized.
  let mirroring=false;
  const scrollEcho=new WeakMap();
  function peerScrollport(source,peerDoc){
    if(source.nodeType===9 || source===source.ownerDocument.documentElement ||
       source===source.ownerDocument.body)
      return peerDoc.scrollingElement;
    if(source.id){
      const byId=peerDoc.getElementById(source.id);
      if(byId)return byId;
    }
    const selectors=['.list-panel','.detail-panel','.settings-panel',
      '.dialog','.files-list','.torrent-list','.sort-options'];
    for(const selector of selectors){
      if(source.matches?.(selector)){
        const candidates=Array.from(source.ownerDocument.querySelectorAll(selector));
        const index=candidates.indexOf(source);
        return peerDoc.querySelectorAll(selector)[index]||null;
      }
    }
    // Match any nested scrollport with its corresponding same-DOM-tree node.
    const path=[];
    let node=source;
    while(node?.parentElement){
      path.unshift(Array.from(node.parentElement.children).indexOf(node));
      node=node.parentElement;
      if(node===source.ownerDocument.body)break;
    }
    let peer=peerDoc.body;
    for(const index of path)peer=peer?.children[index];
    return peer||null;
  }
  function syncScroll(source,peerDoc){
    if(!frame.classList.contains('is-partially-folded'))return;
    const echoed=scrollEcho.get(source);
    if(echoed){
      scrollEcho.delete(source);
      if(Math.abs(source.scrollTop-echoed.top)<1 &&
         Math.abs(source.scrollLeft-echoed.left)<1)return;
    }
    const peer=peerScrollport(source,peerDoc);
    if(!peer)return;
    const fromMax=Math.max(0,source.scrollHeight-source.clientHeight);
    const toMax=Math.max(0,peer.scrollHeight-peer.clientHeight);
    const destY=fromMax>0?source.scrollTop/fromMax*toMax:source.scrollTop;
    const fromX=Math.max(0,source.scrollWidth-source.clientWidth);
    const toX=Math.max(0,peer.scrollWidth-peer.clientWidth);
    const destX=fromX>0?source.scrollLeft/fromX*toX:source.scrollLeft;
    if(Math.abs(peer.scrollTop-destY)>.75 || Math.abs(peer.scrollLeft-destX)>.75){
      scrollEcho.set(peer,{top:destY,left:destX});
      peer.scrollTop=destY;
      peer.scrollLeft=destX;
    }
  }
  function alignScrolls(){
    if(!loaded||!foldLoaded)return;
    const a=iframe.contentDocument,b=foldIframe.contentDocument;
    if(!a||!b)return;
    for(const selector of ['.list-panel','.detail-panel','.settings-panel']){
      const items=a.querySelectorAll(selector),peers=b.querySelectorAll(selector);
      items.forEach((item,i)=>{
        const peer=peers[i];
        if(peer){
          const from=Math.max(0,item.scrollHeight-item.clientHeight);
          const to=Math.max(0,peer.scrollHeight-peer.clientHeight);
          peer.scrollTop=from?item.scrollTop/from*to:item.scrollTop;
          peer.scrollLeft=item.scrollLeft;
        }
      });
    }
  }
  function peerFor(source,doc){
    const node=source.closest('[data-action],[data-filter],[data-sort],'+
      '[data-folder-toggle],[data-settings-tab],[data-appearance],'+
      '[data-hash],.torrent-card,.desktop-add,#addForm button[type="submit"]');
    if(!node)return null;
    if(node.matches('.desktop-add'))return doc.querySelector('.desktop-add');
    if(node.matches('#addForm button[type="submit"]'))
      return doc.querySelector('#addForm button[type="submit"]');
    for(const attribute of ['data-action','data-filter','data-sort',
      'data-folder-toggle','data-settings-tab','data-appearance','data-hash']){
      if(!node.hasAttribute(attribute))continue;
      const value=node.getAttribute(attribute);
      const matches=Array.from(doc.querySelectorAll('['+attribute+']'))
        .filter(item=>item.getAttribute(attribute)===value);
      if(attribute==='data-action' && node.dataset.hash)
        return matches.find(item=>item.dataset.hash===node.dataset.hash)||null;
      return matches[0]||null;
    }
    return null;
  }
  function wireMirror(from,to){
    const doc=from.contentDocument;
    if(!doc || doc.documentElement.dataset.mirrorReady)return;
    doc.documentElement.dataset.mirrorReady='1';
    // Scroll never bubbles: capture scrolling from either visual half and
    // apply it immediately to the same viewport's matching scroll container.
    doc.addEventListener('scroll',event=>{
      if(mirroring)return;
      const peerDoc=to.contentDocument;
      if(peerDoc)syncScroll(event.target,peerDoc);
    },true);
    doc.addEventListener('click',event=>{
      if(mirroring)return;
      const target=event.target;
      // Let the active Tide instance process the user action before
      // replaying it in the visual copy. Dispatching during capture caused
      // two async rerenders to race during card selections.
      queueMicrotask(()=>{
        const peer=to.contentDocument && peerFor(target,to.contentDocument);
        if(!peer)return;
        mirroring=true;
        try{peer.click();}finally{mirroring=false;}
      });
    },true);
    doc.addEventListener('input',event=>{
      if(mirroring)return;
      if(!event.target.id)return;
      const peer=to.contentDocument?.getElementById(event.target.id);
      if(!peer)return;
      mirroring=true;
      try{
        peer.value=event.target.value;
        peer.dispatchEvent(new Event('input',{bubbles:true}));
      }finally{mirroring=false;}
    },true);
  }

  // The far half is a visual surface, not a second independent touchscreen.
  // A transparent interaction plane maps pointer positions back to the one
  // primary Tide document. This prevents hover/focus from triggering a
  // second compositor repaint while keeping right/bottom cards usable.
  function visualModalKind(doc){
    const dialog=doc?.querySelector('#modalMount .dialog');
    if(!dialog)return '';
    if(dialog.classList.contains('tide-settings-dialog'))return 'settings';
    if(dialog.classList.contains('sort-alert'))return 'sort';
    if(dialog.classList.contains('add-alert'))return 'add';
    if(dialog.classList.contains('delete-alert'))return 'delete';
    return 'menu';
  }
  let modalObserver=null;
  function syncVisualModal(){
    const primary=iframe.contentDocument,secondary=foldIframe.contentDocument;
    if(!primary||!secondary)return;
    const kind=visualModalKind(primary),rendered=visualModalKind(secondary);
    if(kind===rendered)return;
    if(!kind){
      secondary.querySelector('#modalMount [data-action="dismiss"]')?.click();
      return;
    }
    const triggers={
      settings:'.header-settings-button',
      sort:'[data-action="sort"]',
      add:'[data-action="add"]'
    };
    let opener=triggers[kind]?secondary.querySelector(triggers[kind]):null;
    if(kind==='menu'){
      const active=primary.querySelector('#modalMount [data-hash]');
      const hash=active?.dataset.hash;
      opener=Array.from(secondary.querySelectorAll('[data-action="menu"]'))
        .find(button=>button.dataset.hash===hash)||opener;
    }
    if(opener){
      opener.click();
      // Render can reinsert settings content after an asynchronous request;
      // never make another competing Tide instance responsible for clicks.
    }
  }
  function watchPrimaryModal(){
    modalObserver?.disconnect();
    const primary=iframe.contentDocument;
    const mount=primary?.getElementById('modalMount');
    const overlay=primary?.getElementById('overlay');
    if(!mount||!overlay)return;
    modalObserver=new MutationObserver(syncVisualModal);
    modalObserver.observe(mount,{childList:true});
    modalObserver.observe(overlay,{attributes:true,attributeFilter:['hidden']});
    syncVisualModal();
  }
  function hitPrimary(event){
    if(!loaded || !frame.classList.contains('is-partially-folded'))return null;
    if(poses[currentPose].split && side==='left')return null; // Home screen
    const document=iframe.contentDocument;
    if(!document)return null;
    const bounds=foldInteraction.getBoundingClientRect();
    if(!bounds.width || !bounds.height)return null;
    const u=Math.max(0,Math.min(1,(event.clientX-bounds.left)/bounds.width));
    const v=Math.max(0,Math.min(1,(event.clientY-bounds.top)/bounds.height));
    const portrait=currentPose==='partially-folded-portrait';
    // Partial Split View right uses an actual half-width Tide viewport.
    // Normal book posture uses the right half of one full-width viewport.
    const splitRight=currentPose==='partially-folded-split-right';
    const normalizedX=portrait||splitRight?u:.5+.5*u;
    const normalizedY=portrait?.5+.5*v:v;
    const x=normalizedX*iframe.contentWindow.innerWidth;
    const y=normalizedY*iframe.contentWindow.innerHeight;
    const visibleDoc=foldIframe.contentDocument;
    const visualTarget=visibleDoc?.elementFromPoint(
      normalizedX*foldIframe.contentWindow.innerWidth,
      normalizedY*foldIframe.contentWindow.innerHeight
    );
    return {document,x,y,target:document.elementFromPoint(x,y),visualTarget};
  }
  function primaryScrollTarget(hit){
    let element=hit?.target;
    while(element && element.nodeType===1){
      const style=hit.document.defaultView.getComputedStyle(element);
      if(element.scrollHeight>element.clientHeight+2 &&
          /auto|scroll/.test(style.overflowY))return element;
      element=element.parentElement;
    }
    return hit?.document.querySelector('.list-panel') ||
      hit?.document.scrollingElement;
  }
  foldInteraction.addEventListener('click',event=>{
    const hit=hitPrimary(event);
    if(!hit?.document)return;
    const modal=hit.document.querySelector('#modalMount .dialog');
    if(modal){
      // Modals are modal even on the far visual pane. Resolve against the
      // VISIBLE pane's dialog rather than a torrent underneath it. Clicking
      // outside the dialog dismisses via the actual Tide overlay.
      const visual=hit.visualTarget;
      const inside=visual?.closest?.('#modalMount .dialog');
      const visibleControl=visual?.closest?.(
        '[data-action],[data-sort],[data-settings-tab],[data-appearance],'+
        'button,input,textarea,select');
      if(!inside){
        hit.document.getElementById('overlay')?.click();
        return;
      }
      if(visibleControl){
        let target=peerFor(visibleControl,hit.document);
        if(visibleControl.dataset.action==='dismiss'){
          target=hit.document.querySelector('#modalMount [data-action="dismiss"]');
        }
        if(!target && visibleControl.id){
          target=hit.document.getElementById(visibleControl.id);
        }
        if(target){
          if(target.matches('input,textarea,select'))target.focus();
          else target.click();
        }
      }
      return; // Never allow a modal tap to fall through to torrent cards.
    }
    if(!hit.target)return;
    const target=hit.target.closest(
      'button,input,textarea,a,[role="button"],[data-action],'+
      '[data-filter],[data-sort],[data-hash],.torrent-card')||hit.target;
    if(target.matches('input,textarea,[contenteditable]'))target.focus();
    else target.click();
  });
  foldInteraction.addEventListener('wheel',event=>{
    const hit=hitPrimary(event);
    if(!hit)return;
    event.preventDefault();
    const port=primaryScrollTarget(hit);
    if(!port)return;
    const factor=event.deltaMode===1?16:event.deltaMode===2?port.clientHeight:1;
    port.scrollTop+=event.deltaY*factor;
    port.scrollLeft+=event.deltaX*factor;
  },{passive:false});
  let drag=null;
  foldInteraction.addEventListener('pointerdown',event=>{
    if(event.pointerType==='mouse')return;
    drag={id:event.pointerId,lastY:event.clientY,lastX:event.clientX};
    foldInteraction.setPointerCapture?.(event.pointerId);
  });
  foldInteraction.addEventListener('pointermove',event=>{
    if(!drag || drag.id!==event.pointerId)return;
    const hit=hitPrimary(event);
    const port=hit&&primaryScrollTarget(hit);
    if(port){
      const bounds=foldInteraction.getBoundingClientRect();
      const factor=currentPose==='partially-folded-portrait'
        ?(.5*iframe.contentWindow.innerHeight/Math.max(1,bounds.height))
        :iframe.contentWindow.innerHeight/Math.max(1,bounds.height);
      port.scrollTop+=(drag.lastY-event.clientY)*factor;
    }
    drag.lastY=event.clientY;drag.lastX=event.clientX;
  });
  for(const name of ['pointerup','pointercancel','lostpointercapture']){
    foldInteraction.addEventListener(name,()=>{drag=null});
  }

  iframe.addEventListener('load',()=>{
    loaded=true;
    wireMirror(iframe,foldIframe);
    watchPrimaryModal();
    sendPose();
  });
  foldIframe.addEventListener('load',()=>{
    foldLoaded=true;
    wireMirror(foldIframe,iframe);
    sendPose();
    syncVisualModal();
  });
  get('resetDemo').addEventListener('click',()=>{
    loaded=false;foldLoaded=false;
    const url='app/index.html?demo=1&pose='+encodeURIComponent(currentPose)+'&reset='+Date.now();
    iframe.src=url;
    foldIframe.src=url;
  });
  window.addEventListener('resize',resizeFrame,{passive:true});
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(resizeFrame).observe(stage.parentElement);
  update();
})();