/* ========================================================
   QUANTUM TELEPORTATION VISUALIZER — JS Engine
   Simulates the 3-qubit teleportation protocol in-browser
   + Web Serial API for Arduino hardware control
   ======================================================== */

// ---- Particle Background ----
(function initParticles() {
  const c = document.getElementById('particles-canvas');
  const ctx = c.getContext('2d');
  let W, H, particles = [];
  function resize() { W = c.width = window.innerWidth; H = c.height = window.innerHeight; }
  window.addEventListener('resize', resize); resize();
  for (let i = 0; i < 60; i++) particles.push({ x: Math.random()*W, y: Math.random()*H, r: Math.random()*2+.5, dx: (Math.random()-.5)*.3, dy: (Math.random()-.5)*.3, o: Math.random()*.5+.2 });
  (function draw() {
    ctx.clearRect(0,0,W,H);
    particles.forEach(p => {
      p.x += p.dx; p.y += p.dy;
      if(p.x<0) p.x=W; if(p.x>W) p.x=0; if(p.y<0) p.y=H; if(p.y>H) p.y=0;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.fillStyle = `rgba(124,92,255,${p.o})`; ctx.fill();
    });
    requestAnimationFrame(draw);
  })();
})();

// ==========================
// WEB SERIAL API — ARDUINO
// ==========================
let serialPort = null;
let serialWriter = null;

async function connectArduino() {
  if (!('serial' in navigator)) {
    alert('Web Serial API is not supported in this browser.\nPlease use Google Chrome or Microsoft Edge.');
    return;
  }
  try {
    serialPort = await navigator.serial.requestPort();
    await serialPort.open({ baudRate: 9600 });
    serialWriter = serialPort.writable.getWriter();

    // Update UI
    document.getElementById('serial-btn').classList.add('connected');
    document.getElementById('serial-btn').innerHTML = '<span class="btn-icon">✓</span> Connected';
    const badge = document.getElementById('serial-status');
    badge.className = 'serial-badge connected';
    badge.textContent = 'Arduino Connected';
    console.log('✅ Serial connection established');
  } catch (err) {
    console.error('Serial connection failed:', err);
    alert('Could not connect to Arduino.\nMake sure it is plugged in and no other program is using the port.');
  }
}

async function sendToArduino(data) {
  if (!serialWriter) return;
  try {
    const encoder = new TextEncoder();
    await serialWriter.write(encoder.encode(data + '\n'));
    console.log('📡 Sent to Arduino:', data);
  } catch (err) {
    console.error('Serial write error:', err);
  }
}

// ---- Complex Number Helpers ----
const cx = (re,im=0) => ({re,im});
const cxAdd = (a,b) => cx(a.re+b.re, a.im+b.im);
const cxSub = (a,b) => cx(a.re-b.re, a.im-b.im);
const cxMul = (a,b) => cx(a.re*b.re - a.im*b.im, a.re*b.im + a.im*b.re);
const cxScale = (a,s) => cx(a.re*s, a.im*s);
const cxNorm2 = a => a.re*a.re + a.im*a.im;
const SQRT2_INV = 1/Math.sqrt(2);
const ZERO = cx(0); const ONE = cx(1);

// ---- State Vector (8 amplitudes for 3 qubits) ----
function newState() { let s = Array(8).fill(null).map(()=>cx(0)); s[0]=cx(1); return s; }

// ---- Gate Operations ----
function applyH(state, qubit) {
  const n = 3, mask = 1 << (n-1-qubit), out = state.map(s=>cx(s.re,s.im));
  for (let i=0; i<8; i++) {
    if (i & mask) continue;
    const j = i | mask;
    const a = state[i], b = state[j];
    out[i] = cxScale(cxAdd(a,b), SQRT2_INV);
    out[j] = cxScale(cxSub(a,b), SQRT2_INV);
  }
  return out;
}
function applyCNOT(state, ctrl, tgt) {
  const n=3, cm=1<<(n-1-ctrl), tm=1<<(n-1-tgt), out=state.map(s=>cx(s.re,s.im));
  for(let i=0;i<8;i++){
    if((i&cm)&&!(i&tm)){
      const j=i|tm;
      out[i]=state[j]; out[j]=state[i];
    }
  }
  return out;
}
function applyCZ(state, ctrl, tgt) {
  const n=3, cm=1<<(n-1-ctrl), tm=1<<(n-1-tgt), out=state.map(s=>cx(s.re,s.im));
  for(let i=0;i<8;i++){
    if((i&cm)&&(i&tm)) out[i]=cxScale(state[i],-1);
  }
  return out;
}

// ---- Measurement (simulated) ----
function measure(state, qubit) {
  const n=3, mask=1<<(n-1-qubit);
  let p0=0;
  for(let i=0;i<8;i++) if(!(i&mask)) p0+=cxNorm2(state[i]);
  const outcome = Math.random() < p0 ? 0 : 1;
  const out = state.map(()=>cx(0));
  let norm=0;
  for(let i=0;i<8;i++){
    const bit=(i&mask)?1:0;
    if(bit===outcome){out[i]=cx(state[i].re,state[i].im); norm+=cxNorm2(state[i]);}
  }
  const s=1/Math.sqrt(norm);
  for(let i=0;i<8;i++) out[i]=cxScale(out[i],s);
  return {state:out, outcome};
}

// ---- Pretty-print state vector ----
function stateToString(state) {
  const labels=['000','001','010','011','100','101','110','111'];
  const terms=[];
  for(let i=0;i<8;i++){
    const a=state[i];
    if(cxNorm2(a)<1e-10) continue;
    let coeff='';
    const re=Math.round(a.re*1e6)/1e6, im=Math.round(a.im*1e6)/1e6;
    if(Math.abs(im)<1e-6){
      if(Math.abs(re-1)<1e-6) coeff='';
      else if(Math.abs(re+1)<1e-6) coeff='-';
      else coeff=re.toFixed(4);
    } else coeff=`(${re.toFixed(3)}+${im.toFixed(3)}i)`;
    terms.push(`${coeff}|${labels[i]}⟩`);
  }
  return terms.join(' + ').replace(/\+ -/g,'- ') || '0';
}

// ---- Draw Circuit ----
function drawCircuit(highlightStep) {
  const c = document.getElementById('circuit-canvas');
  const ctx = c.getContext('2d');
  const W=c.width, H=c.height;
  ctx.clearRect(0,0,W,H);
  const y0=50, dy=80, xStart=80, xEnd=W-40;
  const labels=['q₀  Input','q₁  Entangled','q₂  Output'];
  const colors=['#7c5cff','#e040a0','#22d3a0'];
  // wires
  for(let i=0;i<3;i++){
    const y=y0+i*dy;
    ctx.strokeStyle=colors[i]+'55'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(xStart,y); ctx.lineTo(xEnd,y); ctx.stroke();
    ctx.fillStyle=colors[i]; ctx.font='600 13px Inter';
    ctx.textAlign='right'; ctx.fillText(labels[i],xStart-10,y+4);
  }
  // gate positions
  const gates=[
    {type:'H',x:160,q:0,step:1,label:'H'},
    {type:'H',x:240,q:1,step:2,label:'H'},
    {type:'CNOT',x:320,ctrl:1,tgt:2,step:2},
    {type:'CNOT',x:420,ctrl:0,tgt:1,step:3},
    {type:'H',x:500,q:0,step:3,label:'H'},
    {type:'M',x:580,q:0,step:4,label:'M'},
    {type:'M',x:580,q:1,step:4,label:'M'},
    {type:'CNOT',x:660,ctrl:1,tgt:2,step:5},
    {type:'CZ',x:740,ctrl:0,tgt:2,step:5},
    {type:'M',x:820,q:2,step:6,label:'M'},
  ];
  gates.forEach(g=>{
    const active = highlightStep && g.step<=highlightStep;
    const alpha = active ? 1 : .35;
    if(g.type==='H'||g.type==='M'){
      const y=y0+g.q*dy;
      ctx.fillStyle = g.type==='M' ? `rgba(255,187,51,${alpha})` : `rgba(124,92,255,${alpha})`;
      roundRect(ctx,g.x-18,y-18,36,36,8); ctx.fill();
      ctx.fillStyle=`rgba(255,255,255,${alpha})`; ctx.font='700 15px JetBrains Mono';
      ctx.textAlign='center'; ctx.fillText(g.label,g.x,y+5);
    } else {
      const yc=y0+g.ctrl*dy, yt=y0+g.tgt*dy;
      ctx.strokeStyle=`rgba(124,92,255,${alpha})`; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(g.x,yc); ctx.lineTo(g.x,yt); ctx.stroke();
      ctx.fillStyle=`rgba(124,92,255,${alpha})`;
      ctx.beginPath(); ctx.arc(g.x,yc,6,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(g.x,yt,14,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle=`rgba(255,255,255,${alpha*.7})`; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(g.x-7,yt); ctx.lineTo(g.x+7,yt); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(g.x,yt-7); ctx.lineTo(g.x,yt+7); ctx.stroke();
      if(g.type==='CZ'){
        ctx.fillStyle=`rgba(255,255,255,${alpha*.8})`; ctx.font='600 10px JetBrains Mono';
        ctx.fillText('Z',g.x,yt+3);
      }
    }
  });
}
function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);}

// ---- Build Steps ----
function buildSteps(stepsData) {
  const container = document.getElementById('steps-container');
  container.innerHTML = '';
  stepsData.forEach((s,i)=>{
    const div = document.createElement('div');
    div.className = 'step-card';
    div.id = 'step-'+(i+1);
    div.innerHTML = `
      <div class="step-header"><div class="step-num">${i+1}</div><div class="step-title">${s.title}</div></div>
      <div class="step-body">
        <p>${s.desc}</p>
        <div class="step-math">${s.math}</div>
        <div class="step-qubit-states">
          <div class="sq"><b>Q0:</b> ${s.q0}</div>
          <div class="sq"><b>Q1:</b> ${s.q1}</div>
          <div class="sq"><b>Q2:</b> ${s.q2}</div>
        </div>
      </div>`;
    container.appendChild(div);
  });
}

// ---- Animate Steps ----
async function animateSteps(stepsData) {
  for(let i=0;i<stepsData.length;i++){
    const el = document.getElementById('step-'+(i+1));
    el.classList.add('visible','active');
    drawCircuit(i+1);
    document.getElementById('q0-state').textContent = stepsData[i].q0;
    document.getElementById('q1-state').textContent = stepsData[i].q1;
    document.getElementById('q2-state').textContent = stepsData[i].q2;
    document.querySelectorAll('.card-state').forEach(c=>{ c.classList.remove('changed'); void c.offsetWidth; c.classList.add('changed'); });
    await sleep(800);
    el.classList.remove('active');
  }
}

function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

// ---- LED Display ----
function showLEDs(bitstring){
  const bits = bitstring.split('');
  const colors = ['on-red','on-amber','on-green'];
  for(let i=0;i<3;i++){
    const led = document.getElementById('led'+i);
    led.className = 'led';
    if(bits[i]==='1') led.classList.add(colors[i]);
  }
  document.getElementById('led-value').textContent = bitstring;
}

// ---- Histogram ----
function drawHistogram(counts, total){
  const el = document.getElementById('histogram');
  const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  el.innerHTML = sorted.map(([k,v])=>{
    const pct = (v/total*100).toFixed(1);
    return `<div class="histo-bar-row">
      <div class="histo-label">${k}</div>
      <div class="histo-track"><div class="histo-fill" style="width:${pct}%" data-count="${v} (${pct}%)"></div></div>
    </div>`;
  }).join('');
}

// ---- Shot Log ----
function showShotLog(memory){
  const el = document.getElementById('shot-log');
  el.innerHTML = memory.map((m,i)=>{
    const bits = m.split('');
    return `<div class="shot-entry">
      <span class="shot-idx">Shot ${i+1}</span>
      <span class="shot-val">${m}</span>
      <div class="shot-bits">${bits.map((b,j)=>`<span class="bit ${j<2?'b0':'b1'}">${b}</span>`).join('')}</div>
      <span class="shot-serial">${serialWriter ? '📡' : ''}</span>
    </div>`;
  }).join('');
}

// ===== MAIN RUN FUNCTION =====
async function runTeleportation() {
  const btn = document.getElementById('run-btn');
  btn.classList.add('running'); btn.innerHTML = '<span class="btn-icon">⏳</span> Running...';

  const SHOTS = 10;
  const stepsData = [];
  let state, m0, m1;

  // --- Step 1: Prepare Input ---
  state = newState();
  state = applyH(state, 0);
  stepsData.push({
    title:'Prepare Input State (Superposition)',
    desc:'Apply Hadamard gate to Q0 to create a superposition state — the unknown state to be teleported.',
    math:`H|0⟩ = (1/√2)|0⟩ + (1/√2)|1⟩\n\nFull state: ${stateToString(state)}`,
    q0:'(1/√2)|0⟩ + (1/√2)|1⟩', q1:'|0⟩', q2:'|0⟩'
  });

  // --- Step 2: Create Entanglement ---
  state = applyH(state, 1);
  state = applyCNOT(state, 1, 2);
  stepsData.push({
    title:'Create Entangled Bell Pair (Q1 & Q2)',
    desc:'Apply H gate to Q1, then CNOT(Q1→Q2), creating an entangled pair between the entangled qubit and the output qubit.',
    math:`H|0⟩ = (1/√2)(|0⟩+|1⟩)\nCNOT: |00⟩→|00⟩, |10⟩→|11⟩\nBell Pair: (|00⟩+|11⟩)/√2\n\nFull state: ${stateToString(state)}`,
    q0:'(1/√2)(|0⟩+|1⟩)', q1:'Entangled ↔ Q2', q2:'Entangled ↔ Q1'
  });

  // --- Step 3: Teleportation Operations ---
  state = applyCNOT(state, 0, 1);
  state = applyH(state, 0);
  stepsData.push({
    title:'Teleportation Operations (CNOT + Hadamard)',
    desc:'Apply CNOT(Q0→Q1) then Hadamard on Q0, entangling the input with the Bell pair and preparing for measurement.',
    math:`CNOT(q0, q1) then H(q0)\n\nFull state: ${stateToString(state)}`,
    q0:'Entangled (pre-measurement)', q1:'Entangled (pre-measurement)', q2:'Correlated with Q0,Q1'
  });

  // --- Step 4: Measure Input & Entangled Qubits ---
  const m0res = measure(state, 0); state = m0res.state; m0 = m0res.outcome;
  const m1res = measure(state, 1); state = m1res.state; m1 = m1res.outcome;
  stepsData.push({
    title:'Measure Input & Entangled Qubits (Q0, Q1)',
    desc:'Measure Q0 and Q1. The quantum state collapses, producing classical bits needed for correction.',
    math:`Measurement results:\n  Q0 → ${m0}\n  Q1 → ${m1}\n\nCollapsed state: ${stateToString(state)}`,
    q0:`Measured: ${m0}`, q1:`Measured: ${m1}`, q2:'Awaiting correction'
  });

  // --- Step 5: Correction ---
  state = applyCNOT(state, 1, 2);
  state = applyCZ(state, 0, 2);
  stepsData.push({
    title:'Output Correction (CNOT + CZ)',
    desc:'Apply CNOT(Q1→Q2) and CZ(Q0,Q2) conditioned on the classical bits to reconstruct the original state on the output qubit.',
    math:`If Q1=1: X(Q2)  →  applied via CNOT\nIf Q0=1: Z(Q2)  →  applied via CZ\n\nCorrected state: ${stateToString(state)}`,
    q0:`${m0} (classical)`, q1:`${m1} (classical)`, q2:'Corrected — teleportation complete'
  });

  // --- Step 6: Measure Output ---
  const m2res = measure(state, 2);
  stepsData.push({
    title:'Measure Output Qubit (Q2)',
    desc:'Measure Q2 to verify the teleportation. The output should statistically match the original input state.',
    math:`Q2 measurement → ${m2res.outcome}\n\nFinal classical output: ${m0}${m1}${m2res.outcome}`,
    q0:`${m0} (classical)`, q1:`${m1} (classical)`, q2:`Measured: ${m2res.outcome}`
  });

  buildSteps(stepsData);
  await animateSteps(stepsData);

  // --- Multi-shot simulation ---
  const counts = {};
  const memory = [];
  for(let s=0;s<SHOTS;s++){
    let st = newState();
    st=applyH(st,0); st=applyH(st,1); st=applyCNOT(st,1,2);
    st=applyCNOT(st,0,1); st=applyH(st,0);
    const r0=measure(st,0); st=r0.state;
    const r1=measure(st,1); st=r1.state;
    st=applyCNOT(st,1,2); st=applyCZ(st,0,2);
    const r2=measure(st,2);
    const key=`${r0.outcome}${r1.outcome}${r2.outcome}`;
    counts[key]=(counts[key]||0)+1;
    memory.push(key);
  }

  // Show results
  document.getElementById('results-section').classList.remove('hidden');
  document.getElementById('shots-info').textContent = `Simulation ran ${SHOTS} shots. Distribution of 3-bit measurement outcomes:`;
  drawHistogram(counts, SHOTS);
  showShotLog(memory);

  // Animate LEDs + send each shot to Arduino
  for(let i=0;i<memory.length;i++){
    showLEDs(memory[i]);
    await sendToArduino(memory[i]);  // Send to Arduino via serial
    await sleep(600);
  }

  btn.classList.remove('running');
  btn.innerHTML = '<span class="btn-icon">▶</span> Run Again';
}

// ---- Initial Draw ----
drawCircuit(0);
