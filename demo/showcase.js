(() => {
  'use strict';
  // CSS viewport dimensions measured on the user's Duo (not screenshot pixels).
  // Outer landscape is the measured outer portrait dimensions transposed.
  const poses={
    desktop:              {label:'Desktop',         width:1280,height:800},
    'folded-portrait':     {label:'Outer portrait',   width:466,height:678},
    'folded-landscape':    {label:'Outer landscape',  width:678,height:466},
    'unfolded-portrait':   {label:'Inner portrait',   width:669,height:951},
    'unfolded-landscape':  {label:'Inner landscape',  width:951,height:669},
    'split-left':          {label:'Split left',       width:951,height:669,split:true},
    'split-right':         {label:'Split right',      width:951,height:669,split:true}
  };
  const $=id=>document.getElementById(id);
  const stage=$('stage');
  const holder=$('frameHolder');
  const frame=$('deviceFrame');
  const preview=$('tidePreview');
  const poseButtons=[...document.querySelectorAll('[data-pose]')];
  let pose='desktop';
  let loaded=false;
  const radii={
    desktop:[19,19,19,19],
    'folded-portrait':[44,43,44,44],
    'folded-landscape':[43,45,44,43],
    'unfolded-portrait':[51,48,51,50],
    'unfolded-landscape':[50,47,49,49]
  };

  function sendPose(){
    if(!loaded || !preview.contentWindow)return;
    // Strict origin and a narrow message schema are checked in the iframe.
    preview.contentWindow.postMessage({type:'tide-demo-set-pose',pose},location.origin);
  }
  function layout(){
    const p=poses[pose];
    const border=p.split?0:(pose==='desktop'?7:6);
    const width=p.width+border*2,height=p.height+border*2;
    // Scaling transforms the device frame; the iframe retains its chosen
    // CSS pixel viewport and therefore its media-query breakpoints.
    const fitW=Math.max(90,stage.clientWidth-24);
    const fitH=Math.max(340,Math.min(830,window.innerHeight*1.3));
    const scale=Math.min(1,fitW/width,fitH/height);
    frame.style.width=width+'px';
    frame.style.height=height+'px';
    frame.style.borderWidth=border+'px';
    frame.style.transform='scale('+scale+')';
    frame.classList.toggle('is-split',!!p.split);
    frame.dataset.pose=pose;
    const rounded=radii[pose]||[44,44,44,44];
    ['tl','tr','br','bl'].forEach((key,i)=>frame.style.setProperty('--'+key,rounded[i]+'px'));
    holder.style.width=Math.ceil(width*scale)+'px';
    holder.style.height=Math.ceil(height*scale)+'px';
    stage.style.minHeight=Math.ceil(height*scale)+38+'px';
    $('selectedLabel').textContent=p.label;
    $('selectedDimensions').textContent=(p.split?'951 × 669 · 469 + 13 + 469':p.width+' × '+p.height)+' CSS px';
    $('scaleNote').textContent=scale<.999?Math.round(scale*100)+'%':'100%';
  }

  function choosePose(next){
    if(!Object.prototype.hasOwnProperty.call(poses,next))return;
    pose=next;
    for(const button of poseButtons)button.setAttribute('aria-pressed',String(button.dataset.pose===pose));
    layout();
    sendPose();
    // Iframe viewport dimensions may settle after this frame's resize.
    requestAnimationFrame(()=>{sendPose();requestAnimationFrame(sendPose);});
  }

  for(const button of poseButtons){
    button.addEventListener('click',()=>choosePose(button.dataset.pose));
  }
  preview.addEventListener('load',()=>{loaded=true;sendPose();});
  $('resetDemo').addEventListener('click',()=>{
    loaded=false;
    preview.src='app/index.html?demo=1&pose='+encodeURIComponent(pose)+'&reset='+Date.now();
  });
  window.addEventListener('resize',layout,{passive:true});
  if(typeof ResizeObserver!=='undefined'){
    // Observe parent rather than stage: stage height is set by layout(), and
    // observing it directly can create a ResizeObserver feedback cycle.
    new ResizeObserver(layout).observe(stage.parentElement);
  }
  choosePose('desktop');
})();
