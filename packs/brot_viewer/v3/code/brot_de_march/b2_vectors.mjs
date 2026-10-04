import fs from 'node:fs';
import {field,normal,march,identity,mirror,norm} from './b2_reference.mjs';
let rows=[];
for(const julia of [false,true])for(const frame of [identity,mirror])for(let k=0;k<16;k++){
 const p=[Math.sin(k*1.7)*1.1,Math.cos(k*.71)*.65,Math.sin(k*.23)*.8],rd=[.2,-.3,.7].map(x=>x/Math.hypot(.2,.3,.7)),s={frame,julia,jc:[-.7,-.35,.05],iters:k%3?48:4};
 rows.push({p,rd,s,field:field(p,rd,s),normal:normal(p,s)});
}
// Deliberately deep escaping probes exercise common rescaling, not just short orbits.
for(let k=0;k<50000;k++){
 const p=[-1.5+(k%500)/500*1.5,Math.sin(k*.35)*.2,Math.cos(k*.78)*.2],rd=[1,0,0],s={frame:identity,julia:false,jc:[0,0,0],iters:200},f=field(p,rd,s);
 if(f.rescales&&f.de[3]<200){rows.push({p,rd,s,field:f,normal:normal(p,s)});if(rows.length>=72)break;}
}
const diagnostics=rows.splice(64);
// Large, deliberately non-unit derivative directions force rescaling on short dyadic orbits.
// This checks derivative algebra; it is not a geometric ray-direction fixture.
for(let k=0;k<8;k++){const p=[1.25,-.5,.125],rd=[1e12*(k+1),-2e12,3e12],s={frame:k%2?identity:mirror,julia:k%3===0,jc:[-.7,-.35,.05],iters:4};rows.push({p,rd,s,field:field(p,rd,s),normal:normal(p,s),kind:'short rescale stress'});}
const rays=[];for(const julia of [false,true])for(const frame of [identity,mirror])for(const leash of [0,1.5,8])for(const offset of [-.4,0,.4]){
 const ro=[offset,.2,3.6],rd=ro.map(x=>-x/norm(ro)),s={frame,julia,jc:[-.7,-.35,.05],iters:48},m={maxSteps:2400,bound:4,safety:.4,adaptive:true,hitEps:.00048,lod:.04,lens:1.381,resY:360,leash};rays.push({ro,rd,s,m,expected:march(ro,rd,s,m)});
}
fs.writeFileSync(new URL('b2_vectors.json',import.meta.url),JSON.stringify({license:'CC0',source:'Independent table-product reference',rows,rays,diagnostics},null,2));console.log({rows:rows.length,rescaleRows:rows.filter(r=>r.field.rescales).length,rays:rays.length});
