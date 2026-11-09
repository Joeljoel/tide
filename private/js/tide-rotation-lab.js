(() => {
  'use strict';
  // Temporary, local-only viewport diagnosis. This script does not send data,
  // store anything, or alter qBittorrent settings. It is not for release.
  const shell=document.getElementById('app');
  if(!shell)return;

  const style=document.createElement('style');
  style.textContent=[
    '#tideRotationLab{position:fixed;z-index:1000;left:12px;',
    'top:max(118px,calc(env(safe-area-inset-top,0px) + 84px));',
    'width:min(305px,calc(100vw - 24px));max-height:calc(100dvh - 140px);',
    'overflow:auto;overscroll-behavior:contain;padding:12px 13px;',
    'border:1px solid #7295a5;border-radius:16px;',
    'background:rgba(11,23,33,.96);color:#f5fbff;',
    'font:12px/1.35 -apple-system,system-ui,sans-serif;',
    'box-shadow:0 10px 28px rgba(0,0,0,.42);',
    '-webkit-backdrop-filter:none;backdrop-filter:none;pointer-events:auto}',
    '#tideRotationLab h3{font-size:14px;margin:0 0 4px;color:#c3f4df}',
    '#tideRotationLab p{font-size:11px;color:#d0dde4;margin:0 0 10px}',
    '#tideRotationLab .mode-buttons{display:flex;flex-wrap:wrap;gap:5px;margin:8px 0}',
    '#tideRotationLab button{font-size:11px;font-weight:700;border-radius:8px;',
    'padding:7px 8px;min-height:35px;background:#294657;color:#f2fcff;',
    'border:1px solid #6f8b9c}',
    '#tideRotationLab button[aria-pressed=true]{background:#a7efc9;color:#15342b}',
    '#tideRotationLab pre{font:10px/1.46 ui-monospace,SFMono-Regular,Menlo,monospace;',
    'white-space:pre-wrap;margin:8px 0;color:#e1ecf4}',
    '#tideRotationLab small{display:block;color:#c6d7e0;margin:8px 0}',
    '#rotationShellMarker{position:absolute;left:0;right:0;bottom:0;height:4px;',
    'background:#ff6686;z-index:999;pointer-events:none}',
    '#tideRootHeightProbe{position:fixed;left:-5000px;top:-5000px;',
    'width:1px;visibility:hidden;pointer-events:none}',
    'html[data-rotation-test=root-vh],html[data-rotation-test=all-vh],',
    'html[data-rotation-test=all-lvh]{height:100vh!important;min-height:100vh!important}',
    'html[data-rotation-test=root-vh] body,html[data-rotation-test=all-vh] body,',
    'html[data-rotation-test=all-lvh] body{height:100vh!important;min-height:100vh!important}',
    'html[data-rotation-test=all-vh] .shell{height:100vh!important}',
    'html[data-rotation-test=all-lvh] .shell{height:100lvh!important}',
    'html[data-rotation-test=plus-inset] .shell{',
    'height:calc(100dvh + env(safe-area-inset-top,0px))!important}',
    '@media (max-height:450px){#tideRotationLab{top:70px;max-height:calc(100dvh - 82px)}}'
  ].join('');
  document.head.appendChild(style);
  const marker=document.createElement('div');
  marker.id='rotationShellMarker';
  marker.setAttribute('aria-hidden','true');
  shell.appendChild(marker);

  const probe=document.createElement('div');
  probe.id='tideRootHeightProbe';
  probe.style.paddingTop='env(safe-area-inset-top,0px)';
  probe.style.paddingBottom='env(safe-area-inset-bottom,0px)';
  document.body.appendChild(probe);
  const unitProbes={};
  for(const unit of ['dvh','vh','lvh','svh']){
    const el=document.createElement('div');
    el.style.cssText='position:fixed;left:-6000px;top:-6000px;width:1px;visibility:hidden;pointer-events:none;height:100'+unit+';';
    document.body.appendChild(el);
    unitProbes[unit]=el;
  }
  const modes=[
    ['base','As installed'],
    ['root-vh','Root 100vh'],
    ['all-vh','All 100vh'],
    ['all-lvh','Shell 100lvh'],
    ['plus-inset','dvh + top inset']
  ];
  const panel=document.createElement('section');
  panel.id='tideRotationLab';
  panel.setAttribute('aria-label','Tide rotation viewport diagnostic');
  const buttons=modes.map(([key,label])=>'<button type="button" data-mode="'+key+'" aria-pressed="false">'+label+'</button>').join('');
  panel.innerHTML='<h3>ROTATION HEIGHT TEST</h3>'+
    '<p>The red line marks Tide’s shell bottom. Rotate landscape → portrait → landscape, then try each height mode.</p>'+
    '<div class="mode-buttons">'+buttons+'</div>'+
    '<pre id="tideRotationReadout">Measuring…</pre>'+
    '<button id="tideRotationCopy" type="button">Copy measurements</button>'+
    '<small id="tideRotationStatus">Temporary diagnostic. Nothing is uploaded.</small>';
  document.body.appendChild(panel);
  const pre=document.getElementById('tideRotationReadout');
  const status=document.getElementById('tideRotationStatus');
  let mode='base';
  let snapshot='';
  let rotationCount=0;
  const num=n=>Number.isFinite(n)?Math.round(n*10)/10:'?';
  function refresh(){
    if(document.hidden)return;
    const vv=window.visualViewport;
    const safe=getComputedStyle(probe);
    const shellRect=shell.getBoundingClientRect();
    const list=document.querySelector('.list-panel');
    const listRect=list?.getBoundingClientRect();
    const root=document.documentElement.getBoundingClientRect();
    const body=document.body.getBoundingClientRect();
    const units=Object.entries(unitProbes).map(([unit,el])=>unit+' '+num(el.getBoundingClientRect().height)).join(' · ');
    snapshot=[
      'Mode: '+mode+' · rotations: '+rotationCount,
      'Window: '+num(innerWidth)+' × '+num(innerHeight),
      'Screen: '+num(screen.width)+' × '+num(screen.height),
      'Outer H: '+num(outerHeight),
      'Visual H: '+num(vv?.height)+' + top '+num(vv?.offsetTop),
      'CSS: '+units,
      'Safe top/bottom: '+num(parseFloat(safe.paddingTop))+' / '+num(parseFloat(safe.paddingBottom)),
      'Root/body H: '+num(root.height)+' / '+num(body.height),
      'Shell H: '+num(shellRect.height)+' · bottom '+num(shellRect.bottom),
      'List bottom: '+num(listRect?.bottom),
      'Shell vs innerH: '+num(shellRect.bottom-innerHeight),
      'Orientation: '+(screen.orientation?.type||'?')
    ].join('\n');
    pre.textContent=snapshot;
  }
  function setMode(next){
    mode=next;
    document.documentElement.dataset.rotationTest=next;
    panel.querySelectorAll('[data-mode]').forEach(button=>{
      button.setAttribute('aria-pressed',String(button.dataset.mode===next));
    });
    refresh();
  }
  panel.querySelectorAll('[data-mode]').forEach(button=>{
    button.addEventListener('click',()=>setMode(button.dataset.mode));
  });
  document.getElementById('tideRotationCopy').addEventListener('click',async()=>{
    refresh();
    try{
      await navigator.clipboard.writeText('Tide standalone rotation diagnostics\n'+snapshot);
      status.textContent='Copied. Capture a second report after changing modes.';
    }catch{
      status.textContent='Clipboard unavailable. Take a screenshot of this panel.';
    }
  });
  window.addEventListener('resize',refresh,{passive:true});
  window.addEventListener('orientationchange',()=>{
    rotationCount++;
    refresh();
    requestAnimationFrame(refresh);
    setTimeout(refresh,450);
  },{passive:true});
  window.visualViewport?.addEventListener('resize',refresh,{passive:true});
  document.addEventListener('visibilitychange',refresh,{passive:true});
  setInterval(refresh,500);
  setMode('base');
})();
