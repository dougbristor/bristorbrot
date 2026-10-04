// SPDX-License-Identifier: MIT — Copyright 2026 Doug Bristor
// codetree:bristor_product/v1, codetree:brot_de_march/b2_v1
// Paste after both dependencies. B2 (real,e1,e2), not Hamilton quaternions.
// Derivative construction proven; geometric DE and march heuristic.
struct B2dmSet {mat3 frame;bool julia;vec3 jc;int iters;};
// frame is orthogonal (rotation or mirror). Fixed Julia C is in algebra slots.
void b2dm_seed(vec3 p,vec3 direction,B2dmSet s,out vec3 c,out vec3 dc){c=s.frame*p;dc=s.frame*direction;}
vec4 b2dm_de(vec3 p,vec3 rd,B2dmSet s){
 vec3 c,dc;b2dm_seed(p,rd,s,c,dc);vec3 z=c,v=dc;vec3 add=s.julia?s.jc:c;float kk=s.julia?0.:1.;float r2=dot(z,z),dr=1.,weight=1.;int n=0;
 for(int i=0;i<256;i++){
  if(i>=int(s.iters)||r2>64.)break;n=i+1;
  float r=sqrt(max(r2,1e-30));dr=2.*r*dr+kk*weight;
  v=bp_Jv(z,v)+kk*dc*weight;
  // Rescale the whole derivative together; independent component clipping
  // would corrupt both its length and direction.
  {float magnitude=max(dr,length(v));
   if(magnitude>1e10){float factor=1./magnitude;dr*=factor;v*=factor;weight*=factor;}}
  z=bp_square(z)+add;r2=dot(z,z);
 }
 float r=sqrt(max(r2,1e-30));float numer=.5*log(r)*r*weight;
 float ds=numer/max(dr,1e-30),dd=numer/max(length(v),1e-30);
 float tone=r2>64.?clamp((float(n)-log2(log2(max(r2,4.01))))/float(s.iters),0.,1.):1.;
 // Interior (at the finite iteration cap) is a hit. Legacy did not force this.
 if(r2<=64.)return vec4(0.,0.,tone,float(n));
 return vec4(dd,ds,tone,float(n));
}
vec3 b2dm_normal(vec3 p,vec3 fallback,B2dmSet s){
 vec3 c,sx,sy,sz,unused;b2dm_seed(p,vec3(1,0,0),s,c,sx);b2dm_seed(p,vec3(0,1,0),s,unused,sy);b2dm_seed(p,vec3(0,0,1),s,unused,sz);
 vec3 z=c,mx=sx,my=sy,mz=sz;float weight=1.,kk=s.julia?0.:1.;vec3 add=s.julia?s.jc:c;
 for(int i=0;i<256;i++){
  if(i>=int(s.iters)||dot(z,z)>64.)break;
  mx=bp_Jv(z,mx)+kk*sx*weight;my=bp_Jv(z,my)+kk*sy*weight;mz=bp_Jv(z,mz)+kk*sz*weight;
  float m=max(length(mx),max(length(my),length(mz)));
  if(m>1e10){mx*=1e-10;my*=1e-10;mz*=1e-10;weight*=1e-10;}
  z=bp_square(z)+add;
 }
 vec3 g=vec3(dot(z,mx),dot(z,my),dot(z,mz));
 return dot(g,g)>1e-30?normalize(g):fallback;
}

bool b2dm_march(vec3 ro, vec3 rd, B2dmSet s, BdmMarch m, out float t, out float tone, out int steps) {
  t = 0.0; tone = 0.0; steps = 0;
  float b = dot(ro, rd), disc = b*b - dot(ro, ro) + m.bound*m.bound;
  if (disc < 0.0) return false;
  t = max(-b - sqrt(disc), 0.0);
  float tEnd = -b + sqrt(disc), prev = 1e20;
  for (int i = 0; i < 8192; i++) {
    if (i >= m.maxSteps || t > tEnd) break;
    steps = i + 1;
    vec4 f = b2dm_de(ro + rd*t, rd, s);
    float eps = max(m.hitEps, m.lod * t / (m.lens * m.resY));
    if (f.y < eps) { tone = f.z; return true; }
    float safety = (m.adaptive && f.y < prev*0.5) ? min(m.safety, 0.15) : m.safety;
    prev = f.y;
    float step = m.leash > 0.0 ? min(f.x, f.y * m.leash) : f.y;
    t += max(step * safety, eps * 0.05);
  }
  return false;
}
