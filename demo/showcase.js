(() => {
  'use strict';
  // Physical Duo viewport dimensions measured in CSS px. The full device
  // is rendered for Split View: 469 + 13 (open seam) + 469 = 951.
  const poses={
    desktop:{label:'Desktop',width:1280,height:800},
    'folded-portrait':{label:'Outer · portrait',width:466,height:678},
    'folded-landscape':{label:'Outer · landscape',width:678,height:466},
    'unfolded-portrait':{label:'Inner · portrait',width:669,height:951},
    'unfolded-landscape':{label:'Inner · landscape',width:951,height:669},
    'split-left':{label:'Split View · Tide left',width:951,height:669,split:true},
    'split-right':{label:'Split View · Tide right',width:951,height:669,split:true}
  };
  const get=id=>document.getElementById(id);
  const stage=get('stage'),holder=get('frameHolder'),frame=get('deviceFrame'),iframe=get('tidePreview');
  const desktopBtn=get('desktopBtn'),duoBtn=get('duoBtn'),duoChoices=get('duoChoices');
  const foldBtn=get('foldBtn'),rotateBtn=get('rotateBtn'),splitBtn=get('splitBtn'),shiftBtn=get('shiftBtn');
  let device='desktop',folded=false,orientation='landscape',split=false,side='left',loaded=false;
  let currentPose='desktop';

  function selectedPose(){
    if(device==='desktop')return 'desktop';
    if(folded)return 'folded-'+orientation;
    if(orientation==='portrait')return 'unfolded-portrait';
    return split?'split-'+side:'unfolded-landscape';
  }

  function sendPose(){
    if(!loaded||!iframe.contentWindow)return;
    iframe.contentWindow.postMessage({type:'tide-demo-set-pose',pose:currentPose},location.origin);
  }

  function resizeFrame(){
    const config=poses[currentPose];
    const border=config.split?0:device==='desktop'?6:5;
    const w=config.width+border*2,h=config.height+border*2;
    const maximumW=Math.max(110,stage.clientWidth-20);
    const maximumH=Math.max(350,Math.min(930,window.innerHeight*1.5));
    const scale=Math.min(1,maximumW/w,maximumH/h);
    frame.style.width=w+'px';
    frame.style.height=h+'px';
    frame.style.borderWidth=border+'px';
    frame.style.transform='scale('+scale+')';
    frame.dataset.pose=currentPose;
    frame.classList.toggle('is-split',!!config.split);
    // The outer panel is a D, not a rounded rectangle. Rotating it clockwise
    // moves its two large-radius corners from right to bottom.
    const radii=currentPose==='folded-portrait'?[9,73,73,9]:
      currentPose==='folded-landscape'?[9,9,73,73]:
      currentPose==='desktop'?[18,18,18,18]:
      currentPose==='unfolded-portrait'?[53,51,51,53]:[51,51,51,51];
    ['tl','tr','br','bl'].forEach((name,i)=>frame.style.setProperty('--'+name,radii[i]+'px'));
    holder.style.width=Math.ceil(w*scale)+'px';
    holder.style.height=Math.ceil(h*scale)+'px';
    stage.style.minHeight=Math.ceil(h*scale)+38+'px';
    get('poseName').textContent=config.label;
    get('poseDimensions').textContent=config.split?'469 + 13 + 469 × 669':config.width+' × '+config.height;
  }

  function update(){
    if(device!=='duo'||folded||orientation!=='landscape')split=false;
    currentPose=selectedPose();
    desktopBtn.setAttribute('aria-pressed',String(device==='desktop'));
    duoBtn.setAttribute('aria-pressed',String(device==='duo'));
    duoChoices.hidden=device!=='duo';
    foldBtn.textContent=folded?'Unfold':'Fold';
    foldBtn.setAttribute('aria-pressed',String(folded));
    rotateBtn.setAttribute('aria-label','Rotate '+(orientation==='portrait'?'to landscape':'to portrait'));
    splitBtn.hidden=folded||orientation!=='landscape';
    splitBtn.textContent=split?'Unsplit':'Split';
    splitBtn.setAttribute('aria-pressed',String(split));
    shiftBtn.hidden=!split;
    shiftBtn.textContent=side==='left'?'Move Tide right':'Move Tide left';
    resizeFrame();
    sendPose();
    // The iframe can change size after the initial postMessage. Reapply pose
    // after browser layout settles, without reloading or losing sample state.
    requestAnimationFrame(()=>{sendPose();requestAnimationFrame(sendPose);});
  }

  desktopBtn.addEventListener('click',()=>{device='desktop';update();});
  duoBtn.addEventListener('click',()=>{device='duo';update();});
  foldBtn.addEventListener('click',()=>{folded=!folded;update();});
  rotateBtn.addEventListener('click',()=>{
    orientation=orientation==='portrait'?'landscape':'portrait';
    update();
  });
  splitBtn.addEventListener('click',()=>{split=!split;update();});
  shiftBtn.addEventListener('click',()=>{side=side==='left'?'right':'left';update();});
  iframe.addEventListener('load',()=>{loaded=true;sendPose();});
  get('resetDemo').addEventListener('click',()=>{
    loaded=false;
    iframe.src='app/index.html?demo=1&pose='+encodeURIComponent(currentPose)+'&reset='+Date.now();
  });
  window.addEventListener('resize',resizeFrame,{passive:true});
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(resizeFrame).observe(stage.parentElement);
  update();
})();