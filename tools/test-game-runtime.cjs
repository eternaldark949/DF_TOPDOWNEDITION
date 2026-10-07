'use strict';
// Deterministic browser services for the Node regression runner.
// Executes the actual generated game script; it does not verify pixels or FPS.
// Events and timers run only when a test explicitly dispatches them.
const fs = require('fs'), vm = require('vm'), crypto=require('crypto');
function runtime(file,options={}) {
  const windowEvents=new Map(),pendingTimers=[];
  const counters={canvasCalls:0,timers:0,raf:0,clocks:0};
  const logs=[]; const warnings=[]; const errors=[];
  const trace=[];let traceEnabled=!!options.capture,elementIndex=0;
  const clean=v=>{
    if(v==null||typeof v!=='object')return v;
    if(v.commands)return {path:v.commands.map(c=>c.map(clean))};
    if(v._gradient)return {gradient:v._gradient,stops:v.stops.map(c=>c.slice())};
    if(v instanceof Element)return {canvas:v.id||v._probeID,width:v.width,height:v.height};
    if(v._imageDigest)return {image:v._imageDigest,width:v.naturalWidth,height:v.naturalHeight};
    if(ArrayBuffer.isView(v))return {typedArray:v.constructor.name,length:v.length,digest:crypto.createHash('sha1').update(Buffer.from(v.buffer,v.byteOffset,v.byteLength)).digest('hex')};
    if(Array.isArray(v))return v.map(clean);
    const out={};for(const k of Object.keys(v))if(k!=='_stack')out[k]=clean(v[k]);return out;
  };
  const record=(ctx,k,a)=>{if(traceEnabled)trace.push([ctx.canvas.id||ctx.canvas._probeID,k,...a.map(clean)]);};
  class DOMMatrix {
    constructor(v=[1,0,0,1,0,0]){[this.a,this.b,this.c,this.d,this.e,this.f]=v;}
    multiply(m){return new DOMMatrix([this.a*m.a+this.c*m.b,this.b*m.a+this.d*m.b,this.a*m.c+this.c*m.d,this.b*m.c+this.d*m.d,this.a*m.e+this.c*m.f+this.e,this.b*m.e+this.d*m.f+this.f]);}
    inverse(){const k=this.a*this.d-this.b*this.c;return new DOMMatrix([this.d/k,-this.b/k,-this.c/k,this.a/k,(this.c*this.f-this.d*this.e)/k,(this.b*this.e-this.a*this.f)/k]);}
    transformPoint(p){return {x:this.a*p.x+this.c*p.y+this.e,y:this.b*p.x+this.d*p.y+this.f};}
  }
  class CanvasRenderingContext2D {
    constructor(canvas) {this.canvas=canvas;this.globalAlpha=1;this.globalCompositeOperation='source-over';this.fillStyle='#000000';this.strokeStyle='#000000';this.lineWidth=1;this._matrix=new DOMMatrix();this._stack=[];return new Proxy(this,{set(o,k,v){o[k]=v;if(k!=='canvas'&&!k.startsWith('_'))record(o,'set',[k,v]);return true;}});}
    save(){record(this,'save',[]);const state={};for(const k of ['globalAlpha','globalCompositeOperation','fillStyle','strokeStyle','lineWidth','lineJoin','lineCap','font','textAlign','textBaseline','filter','shadowBlur','shadowColor','shadowOffsetX','shadowOffsetY'])state[k]=this[k];if(options.affine)state._matrix=this._matrix;this._stack.push(state);}
    restore(){record(this,'restore',[]);Object.assign(this,this._stack.pop()||{});}
    measureText(t){return {width:String(t).length*8,actualBoundingBoxLeft:0,actualBoundingBoxRight:String(t).length*8,actualBoundingBoxAscent:8,actualBoundingBoxDescent:2};}
    createLinearGradient(...a){return {_gradient:['linear',...a],stops:[],addColorStop(...s){this.stops.push(s);}};}
    createRadialGradient(...a){return {_gradient:['radial',...a],stops:[],addColorStop(...s){this.stops.push(s);}};}
    createConicGradient(...a){return {_gradient:['conic',...a],stops:[],addColorStop(...s){this.stops.push(s);}};}
    createPattern(){return {setTransform(){}};}
    getImageData(x,y,w,h){return {data:new Uint8ClampedArray(Math.max(0,w*h*4)),width:w,height:h};}
    createImageData(w,h){return this.getImageData(0,0,w,h);}
    getTransform(){return options.affine?new DOMMatrix([this._matrix.a,this._matrix.b,this._matrix.c,this._matrix.d,this._matrix.e,this._matrix.f]):new DOMMatrix();}
  }
  for(const k of ['beginPath','closePath','moveTo','lineTo','rect','roundRect','arc','arcTo','ellipse','bezierCurveTo','quadraticCurveTo','clip','fill','stroke','fillRect','strokeRect','clearRect','drawImage','fillText','strokeText','translate','rotate','scale','transform','setTransform','resetTransform','putImageData','setLineDash']) CanvasRenderingContext2D.prototype[k]=function(...a){counters.canvasCalls++;record(this,k,a);};
  if(options.affine)for(const k of ['translate','rotate','scale','transform','setTransform','resetTransform']) {
    const original=CanvasRenderingContext2D.prototype[k];
    CanvasRenderingContext2D.prototype[k]=function(...a){
      if(k==='translate')this._matrix=this._matrix.multiply(new DOMMatrix([1,0,0,1,a[0],a[1]]));
      else if(k==='rotate'){const c=Math.cos(a[0]),s=Math.sin(a[0]);this._matrix=this._matrix.multiply(new DOMMatrix([c,s,-s,c,0,0]));}
      else if(k==='scale')this._matrix=this._matrix.multiply(new DOMMatrix([a[0],0,0,a[1],0,0]));
      else if(k==='transform')this._matrix=this._matrix.multiply(new DOMMatrix(a));
      else if(k==='resetTransform')this._matrix=new DOMMatrix();
      else if(a.length===1&&typeof a[0]==='object'){const m=a[0];this._matrix=new DOMMatrix([m.a,m.b,m.c,m.d,m.e,m.f]);}
      else this._matrix=new DOMMatrix(a);
      return original.apply(this,a);
    };
  }
  CanvasRenderingContext2D.prototype.getLineDash=()=>[];
  class Node {
    constructor(){this._text='';this.parentNode=null;this.parentElement=null;this.children=[];this.childNodes=this.children;}
    get textContent(){return this._text;}
    set textContent(v){this._text=String(v);}
    appendChild(n){this.children.push(n);n.parentNode=this;n.parentElement=this;return n;}
    removeChild(n){this.children=this.children.filter(x=>x!==n);n.parentNode=null;n.parentElement=null;return n;}
    addEventListener(k,f){if(options.events){this._events ||= new Map();if(!this._events.has(k))this._events.set(k,[]);this._events.get(k).push(f);}} removeEventListener(){} dispatchEvent(e){for(const f of this._events?.get(e.type)||[])f(e);return true;}
  }
  class Element extends Node {
    constructor(tag='div'){super();this._probeID='element-'+(++elementIndex);this.tagName=tag.toUpperCase();this.style={setProperty(k,v){this[k]=v;},getPropertyValue(k){return this[k]||'';},removeProperty(k){delete this[k];}};this.dataset={};this.id='';this.value='';this._html='';this.attributes={};this.clientWidth=1280;this.clientHeight=720;this.offsetWidth=1280;this.offsetHeight=720;this.scrollHeight=720;this.scrollTop=0;this.width=1280;this.height=720;this._queries=new Map();const classes=new Set();this.classList={add(...cs){cs.forEach(c=>classes.add(c));},remove(...cs){cs.forEach(c=>classes.delete(c));},contains(c){return classes.has(c);},toggle(c,force){const on=force===undefined?!classes.has(c):!!force;on?classes.add(c):classes.delete(c);return on;}};}
    get innerHTML(){return this._html;} set innerHTML(v){this._html=String(v);}
    getContext(){return this._ctx||(this._ctx=new CanvasRenderingContext2D(this));}
    querySelector(q){if(!this._queries.has(q))this._queries.set(q,new Element(q.includes('canvas')||q.includes('spark')?'canvas':'div'));return this._queries.get(q);}
    querySelectorAll(){return [];}
    getBoundingClientRect(){return {x:0,y:0,left:0,top:0,right:1280,bottom:720,width:1280,height:720};}
    setAttribute(k,v){this.attributes[k]=String(v);} getAttribute(k){return this.attributes[k]??null;} removeAttribute(k){delete this.attributes[k];}
    insertAdjacentHTML(){} remove(){if(this.parentNode)this.parentNode.removeChild(this);} focus(){} blur(){} click(){} scrollIntoView(){} scrollTo(){} setPointerCapture(){} releasePointerCapture(){} hasPointerCapture(){return false;} matches(){return false;} closest(){return null;} contains(n){return this.children.includes(n);} requestFullscreen(){return Promise.resolve();}
    toDataURL(){return 'data:image/png;base64,';}
  }
  class Path2D{constructor(p){this.commands=p?.commands?p.commands.slice():[];}};
  for(const k of ['moveTo','lineTo','closePath','rect','roundRect','arc','arcTo','ellipse','bezierCurveTo','quadraticCurveTo','addPath'])Path2D.prototype[k]=function(...a){this.commands.push([k,...a]);};
  const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(){},setValueCurveAtTime(){},cancelScheduledValues(){}});
  function audioNode(){return {connect(){return this;},disconnect(){},start(){},stop(){},addEventListener(){},removeEventListener(){},gain:param(),frequency:param(),detune:param(),Q:param(),threshold:param(),knee:param(),ratio:param(),attack:param(),release:param(),pan:param(),playbackRate:param(),delayTime:param()};}
  class AudioContext {
    constructor(){this.state='suspended';this.currentTime=0;this.sampleRate=48000;this.destination=audioNode();}
    resume(){this.state='running';return Promise.resolve();} suspend(){this.state='suspended';return Promise.resolve();}
    createBuffer(ch,len,rate){return {duration:len/rate,length:len,numberOfChannels:ch,sampleRate:rate,getChannelData(){return new Float32Array(len);}};}
    decodeAudioData(){return Promise.resolve(this.createBuffer(1,480,48000));}
    createPeriodicWave(){return {};}
  }
  for(const k of ['createGain','createOscillator','createBufferSource','createBiquadFilter','createDynamicsCompressor','createStereoPanner','createDelay','createWaveShaper','createConvolver','createAnalyser','createMediaElementSource'])AudioContext.prototype[k]=audioNode;
  const ids=new Map(); const body=new Element('body'),head=new Element('head'),documentElement=new Element('html');
  const document={body,head,documentElement,hidden:false,activeElement:null,fullscreenElement:null,
    getElementById(id){if(id==null)return null;id=String(id);if(!ids.has(id)){const e=new Element(id.includes('canvas')?'canvas':'div');e.id=id;ids.set(id,e);}return ids.get(id);},
    createElement(tag){return new Element(tag);},createTextNode(t){const n=new Node();n.textContent=t;return n;},querySelector(q){return documentElement.querySelector(q);},querySelectorAll(){return [];},
    addEventListener(){},removeEventListener(){},fonts:{check(){return true;},ready:Promise.resolve(),addEventListener(){}},exitFullscreen(){return Promise.resolve();}};
  const saved=new Map(); const localStorage={getItem(k){return saved.get(k)??null;},setItem(k,v){saved.set(k,String(v));},removeItem(k){saved.delete(k);},clear(){saved.clear();}};
  let randomSeed=0x13a966dc;const math=Object.create(Math);math.random=()=>{randomSeed=(Math.imul(randomSeed,1664525)+1013904223)|0;return (randomSeed>>>0)/4294967296;};
  class FixedDate extends Date {constructor(...a){super(...(a.length?a:[1790985600000]));}static now(){return 1790985600000;}}
  const scope={document,localStorage,sessionStorage:localStorage,Node,Element,HTMLElement:Element,HTMLCanvasElement:Element,CanvasRenderingContext2D,Path2D,DOMMatrix,AudioContext,webkitAudioContext:AudioContext,
    Math:math,Date:FixedDate,
    Image:class {constructor(){this.complete=true;this.naturalWidth=64;this.naturalHeight=64;this.width=64;this.height=64;}set src(v){this._src=v;this._imageDigest=crypto.createHash('sha1').update(v).digest('hex');}get src(){return this._src;}addEventListener(){}},
    Audio:class extends Element {constructor(){super('audio');this.paused=true;this.currentTime=0;this.duration=0;this.readyState=4;this.volume=1;}play(){this.paused=false;return Promise.resolve();}pause(){this.paused=true;}load(){}canPlayType(){return 'probably';}},
    MutationObserver:class{observe(){}disconnect(){}},ResizeObserver:class{observe(){}disconnect(){}},
    navigator:{userAgent:'DFAB node VM integration probe',maxTouchPoints:0,hardwareConcurrency:8,platform:'Linux'},screen:{width:1280,height:720,orientation:{type:'landscape-primary',lock(){return Promise.resolve();},addEventListener(){}}},
    innerWidth:1280,innerHeight:720,devicePixelRatio:1,location:{href:'file:///DFAB.html',search:'',protocol:'file:'},
    performance:{now(){counters.clocks++;return 1000;}},
    console:{log(...a){logs.push(a.map(String).join(' '));},warn(...a){warnings.push(a.map(String).join(' '));},error(...a){errors.push(a.map(String).join(' '));},table(){},time(){},timeEnd(){}},
    addEventListener(k,f){if(options.events){if(!windowEvents.has(k))windowEvents.set(k,[]);windowEvents.get(k).push(f);}},removeEventListener(){},matchMedia(){return {matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}};},getComputedStyle(el){return el.style;},
    requestAnimationFrame(){return ++counters.raf;},cancelAnimationFrame(){},setTimeout(f,ms){if(options.timers)pendingTimers.push({f,ms});return ++counters.timers;},clearTimeout(){},setInterval(){return ++counters.timers;},clearInterval(){},
    atob:s=>Buffer.from(s,'base64').toString('binary'),btoa:s=>Buffer.from(s,'binary').toString('base64'),URL,URLSearchParams,Blob,TextEncoder,TextDecoder,Event:class{},CustomEvent:class{},fetch(){return Promise.reject(new Error('Network disabled for integration probe'));},structuredClone,queueMicrotask(){},
    confirm(){return true;},alert(){},prompt(){return null;},};
  scope.window=scope;scope.self=scope;scope.globalThis=scope;
  vm.createContext(scope);
  const html=fs.readFileSync(file,'utf8');const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
  vm.runInContext(scripts.join('\n')+'\n;globalThis.__probe={game,GameSettings,MAPS:MAP_DATA,PerfBench,DevOverlay,RenderStats};',scope,{filename:file,timeout:30000});
  return {scope,probe:scope.__probe,counters,logs,warnings,errors,trace,pendingTimers,dispatchWindow(e){for(const f of windowEvents.get(e.type)||[])f(e);},setTrace(on){traceEnabled=on;trace.length=0;},run(source){return vm.runInContext(source,scope,{timeout:30000});}};
}
module.exports={runtime};
