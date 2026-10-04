// Independent table product, no dependency on GLSL or its component square expressions.
// SPDX-License-Identifier: MIT. Vector expectations are CC0.
export const norm=v=>Math.hypot(...v),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const add=(a,b)=>a.map((x,i)=>x+b[i]),scale=(a,k)=>a.map(x=>x*k);
export function product(a,b){const out=[0,0,0];for(let i=0;i<3;i++)for(let j=0;j<3;j++){
 const k=i===0?j:j===0?i:i===j?0:j;const sign=i===0||j===0?1:i===j?-1:j>i?1:-1;out[k]+=sign*a[i]*b[j];}return out;}
const J=(z,v)=>add(product(z,v),product(v,z));
const apply=(frame,p)=>frame.map(row=>dot(row,p));
export function field(p,rd,s){let z=apply(s.frame,p),dc=apply(s.frame,rd),v=dc.slice(),c=s.julia?s.jc:z.slice(),dr=1,w=1,n=0,rescales=0;
 for(let i=0;i<s.iters&&dot(z,z)<=64;i++){
  dr=2*norm(z)*dr+(s.julia?0:w);v=add(J(z,v),scale(dc,s.julia?0:w));const m=Math.max(dr,norm(v));
  if(m>1e10){dr/=m;v=scale(v,1/m);w/=m;rescales++;}z=add(product(z,z),c);n++;
 }
 if(dot(z,z)<=64)return{de:[0,0,1,n],rescales};
 const r=norm(z),num=.5*Math.log(r)*r*w,tone=Math.max(0,Math.min(1,(n-Math.log2(Math.log2(Math.max(r*r,4.01))))/s.iters));
 return{de:[num/Math.max(norm(v),1e-30),num/Math.max(dr,1e-30),tone,n],rescales};
}
export function normal(p,s,fallback=[0,0,1]){let z=apply(s.frame,p),c=s.julia?s.jc:z.slice(),columns=[0,1,2].map(i=>s.frame.map(row=>row[i])),chains=columns.map(v=>v.slice()),w=1;
 for(let i=0;i<s.iters&&dot(z,z)<=64;i++){
  chains=chains.map((v,k)=>add(J(z,v),scale(columns[k],s.julia?0:w)));const m=Math.max(...chains.map(norm));
  if(m>1e10){chains=chains.map(v=>scale(v,1e-10));w*=1e-10;}z=add(product(z,z),c);
 }
 const g=chains.map(v=>dot(z,v));return dot(g,g)>1e-30?scale(g,1/norm(g)):fallback;
}
export function march(ro,rd,s,m){const b=dot(ro,rd),disc=b*b-dot(ro,ro)+m.bound*m.bound;if(disc<0)return[0,0,0,0];let t=Math.max(-b-Math.sqrt(disc),0),end=-b+Math.sqrt(disc),prev=1e20,steps=0;
 for(let i=0;i<Math.min(8192,m.maxSteps)&&t<=end;i++){
  steps=i+1;const f=field(add(ro,scale(rd,t)),rd,s).de,eps=Math.max(m.hitEps,m.lod*t/(m.lens*m.resY));if(f[1]<eps)return[1,t,f[2],steps];
  const safety=m.adaptive&&f[1]<prev*.5?Math.min(m.safety,.15):m.safety;prev=f[1];t+=Math.max((m.leash>0?Math.min(f[0],f[1]*m.leash):f[1])*safety,eps*.05);
 }return[0,t,0,steps];}
export const identity=[[1,0,0],[0,1,0],[0,0,1]],mirror=[[1,0,0],[0,0,-1],[0,-1,0]];
