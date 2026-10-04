// post.glsl: brot_viewer glue. The host for the edge_post block (pasted above this file): one post pass over the
// frame, no new rays. The march wrote the frame to uCol and its steps and hit to uAux (view.glsl fragAux).

uniform sampler2D uCol, uAux;
uniform vec2  uRes;
uniform int   uMask;        // EP_NONE, EP_LUMA, EP_STEPS, EP_BOTH, EP_ALL
uniform float uStepJump;    // a neighbour more than this many march steps away marks a geometry edge

out vec4 fragColor;

void main() {
  bool edge;
  fragColor = vec4(ep_filter(uCol, uAux, ivec2(gl_FragCoord.xy), uRes, uMask, uStepJump, edge), 1.0);
}
