// codetree:c_selector/v1 — the b-slice c-selector: a clickable (Re, signed-imaginary) slice of
// the B2 parameter set, rolled by theta about the Re axis. Universal: every page that picks c uses it.
//
// Coordinates are CodeT's (Re, i, j) (T-049): c = [Re, i, j] and the B2 square is
//   (x + y·i + z·j)² = (x² − y² − z²) + y(2x − z)·i + z(2x + y)·j,   i·j = j, j·i = −i.
// Witness: bSquare([0, 1, 1]) = [−2, −1, +1]; a (−2, +1, −1) answer has applied the relabel
// and the hand flip twice. The slice plane holds Re and the unit direction (cos θ, sin θ) in
// the (i, j) plane, so θ = atan2(j, i). Planted 2026-09-25 from caro/web/saddle_branch_lab/
// c_selector.js, whose 2026-09-03 header named the same positions (real, j, i); the code
// is unchanged, only the names follow T-049 (see block.md).

export const C_VIEW={realMin:-2,realMax:.75,imagMin:-1.1,imagMax:1.1,maxIter:96};

const cleanZero=v=>v===0?0:v;
export const cFromTarget=t=>[-t[0]-.75,-t[1],-t[2]].map(cleanZero);
export const targetFromC=c=>[-c[0]-.75,-c[1],-c[2]].map(cleanZero);
export function planeForC(c){
  const radial=Math.hypot(c[1],c[2]);
  const orientation=c[1]<0?-1:1;
  return{theta:radial>1e-14?Math.atan2(orientation*c[2],orientation*c[1]):0,
    radial,signedImag:orientation*radial};
}
export const cFromPlane=(real,signedImag,theta)=>[real,signedImag*Math.cos(theta),signedImag*Math.sin(theta)].map(cleanZero);

// A rolled parameter plane is hard to infer from the slice alone. Draw its
// orientation as a tiny (i, j) clock: the cyan diameter is the unoriented plane
// line, while the gold hand marks the positive signed-imaginary direction.
export function drawThetaDial(ctx,theta,{radius=15,margin=7,vector=null}={}){
  const x=ctx.canvas.width-radius-margin,y=radius+margin,ux=Math.cos(theta),uy=-Math.sin(theta);
  ctx.save();ctx.fillStyle='#07101de8';ctx.strokeStyle='#ffffff66';ctx.lineWidth=1;
  ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.strokeStyle='#ffffff2f';ctx.beginPath();ctx.moveTo(x-radius+3,y);ctx.lineTo(x+radius-3,y);ctx.moveTo(x,y-radius+3);ctx.lineTo(x,y+radius-3);ctx.stroke();
  ctx.strokeStyle='#81ddecaa';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x-ux*(radius-4),y-uy*(radius-4));ctx.lineTo(x+ux*(radius-4),y+uy*(radius-4));ctx.stroke();
  const hx=x+ux*(radius-3),hy=y+uy*(radius-3),sideX=-uy,sideY=ux;
  ctx.strokeStyle='#efc27e';ctx.fillStyle='#efc27e';ctx.lineWidth=2.25;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(hx,hy);ctx.stroke();
  ctx.beginPath();ctx.moveTo(hx,hy);ctx.lineTo(hx-ux*5+sideX*2.5,hy-uy*5+sideY*2.5);ctx.lineTo(hx-ux*5-sideX*2.5,hy-uy*5-sideY*2.5);ctx.closePath();ctx.fill();
  // Elite-style height stalk, but in the actual imaginary-coordinate dial.
  // vector=(c_j,c_i) is held fixed while the plane hand rotates. Its foot is
  // the orthogonal projection onto the selected plane; the purple segment is
  // exactly the signed off-plane component, not a decorative screen offset.
  if(vector&&vector.length===2&&vector.every(Number.isFinite)){
    const [vj,vi]=vector,mag=Math.hypot(vj,vi);
    if(mag>1e-14){const k=(radius-5)/mag,s=vj*Math.cos(theta)+vi*Math.sin(theta),pj=s*Math.cos(theta),pi=s*Math.sin(theta),tx=x+vj*k,ty=y-vi*k,fx=x+pj*k,fy=y-pi*k;
      ctx.strokeStyle='#ffffff9c';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(tx,ty);ctx.stroke();
      ctx.setLineDash([2,2]);ctx.strokeStyle='#df8cff';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(fx,fy);ctx.lineTo(tx,ty);ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle='#df8cff';ctx.fillRect(fx-1.5,fy-1.5,3,3);ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(tx,ty,2.4,0,Math.PI*2);ctx.fill();
    }
  }
  ctx.fillStyle='#efc27e';ctx.beginPath();ctx.arc(x,y,2,0,Math.PI*2);ctx.fill();ctx.restore();
}

/** The B2 square in CodeT's (Re, i, j). */
export const bSquare=([x,y,z])=>[x*x-y*y-z*z,y*(2*x-z),z*(2*x+y)];

export function escapeAt(c,maxIter=C_VIEW.maxIter){
  let x=0,y=0,z=0,r2=0;
  for(let i=0;i<maxIter;i++){
    r2=x*x+y*y+z*z;
    if(r2>64)return{escaped:true,iteration:i,r2};
    const s=bSquare([x,y,z]);
    x=s[0]+c[0];y=s[1]+c[1];z=s[2]+c[2];
  }
  return{escaped:false,iteration:maxIter,r2:x*x+y*y+z*z};
}

function ember(t){
  const tau=2*Math.PI;
  return[.5+.5*Math.cos(tau*(.7*t)),.2+.4*Math.cos(tau*(.9*t+.05)),.1+.2*Math.cos(tau*(t+.1))]
    .map(v=>Math.max(0,Math.min(1,v))*255|0);
}

export function createCSelector(canvas,{onSelect=()=>{},onState=()=>{}}={}){
  const ctx=canvas.getContext('2d'),low=document.createElement('canvas');
  low.width=122;low.height=98;const lctx=low.getContext('2d');
  let theta=0,currentC=[0,0,0],sliceImage=null,overlay=[];

  function rebuild(){
    const im=lctx.createImageData(low.width,low.height),d=im.data;
    for(let py=0;py<low.height;py++)for(let px=0;px<low.width;px++){
      const real=C_VIEW.realMin+px/(low.width-1)*(C_VIEW.realMax-C_VIEW.realMin);
      const imag=C_VIEW.imagMax-py/(low.height-1)*(C_VIEW.imagMax-C_VIEW.imagMin);
      const hit=escapeAt(cFromPlane(real,imag,theta));
      const k=(py*low.width+px)*4;
      let col=[5,7,14];
      if(hit.escaped){const smooth=hit.iteration-Math.log2(Math.log2(Math.max(hit.r2,4.01)));
        col=ember(Math.max(0,Math.min(1,smooth/C_VIEW.maxIter)));}
      d[k]=col[0];d[k+1]=col[1];d[k+2]=col[2];d[k+3]=255;
    }
    lctx.putImageData(im,0,0);sliceImage=low;
  }

  const xPixel=x=>(x-C_VIEW.realMin)/(C_VIEW.realMax-C_VIEW.realMin)*canvas.width;
  const yPixel=y=>(C_VIEW.imagMax-y)/(C_VIEW.imagMax-C_VIEW.imagMin)*canvas.height;
  function draw(){
    if(!sliceImage)rebuild();ctx.imageSmoothingEnabled=false;ctx.drawImage(sliceImage,0,0,canvas.width,canvas.height);
    ctx.strokeStyle='#ffffff38';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,yPixel(0));ctx.lineTo(canvas.width,yPixel(0));ctx.moveTo(xPixel(0),0);ctx.lineTo(xPixel(0),canvas.height);ctx.stroke();
    if(overlay.length>1){ctx.strokeStyle='#81ddecbb';ctx.lineWidth=1.25;ctx.beginPath();overlay.forEach((p,k)=>{const x=xPixel(p[0]),y=yPixel(p[1]);k?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.closePath();ctx.stroke();}
    const signed=currentC[1]*Math.cos(theta)+currentC[2]*Math.sin(theta),mx=xPixel(currentC[0]),my=yPixel(signed);
    ctx.strokeStyle='#fff4aa';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(mx,my,5,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#fff4aa';ctx.fillRect(mx-1,my-1,2,2);
    const signedOffPlane=-currentC[1]*Math.sin(theta)+currentC[2]*Math.cos(theta);
    drawThetaDial(ctx,theta,{vector:[currentC[1],currentC[2]]});
    onState({theta,c:currentC.slice(),signedImag:signed,signedOffPlane,offPlane:Math.abs(signedOffPlane)});
  }

  function setC(c,{align=true}={}){
    currentC=c.slice();
    if(align){const next=planeForC(c).theta;if(Math.abs(Math.sin((next-theta)/2))>1e-7){theta=next;sliceImage=null;}}
    draw();
  }

  function setTheta(value){
    if(!Number.isFinite(value))throw Error('A finite slice theta is required.');
    const next=Math.max(-Math.PI,Math.min(Math.PI,value));
    if(Math.abs(next-theta)>1e-12){theta=next;sliceImage=null;}
    draw();return theta;
  }
  function setOverlay(points=[]){overlay=points.map(p=>p.slice());draw();}

  canvas.addEventListener('click',e=>{
    const b=canvas.getBoundingClientRect(),w=b.width-canvas.clientLeft-canvas.clientLeft,h=b.height-canvas.clientTop-canvas.clientTop;
    const px=(e.clientX-b.left-canvas.clientLeft)/w,py=(e.clientY-b.top-canvas.clientTop)/h;
    let real=C_VIEW.realMin+px*(C_VIEW.realMax-C_VIEW.realMin);
    let imag=C_VIEW.imagMax-py*(C_VIEW.imagMax-C_VIEW.imagMin);
    // A physical click is quantised to a CSS pixel; make the drawn axes exact
    // inputs instead of leaving an unavoidable half-pixel residual.
    if(Math.abs(real)<(C_VIEW.realMax-C_VIEW.realMin)/w*.6)real=0;
    if(Math.abs(imag)<(C_VIEW.imagMax-C_VIEW.imagMin)/h*.6)imag=0;
    currentC=cFromPlane(real,imag,theta);draw();onSelect(currentC.slice(),{theta,signedImag:imag});
  });
  return{setC,setTheta,setOverlay,alignToC:()=>setC(currentC,{align:true}),get:()=>({theta,c:currentC.slice(),overlayPoints:overlay.length,
    signedImag:currentC[1]*Math.cos(theta)+currentC[2]*Math.sin(theta),
    signedOffPlane:-currentC[1]*Math.sin(theta)+currentC[2]*Math.cos(theta),
    offPlane:Math.abs(-currentC[1]*Math.sin(theta)+currentC[2]*Math.cos(theta))}),redraw:draw};
}
