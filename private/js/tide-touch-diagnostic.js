(() => {
  'use strict';
  // Temporary on-device input diagnostic. No requests, recording, analytics,
  // persistence, or torrent data access. Only button geometry and event types.
  const gear=document.querySelector('.header-settings-button');
  if(!gear)return;
  const style=document.createElement('style');
  style.textContent=[
    '#tide-hit-diagnostic{position:fixed;left:12px;bottom:max(95px,calc(env(safe-area-inset-bottom,0px) + 90px));',
    'z-index:90;max-width:290px;width:calc(100vw - 24px);padding:12px;border-radius:14px;',
    'background:rgba(15,23,34,.96);color:#f1f7fa;border:1px solid #90a3b6;',
    'box-shadow:0 8px 28px rgba(0,0,0,.32);font:12px/1.35 -apple-system,system-ui,sans-serif;',
    'pointer-events:auto;-webkit-backdrop-filter:none;backdrop-filter:none;}',
    '#tide-hit-diagnostic h3{margin:0 0 7px;font-size:14px;color:#bcead3;}',
    '#tide-hit-diagnostic pre{font:11px/1.5 ui-monospace,Menlo,monospace;',
    'margin:0 0 9px;white-space:pre-wrap;color:#e5eef6;}',
    '#tide-hit-diagnostic button{display:inline-block;margin:3px 4px 3px 0;padding:8px 9px;',
    'font-size:12px;font-weight:600;border-radius:9px;background:#dce8f0;color:#172e3c;',
    'border:1px solid #f5fcff;min-height:35px;}',
    '@media (max-width:474px),(orientation:landscape){#tide-hit-diagnostic{display:none!important;}}',
    'body.tide-desktop #tide-hit-diagnostic,',
    'body:has(.tide-settings-dialog) #tide-hit-diagnostic{display:none!important;}',
    'body.tide-debug-no-blur .topbar,body.tide-debug-no-blur .header-settings-button{',
    '-webkit-backdrop-filter:none!important;backdrop-filter:none!important;',
    'filter:none!important;}'
  ].join('');
  document.head.appendChild(style);
  const panel=document.createElement('aside');
  panel.id='tide-hit-diagnostic';
  panel.setAttribute('aria-label','Temporary Settings touch diagnostic');
  panel.innerHTML='<h3>Tide touch diagnostic</h3><pre id="tide-hit-readout">Preparing…</pre>'+
    '<button type="button" id="tide-hit-open">Open Settings test</button>'+
    '<button type="button" id="tide-hit-blur">Blur: ON</button>';
  document.body.appendChild(panel);
  const pre=panel.querySelector('#tide-hit-readout');
  const blurBtn=panel.querySelector('#tide-hit-blur');
  const counts={touch:0,pointer:0,click:0,gearTouch:0,gearPointer:0,gearClick:0};
  let last='No input seen';
  const desc=node=>{
    if(!node||node.nodeType!==1)return String(node?.nodeName||'?');
    const className=typeof node.className==='string'?node.className.split(/\s+/).filter(Boolean)[0]:'';
    return node.tagName.toLowerCase()+(node.id?'#'+node.id:className?'.'+className:'');
  };
  const rect=()=>gear.getBoundingClientRect();
  const inside=(x,y)=>{
    const r=rect(),p=5;
    return x>=r.left-p&&x<=r.right+p&&y>=r.top-p&&y<=r.bottom+p;
  };
  const paint=()=>{
    const r=rect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
    const hit=document.elementFromPoint(cx,cy);
    pre.textContent='Touch starts: '+counts.touch+' (gear '+counts.gearTouch+')\n'+
      'Pointer downs: '+counts.pointer+' (gear '+counts.gearPointer+')\n'+
      'Clicks: '+counts.click+' (gear '+counts.gearClick+')\n'+
      'Last: '+last+'\n'+
      'Gear centre: '+Math.round(cx)+','+Math.round(cy)+' → '+desc(hit)+'\n'+
      'Settings modal: '+(!!document.querySelector('.tide-settings-dialog')?'open':'closed');
  };
  const record=(type,x,y,target)=>{
    const inGear=inside(x,y);
    counts[type]++;
    if(inGear)counts[type==='touch'?'gearTouch':type==='pointer'?'gearPointer':'gearClick']++;
    last=type+' '+Math.round(x)+','+Math.round(y)+(inGear?' [GEAR]':'')+' '+desc(target);
    paint();
  };
  window.addEventListener('touchstart',e=>{
    if(e.touches.length===1)record('touch',e.touches[0].clientX,e.touches[0].clientY,e.target);
  },{capture:true,passive:true});
  window.addEventListener('pointerdown',e=>record('pointer',e.clientX,e.clientY,e.target),{capture:true,passive:true});
  window.addEventListener('click',e=>{
    if(e.detail>0)record('click',e.clientX,e.clientY,e.target);
  },true);
  panel.querySelector('#tide-hit-open').addEventListener('click',()=>{
    gear.click();
    requestAnimationFrame(paint);
  });
  blurBtn.addEventListener('click',()=>{
    const flat=document.body.classList.toggle('tide-debug-no-blur');
    blurBtn.textContent=flat?'Blur: OFF':'Blur: ON';
    paint();
  });
  window.addEventListener('resize',paint,{passive:true});
  window.addEventListener('orientationchange',paint,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)paint();});
  paint();
})();