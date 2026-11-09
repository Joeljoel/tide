(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const poses={
    'desktop':{label:'Desktop',width:1280,height:800},
    'folded-portrait':{label:'Outer · portrait',width:382,height:720},
    'folded-landscape':{label:'Outer · landscape',width:590,height:382},
    'unfolded-portrait':{label:'Inner · portrait',width:669,height:951},
    'unfolded-landscape':{label:'Inner · landscape',width:951,height:669},
    'split-left':{label:'Split View · left',width:469,height:669},
    'split-right':{label:'Split View · right',width:469,height:669}
  };
  const stage=$('stage'),holder=$('frameHolder'),frame=$('deviceFrame'),iframe=$('tidePreview');
  const chooser=[...document.querySelectorAll('[data-pose]')];
  let active='desktop';
  let frameLoaded=false;

  function sendPose(){
    if(!frameLoaded || !iframe.contentWindow)return;
    iframe.contentWindow.postMessage({type:'tide-demo-set-pose',pose:active},location.origin);
  }

  function layout(){
    const p=poses[active],border=active==='desktop'?8:7;
    const w=p.width+border*2,h=p.height+border*2;
    const available=Math.max(160,stage.clientWidth-32);
    const scale=Math.min(1,available/w,770/h);
    const realW=Math.round(w*scale),realH=Math.round(h*scale);
    holder.style.width=realW+'px';
    holder.style.height=realH+'px';
    frame.style.width=w+'px';
    frame.style.height=h+'px';
    frame.style.transform='scale('+scale+')';
    frame.classList.toggle('mobile',active!=='desktop');
    stage.style.minHeight=Math.max(realH+48,180)+'px';
    $('scaleNote').textContent=scale<.999?'Preview at '+Math.round(scale*100)+'% scale':'Preview at actual CSS size';
    $('frameInfo').textContent=p.label+' · '+p.width+' × '+p.height+' CSS px';
    $('selectedLabel').textContent=p.label;
    $('selectedDimensions').textContent=p.width+' × '+p.height;
  }

  function choosePose(pose){
    if(!poses[pose])return;
    active=pose;
    for(const button of chooser){
      const selected=button.dataset.pose===pose;
      button.classList.toggle('active',selected);
      button.setAttribute('aria-pressed',String(selected));
    }
    layout();
    // The iframe's viewport resize can arrive after its message event.
    // The generated demo repeats geometry measurements after the resize.
    sendPose();
  }

  for(const button of chooser){
    button.addEventListener('click',()=>choosePose(button.dataset.pose));
  }
  iframe.addEventListener('load',()=>{
    frameLoaded=true;
    sendPose();
  });
  $('resetDemo').addEventListener('click',()=>{
    // The iframe stores only demo state. Reloading restores the built-in
    // example torrents; the selected pose stays as it is.
    frameLoaded=false;
    iframe.src='app/index.html?demo=1&pose='+encodeURIComponent(active)+'&restart='+Date.now();
  });
  if(typeof ResizeObserver!=='undefined'){
    new ResizeObserver(layout).observe(stage);
  }else{
    window.addEventListener('resize',layout,{passive:true});
  }
  layout();
})();
