/**
 * Basement / rounded shapes: one shared, smooth "tapered capsule" mesh that every rounded
 * instance reuses, shaped per instance in the vertex shader. It is the renderer's second
 * primitive beside the unit box, built for bodies, clothing and other organic forms.
 *
 * Shape contract (all in the shape's local frame, before its rotation):
 *   - `shape.size` is the full extent, as for a box: x width and y depth at the near end,
 *     z total length including both end caps. Cross-sections are ellipses.
 *   - The near end sits at +z (t = 0) and the far end at -z (t = 1). A limb that hangs
 *     from a joint therefore needs no extra rotation: near is the joint, far is below.
 *   - `shape.rounded` = { taper, depthTaper, bulge, peak, flatNear, flatFar, widthOnly }
 *     (see roundedProfile):
 *       taper     far-end width ÷ near-end width (0.05–4)
 *       depthTaper far-end depth ÷ near-end depth (defaults to taper), so a shape can
 *                 widen without deepening (a pelvis from waist to hips)
 *       bulge     extra radius, as a fraction of the near radius, added smoothly between
 *                 the ends and largest at `peak` (−0.95–0.95; negative pinches)
 *       peak      where along the body the bulge is largest, 0 near … 1 far (0.01–0.99)
 *       flatNear  end the near side with a flat disc instead of a dome (a sleeve hem)
 *       flatFar   the same for the far side
 *       widthOnly apply the bulge to the x width only (hips, ribcage), keeping the depth
 *   Each end is a dome whose height is its smaller cross-section radius, so two segments
 *   whose touching radii match meet in one continuous joint, with no gap at any angle.
 *   If size.z is shorter than both domes the domes are squashed into an ellipsoid.
 *
 * Record packing: lit and shadow records keep their sizes (24 and 16 floats). The two
 * previously unused lanes carry the profile, so boxes and rounded shapes share every
 * record, upload and depth-cache path:
 *   pose.w  0 marks a box (the legacy value, so old records stay boxes); negative values
 *           mark meshes (skinning.js); otherwise the integer part is the width taper in
 *           thousandths and the fraction is depth taper ÷ 4 (resolution about 0.002, finer
 *           than any visible change)
 *   size.w  integer part = peak in hundredths + 100 × flags (1 flat near, 2 flat far,
 *           4 width-only bulge); fraction = (bulge + 1) / 2. Float32 keeps the fraction to
 *           about 1e-4 at the largest code (799), finer than any visible change.
 *
 * CPU queries (picking, asset bounds, analytic AO) still treat a rounded shape as its box.
 * The box encloses the shape whenever taper ≤ 1 and bulge ≤ 0; otherwise the surface
 * can extend slightly past it, which the renderer's culling radius accounts for.
 */

/** Mesh resolution: segments around the axis, rings along each dome and along the body. */
const AROUND = 18,
  DOME_RINGS = 5,
  BODY_RINGS = 7;

/** Validated, frozen profile. Authors call this once; the renderer only packs it. */
export function roundedProfile({ taper = 1, depthTaper = taper, bulge = 0, peak = 0.5, flatNear = false, flatFar = false, widthOnly = false } = {}) {
  for (const value of [taper, depthTaper])
    if (!Number.isFinite(value) || value < 0.05 || value > 3.99) throw new RangeError("Rounded tapers must be 0.05–3.99");
  if (!Number.isFinite(bulge) || bulge < -0.95 || bulge > 0.95) throw new RangeError("Rounded bulge must be −0.95–0.95");
  if (!Number.isFinite(peak) || peak < 0.01 || peak > 0.99) throw new RangeError("Rounded peak must be 0.01–0.99");
  if (![flatNear, flatFar, widthOnly].every((flag) => typeof flag === "boolean")) throw new TypeError("Rounded flags must be boolean");
  return Object.freeze({ taper, depthTaper, bulge, peak, flatNear, flatFar, widthOnly });
}

/** Encode the pose.w lane: width taper in thousandths, depth taper ÷ 4 as the fraction. */
export function packTaperLane(r) {
  const width = Math.min(3999, Math.max(50, Math.round((r.taper ?? 1) * 1000))),
    depth = Math.min(3.99, Math.max(0.05, r.depthTaper ?? r.taper ?? 1));
  return width + depth / 4.0001;
}

/** Encode the size.w lane. Values are clamped so a hand-written profile cannot corrupt it. */
export function packRoundedLane(r) {
  const peak = Math.round(Math.min(0.99, Math.max(0.01, r.peak ?? 0.5)) * 100),
    flags = (r.flatNear ? 1 : 0) + (r.flatFar ? 2 : 0) + (r.widthOnly ? 4 : 0),
    // Keep the fraction strictly below 1 so it never carries into the integer part.
    fraction = Math.min(0.9998, Math.max(0, ((r.bulge ?? 0) + 1) / 2));
  return peak + 100 * flags + fraction;
}

/** Largest radial scale relative to the near radius: culling radii must cover the bulge. */
export function roundedReach(r) {
  return Math.max(1, r.taper ?? 1, r.depthTaper ?? 1) + Math.max(0, r.bulge ?? 0);
}

/**
 * Indexed mesh in parameter space, not positions: aPosition = (cos θ, sin θ, t) and
 * aNormal = (sin φ, cos φ, end), where end is +1 on the near dome, −1 on the far dome
 * and 0 on the body. Interleaved like the cube (6 floats, 24-byte stride).
 * The body rings duplicate the dome equators so each keeps its own exact normal.
 */
export function roundedGeometry() {
  const rings = [];
  // Near dome, from the pole (+z) down to its equator.
  for (let i = 0; i <= DOME_RINGS; i++) {
    const phi = (Math.PI / 2) * (1 - i / DOME_RINGS);
    rings.push([0, Math.sin(phi), Math.cos(phi), 1]);
  }
  for (let i = 0; i <= BODY_RINGS; i++) rings.push([i / BODY_RINGS, 0, 1, 0]);
  // Far dome, from its equator down to the pole (−z).
  for (let i = 0; i <= DOME_RINGS; i++) {
    const phi = (-Math.PI / 2) * (i / DOME_RINGS);
    rings.push([1, Math.sin(phi), Math.cos(phi), -1]);
  }
  const columns = AROUND + 1,
    vertices = new Float32Array(rings.length * columns * 6),
    indices = [];
  let v = 0;
  for (const [t, sinPhi, cosPhi, end] of rings)
    for (let j = 0; j < columns; j++) {
      const theta = (j / AROUND) * Math.PI * 2;
      vertices.set([Math.cos(theta), Math.sin(theta), t, sinPhi, cosPhi, end], v);
      v += 6;
    }
  for (let r = 0; r + 1 < rings.length; r++)
    for (let j = 0; j < AROUND; j++) {
      const a = r * columns + j,
        b = a + columns;
      // Counter-clockwise seen from outside (+x at θ = 0, rings descending in z).
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  return { vertices, indices: new Uint16Array(indices) };
}

/**
 * Shared GLSL: place one vertex of either primitive. Boxes pass straight through. Rounded
 * vertices evaluate the profile s(t) = mix(1, taper, t) + bulge·hump(t), where hump rises
 * from 0 at the near end to 1 at `peak` and returns to 0 at the far end with zero slope at
 * all three points, then build an analytic normal (no per-vertex normal data is needed).
 */
export const SHAPE_GLSL = `
const float SHAPE_PI=3.14159265;
void shapeVertex(vec3 a,vec3 b,vec4 pose,vec4 size,out vec3 p,out vec3 n){
  if(pose.w<=0.0){p=a*size.xyz;n=b;return;}
  float tx=floor(pose.w)/1000.0, ty=fract(pose.w)*4.0001;
  float code=floor(size.w);
  float bulge=fract(size.w)*2.0-1.0;
  float flags=floor(code/100.0);
  float peak=clamp((code-flags*100.0)/100.0,0.01,0.99);
  bool flatNear=mod(flags,2.0)>0.5, flatFar=mod(floor(flags/2.0),2.0)>0.5, widthOnly=flags>3.5;
  float ax=size.x*0.5, ay=size.y*0.5;
  // Dome heights follow each end's smaller radius; flat ends keep a sliver for normals.
  float r0=min(ax,ay), r1=min(ax*tx,ay*ty);
  float c0=flatNear?r0*0.002:r0, c1=flatFar?r1*0.002:r1;
  float body=size.z-c0-c1;
  if(body<0.0){float k=size.z/(c0+c1);c0*=k;c1*=k;body=0.0;}
  float t=b.z>0.5?0.0:(b.z<-0.5?1.0:a.z);
  float hump, slope;
  if(t<peak){float u=SHAPE_PI*t/peak;hump=0.5-0.5*cos(u);slope=0.5*SHAPE_PI/peak*sin(u);}
  else{float u=SHAPE_PI*(t-peak)/(1.0-peak);hump=0.5+0.5*cos(u);slope=-0.5*SHAPE_PI/(1.0-peak)*sin(u);}
  // Separate width/depth scales: each axis has its own taper; a width-only bulge widens
  // hips without deepening them.
  float by=widthOnly?0.0:bulge;
  float sx=max(0.02,mix(1.0,tx,t)+bulge*hump), sy=max(0.02,mix(1.0,ty,t)+by*hump);
  float dsx=(tx-1.0)+bulge*slope, dsy=(ty-1.0)+by*slope;
  // Axis position of this ring's centre: near dome centre at the top, body runs down.
  float zc=size.z*0.5-c0-body*t;
  float k=body>0.0?ax*ay/body:0.0;
  vec2 ring=a.xy;
  // dP/dθ × dP/dz, with z decreasing as t grows: radii change by ds per -body of z.
  vec3 side=normalize(vec3(sy*ay*ring.x,sx*ax*ring.y,k*(sx*dsy*ring.y*ring.y+sy*dsx*ring.x*ring.x)));
  if(abs(b.z)<0.5){
    p=vec3(sx*ax*ring.x,sy*ay*ring.y,zc);
    n=side;
  } else {
    // Domes sit where the hump is zero. Their normals bend toward the body's sloped
    // normal near the equator, so a tapered shape shades without a crease at the seam.
    float c=b.z>0.5?c0:c1, sinPhi=b.x, cosPhi=b.y;
    p=vec3(sx*ax*cosPhi*ring.x,sy*ay*cosPhi*ring.y,zc+c*sinPhi);
    vec3 dome=normalize(vec3(cosPhi*ring.x/(sx*ax),cosPhi*ring.y/(sy*ay),sinPhi/c));
    vec3 equator=normalize(vec3(ring.x/(sx*ax),ring.y/(sy*ay),0.0));
    n=dome+(side-equator)*cosPhi*cosPhi;
  }
  n=normalize(n);
}
`;
