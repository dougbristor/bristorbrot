// GPU conformance of B2 variant against independently generated table-product expectations.
// Run from this folder or pass --block-dir=/absolute/path/to/blocks to use installed dependencies.
// SPDX-License-Identifier: MIT.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire}from'node:module';
const local=new URL('.',import.meta.url),root=process.argv.find(x=>x.startsWith('--block-dir='))?.slice(12)??new URL('..',local).pathname;
const pb=fs.readFileSync(path.join(root,'bristor_product','v1.glsl'),'utf8'),bdm=fs.readFileSync(path.join(root,'brot_de_march','v1.glsl'),'utf8'),b2=fs.readFileSync(new URL('b2_v1.glsl',local),'utf8'),vectors=JSON.parse(fs.readFileSync(new URL('b2_vectors.json',local),'utf8'));
const {chromium}=createRequire(import.meta.url)('playwright');const b=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=gl','--enable-webgl','--ignore-gpu-blocklist','--disable-gpu-watchdog']});let report;
try{const p=await b.newPage();await p.setContent('<!doctype html><body>GPU conformance</body>');report=await p.evaluate(({pb,bdm,b2,vectors})=>{
 const c=document.createElement('canvas'),gl=c.getContext('webgl2');if(!gl.getExtension('EXT_color_buffer_float'))throw Error('Float readback unavailable');c.width=c.height=1;
 const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.texStorage2D(gl.TEXTURE_2D,1,gl.RGBA32F,1,1);const f=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,f);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);gl.viewport(0,0,1,1);gl.bindVertexArray(gl.createVertexArray());
 const vertex='#version 300 es\nvoid main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0,1);}';
 const head='#version 300 es\nprecision highp float;\nprecision highp int;\nout vec4 o;\n';
 const map='vec4 bdm_f(vec4 z){return bp_square(z);}vec4 bdm_df(vec4 z,vec4 v){return bp_Jv(z,v);}const float BDM_POWER=2.;\n';
 const body=`uniform vec3 uP,uD,uC;uniform mat3 uFrame;uniform bool uJulia;uniform int uIters,uMode;uniform float uLeash;void main(){B2dmSet s=B2dmSet(uFrame,uJulia,uC,uIters);if(uMode==0)o=b2dm_de(uP,uD,s);else if(uMode==1)o=vec4(b2dm_normal(uP,vec3(0,0,1),s),0);else{float t,tone;int steps;BdmMarch m=BdmMarch(2400,4.,.4,true,.00048,.04,1.381,360.,uLeash);bool hit=b2dm_march(uP,uD,s,m,t,tone,steps);o=vec4(hit?1.:0.,t,tone,float(steps));}}`;
 const compile=(type,src)=>{const sh=gl.createShader(type);gl.shaderSource(sh,src);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));return sh;};
 const build=(block,prod=pb)=>{const pr=gl.createProgram();gl.attachShader(pr,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(pr,compile(gl.FRAGMENT_SHADER,head+prod+map+bdm+block+body));gl.linkProgram(pr);if(!gl.getProgramParameter(pr,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(pr));return pr;};
 const read=(pr,r,mode)=>{gl.useProgram(pr);const U=k=>gl.getUniformLocation(pr,k);gl.uniform3fv(U('uP'),r.p??r.ro);gl.uniform3fv(U('uD'),r.rd);gl.uniform3fv(U('uC'),r.s.jc);gl.uniform1i(U('uJulia'),r.s.julia?1:0);gl.uniform1i(U('uIters'),r.s.iters);gl.uniform1i(U('uMode'),mode);gl.uniform1f(U('uLeash'),r.m?.leash??1.5);gl.uniformMatrix3fv(U('uFrame'),false,r.s.frame[0].map((_,i)=>r.s.frame.map(row=>row[i])).flat());gl.drawArrays(gl.TRIANGLES,0,3);const a=new Float32Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.FLOAT,a);if(gl.getError())throw Error('GL error');return[...a];};
 const test=pr=>{let worstDE=0,worstNormal=0,worstDepth=0,failures=[];for(const [i,r]of vectors.rows.entries()){
  const a=read(pr,r,0),n=read(pr,r,1),e=r.field.de;
  const err=Math.max(...a.map((x,k)=>k===3?Math.abs(x-e[k]):Math.abs(x-e[k])/Math.max(1e-8,Math.abs(e[k]))));const ne=Math.hypot(...n.slice(0,3).map((x,k)=>x-r.normal[k]));worstDE=Math.max(worstDE,err);worstNormal=Math.max(worstNormal,ne);if(err>.002||ne>.02)failures.push({i,err,ne,a,e});
 }
 for(const[i,r]of vectors.rays.entries()){const a=read(pr,r,2),e=r.expected,d=Math.abs(a[1]-e[1]);if(a[0]===1)worstDepth=Math.max(worstDepth,d);if(a[0]!==e[0]||(a[0]===1&&d>.01)||Math.abs(a[3]-e[3])>1)failures.push({ray:i,a,e,d});}return{pass:!failures.length,worstDE,worstNormal,worstDepth,failures};};
 const shipped=test(build(b2)),faults={};
 faults.juliaDc=test(build(b2.replaceAll('kk=s.julia?0.:1.','kk=1.')));
 faults.rescaleWeight=test(build(b2.replace('weight*=factor;','')));
 faults.wrongSquare=test(build(b2,pb.replaceAll('z.y*(2.0*z.x - z.z)','z.y*(2.0*z.x + z.z)').replaceAll('z.z*(2.0*z.x + z.y)','z.z*(2.0*z.x - z.y)')));
 faults.scalarHit=test(build(b2.replace('if (f.y < eps)','if (f.x < eps)')));
 return{shipped,faults,rows:vectors.rows.length,rays:vectors.rays.length,device:navigator.userAgent,tolerances:{DE:.002,normal:.02,marchDepth:.01,marchSteps:1}};
 },{pb,bdm,b2,vectors});
 const reportPath=process.argv.find(x=>x.startsWith('--report='))?.slice(9);if(reportPath)fs.writeFileSync(reportPath,JSON.stringify(report,null,2));console.log(JSON.stringify({shipped:report.shipped,rows:report.rows,rays:report.rays,faults:Object.fromEntries(Object.entries(report.faults).map(([k,v])=>[k,{pass:v.pass,failures:v.failures.length}]))}));assert(report.shipped.pass);for(const[k,v]of Object.entries(report.faults))assert(!v.pass,k+' fault must fail');console.log('GLSL B2 PASS: 72 field/normal probes, 36 rays, four planted faults detected');
}finally{await b.close();}
