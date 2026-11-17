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
    // Equal physical length along the hinge, including the bezel. Keep the
    // measured app viewport sizes and absorb the 9px difference in the frame.
    const bezel=desktop?6:5;
    const extraX=currentPose.endsWith('portrait') && !currentPose.startsWith('folded-')?9:0;
    const extraY=config.width===951?9:0;
    const w=config.width+bezel*2+extraX,h=config.height+bezel*2+extraY;
    const maximumW=Math.max(110,stage.clientWidth-20);
    const maximumH=Math.max(350,Math.min(970,window.innerHeight*1.5));
    // Use a common scale for every Duo pose, including the swept rotation.
    const duoDiagonal=Math.hypot(961,688);
    const scale=desktop?Math.min(1,maximumW/w,maximumH/h):
      Math.min(1,maximumW/duoDiagonal,maximumH/961);
    frame.style.width=w+'px';
    frame.style.height=h+'px';
    frame.style.borderWidth=[bezel+Math.floor(extraY/2),bezel+Math.ceil(extraX/2),
      bezel+Math.ceil(extraY/2),bezel+Math.floor(extraX/2)].map(value=>value+'px').join(' ');
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
    ['tl','tr','br','bl'].forEach((name,i)=>frame.style.setProperty('--'+name,radii[i]+'px'));
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

  // Animate the two physical wrappers about the hinge. Both inner Tide
  // iframes remain flat and clipped; portrait uses a gentler upper-plane bend.
  async function foldTransition(nextPose){
    const entering=nextPose.startsWith('partially-folded-');
    const leaving=currentPose.startsWith('partially-folded-');
    const portrait=(entering?nextPose:currentPose).endsWith('portrait');
    const open='rotate'+(portrait?'X':'Y')+'(0deg)';
    const firstBend=portrait?'rotateX(-6deg)':'rotateY(10deg)';
    const secondBend=portrait?'rotateX(10deg)':'rotateY(-10deg)';
    if(entering){
      showPose(nextPose);
      const motions=[
        play(nearPlane,[{transform:open},{transform:firstBend}],330),
        play(foldFlap,[{transform:open},{transform:secondBend}],330)
      ];
      await Promise.all(motions.map(motion=>motion.finished));
      motions.forEach(motion=>motion.cancel());
    }else if(leaving){
      const motions=[
        play(nearPlane,[{transform:firstBend},{transform:open}],290),
        play(foldFlap,[{transform:secondBend},{transform:open}],290)
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
    const peer=peerScrollport(source,peerDoc);
    if(!peer)return;
    const fromMax=Math.max(0,source.scrollHeight-source.clientHeight);
    const toMax=Math.max(0,peer.scrollHeight-peer.clientHeight);
    const destY=fromMax>0?source.scrollTop/fromMax*toMax:source.scrollTop;
    const fromX=Math.max(0,source.scrollWidth-source.clientWidth);
    const toX=Math.max(0,peer.scrollWidth-peer.clientWidth);
    const destX=fromX>0?source.scrollLeft/fromX*toX:source.scrollLeft;
    if(Math.abs(peer.scrollTop-destY)>.75)peer.scrollTop=destY;
    if(Math.abs(peer.scrollLeft-destX)>.75)peer.scrollLeft=destX;
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
      const peer=to.contentDocument && peerFor(event.target,to.contentDocument);
      if(!peer)return;
      mirroring=true;
      try{peer.click();}finally{mirroring=false;}
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
  iframe.addEventListener('load',()=>{
    loaded=true;
    wireMirror(iframe,foldIframe);
    sendPose();
  });
  foldIframe.addEventListener('load',()=>{
    foldLoaded=true;
    wireMirror(foldIframe,iframe);
    sendPose();
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