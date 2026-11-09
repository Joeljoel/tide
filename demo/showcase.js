(() => {
  'use strict';
  // Split View shares the full unfolded landscape viewport.
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
  const screen=get('deviceScreen'),tide=get('tidePanel'),home=get('homePanel');
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  const desktopBtn=get('desktopBtn'),duoBtn=get('duoBtn'),duoChoices=get('duoChoices');
  const foldBtn=get('foldBtn'),rotateBtn=get('rotateBtn'),splitBtn=get('splitBtn'),shiftBtn=get('shiftBtn');
  let device='desktop',folded=true,orientation='portrait',split=false,side='left',loaded=false;
  let transitioning=false;
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
    const desktop=currentPose==='desktop';
    // Equal physical length along the hinge, including the bezel. Keep the
    // measured app viewport sizes and absorb the 9px difference in the frame.
    const bezel=desktop?6:5;
    const extraX=currentPose==='unfolded-portrait'?9:0;
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
    get('poseDimensions').textContent=config.width+' × '+config.height;
  }

  function showPose(pose){
    currentPose=pose;
    resizeFrame();
    sendPose();
    // The iframe keeps its state. Reapply the pose after its viewport settles.
    requestAnimationFrame(()=>{sendPose();requestAnimationFrame(sendPose);});
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

  async function hinge(nextPose){
    const opening=nextPose==='unfolded-landscape';
    if(opening)showPose(nextPose);
    // The left pane stays full height while the right half turns on its
    // vertical hinge. Clip the display to the projected edge of that flap.
    const seam='inset(0 50% 0 0 round 9px 38px 38px 9px)';
    const open='inset(0 0 0 0 round 51px)';
    const centerFold=shift=>'translate(-50%,-50%) scale(var(--device-scale)) translateX('+shift+'%)';
    const clipFrames=[
      {clipPath:seam,transform:centerFold(25),offset:0},
      {clipPath:'inset(0 15% 0 0 round 31px 47px 47px 31px)',transform:centerFold(7.5),offset:.45},
      {clipPath:open,transform:centerFold(0),offset:1}
    ];
    const flapFrames=[
      {transform:'rotateY(-90deg)',opacity:1},
      {transform:'rotateY(0deg)',opacity:0}
    ];
    const shade=get('foldShade');
    shade.hidden=false;
    const duration=opening?350:300;
    const clip=play(frame,opening?clipFrames:clipFrames.slice().reverse().map(key=>({...key,offset:1-key.offset})),duration);
    const flap=play(shade,opening?flapFrames:flapFrames.slice().reverse(),duration);
    await Promise.all([clip.finished,flap.finished]);
    if(!opening)showPose(nextPose);
    clip.cancel();
    flap.cancel();
    shade.hidden=true;
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
      else if(kind==='fold'){
        // Align the hinge first when folding or opening from a rotated pose.
        const aligned=folded?'unfolded-landscape':'folded-portrait';
        if(currentPose.startsWith('split-'))await slide(aligned,'split');
        else if(currentPose!==aligned)await turn(aligned);
        await hinge(nextPose);
      }else await slide(nextPose,kind);
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
    foldBtn.textContent=folded?'Unfold':'Fold';
    foldBtn.setAttribute('aria-pressed',String(folded));
    rotateBtn.setAttribute('aria-label','Rotate '+(orientation==='portrait'?'to landscape':'to portrait'));
    splitBtn.hidden=folded||orientation!=='landscape';
    splitBtn.textContent=split?'Unsplit':'Split';
    splitBtn.setAttribute('aria-pressed',String(split));
    shiftBtn.hidden=!split;
    shiftBtn.textContent=side==='left'?'Move Tide right':'Move Tide left';
  }

  desktopBtn.addEventListener('click',()=>transition('switch',()=>{device='desktop';}));
  duoBtn.addEventListener('click',()=>transition('switch',()=>{
    if(device==='duo')return;
    device='duo';
    folded=true;
    orientation='portrait';
    split=false;
    side='left';
  }));
  foldBtn.addEventListener('click',()=>transition('fold',()=>{
    folded=!folded;
    orientation=folded?'portrait':'landscape';
    split=false;
  }));
  rotateBtn.addEventListener('click',()=>transition('rotate',()=>{
    orientation=orientation==='portrait'?'landscape':'portrait';
    split=false;
  }));
  splitBtn.addEventListener('click',()=>transition('split',()=>{split=!split;}));
  shiftBtn.addEventListener('click',()=>transition('shift',()=>{side=side==='left'?'right':'left';}));
  iframe.addEventListener('load',()=>{loaded=true;sendPose();});
  get('resetDemo').addEventListener('click',()=>{
    loaded=false;
    iframe.src='app/index.html?demo=1&pose='+encodeURIComponent(currentPose)+'&reset='+Date.now();
  });
  window.addEventListener('resize',resizeFrame,{passive:true});
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(resizeFrame).observe(stage.parentElement);
  update();
})();