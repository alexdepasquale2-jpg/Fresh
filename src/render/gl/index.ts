/**
 * Shared WebGL2 core. Context-loss recovery, palette-indexed pixel-perfect
 * blit, fullscreen quad helper, DPR-capped integer scaling and a frame loop
 * with a dt accumulator. Units draw through GlCore; never edit this file.
 */
import type { GlCore } from '@/contracts/render';

const QUAD_VS = `#version 300 es
in vec2 a_pos; out vec2 v_uv;
void main(){ v_uv = a_pos*0.5+0.5; gl_Position = vec4(a_pos,0.0,1.0); }`;

const BLIT_VS = `#version 300 es
in vec2 a_pos; uniform vec4 u_rect; out vec2 v_uv;
void main(){ v_uv = vec2(a_pos.x*0.5+0.5, 0.5-a_pos.y*0.5);
  vec2 p = u_rect.xy + (a_pos*0.5+0.5)*u_rect.zw; gl_Position = vec4(p,0.0,1.0); }`;
const BLIT_FS = `#version 300 es
precision mediump float; precision highp usampler2D;
in vec2 v_uv; uniform usampler2D u_idx; uniform sampler2D u_pal; out vec4 o;
void main(){ uint i = texture(u_idx, v_uv).r; o = texelFetch(u_pal, ivec2(int(i & 15u), 0), 0); }`;

export const FULLSCREEN_VS = QUAD_VS;

export const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Largest integer scale so (w*scale) fits in device px, capped at maxDpr. */
export const integerScale = (dpr: number, maxDpr = 3): number => Math.max(1, Math.floor(Math.min(dpr, maxDpr)));

export interface CreateGlOptions {
  maxDpr?: number;
  /** Multiplier from Perf.resolutionScale(), 0.5..1. */
  resolutionScale?: () => number;
}

export const createGlCore = (canvas: HTMLCanvasElement, opts: CreateGlOptions = {}): GlCore => {
  const maxDpr = opts.maxDpr ?? 2;
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: false });
  if (!gl) throw new Error('WebGL2 not available');
  const restoreCbs = new Set<() => void>();
  let isLost = false;
  let quadBuf: WebGLBuffer | null = null;
  let vao: WebGLVertexArrayObject | null = null;
  let blitProg: WebGLProgram | null = null;

  const compile = (type: number, src: string): WebGLShader => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) {
      throw new Error(`shader: ${gl.getShaderInfoLog(s)}`);
    }
    return s;
  };
  const program = (vs: string, fs: string): WebGLProgram => {
    const p = gl.createProgram()!;
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'a_pos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) {
      throw new Error(`link: ${gl.getProgramInfoLog(p)}`);
    }
    return p;
  };
  const setup = () => {
    quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    blitProg = program(BLIT_VS, BLIT_FS);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  };
  setup();

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    isLost = true;
  });
  canvas.addEventListener('webglcontextrestored', () => {
    isLost = false;
    setup();
    for (const cb of restoreCbs) cb();
  });

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const scale = integerScale(window.devicePixelRatio || 1, maxDpr) * (opts.resolutionScale?.() ?? 1);
    const w = Math.max(1, Math.round(rect.width * scale));
    const h = Math.max(1, Math.round(rect.height * scale));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  };

  const core: GlCore = {
    gl,
    canvas,
    width: () => canvas.clientWidth,
    height: () => canvas.clientHeight,
    pixelScale: () => integerScale(window.devicePixelRatio || 1, maxDpr),
    program,
    quad: (p) => {
      resize();
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(p);
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    indexTexture: (w, h) => {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, w, h, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, null);
      return t;
    },
    uploadIndices: (tex, w, h, data, rows) => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      if (rows) {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, rows.y, w, rows.h, gl.RED_INTEGER, gl.UNSIGNED_BYTE, data.subarray(rows.y * w, (rows.y + rows.h) * w));
      } else {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RED_INTEGER, gl.UNSIGNED_BYTE, data);
      }
    },
    paletteTexture: (palette) => {
      const px = new Uint8Array(16 * 4);
      palette.slice(0, 16).forEach((hex, i) => {
        const [r, g, b] = hexToRgb(hex);
        px.set([r, g, b, 255], i * 4);
      });
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 16, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return t;
    },
    blit: (index, palette, srcW, srcH, dest) => {
      resize();
      const cw = canvas.clientWidth || 1;
      const ch = canvas.clientHeight || 1;
      // Integer-scale the source inside dest for crisp pixels.
      const s = Math.max(1, Math.floor(Math.min((dest.w * core.pixelScale()) / srcW, (dest.h * core.pixelScale()) / srcH))) / core.pixelScale();
      const w = srcW * s;
      const h = srcH * s;
      const x = dest.x + (dest.w - w) / 2;
      const y = dest.y + (dest.h - h) / 2;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(blitProg);
      gl.uniform4f(gl.getUniformLocation(blitProg!, 'u_rect'), (x / cw) * 2 - 1, 1 - ((y + h) / ch) * 2, (w / cw) * 2, (h / ch) * 2);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, index);
      gl.uniform1i(gl.getUniformLocation(blitProg!, 'u_idx'), 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, palette);
      gl.uniform1i(gl.getUniformLocation(blitProg!, 'u_pal'), 1);
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    clear: (hex) => {
      resize();
      const [r, g, b] = hexToRgb(hex);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(r / 255, g / 255, b / 255, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    },
    onRestore: (cb) => {
      restoreCbs.add(cb);
      return () => void restoreCbs.delete(cb);
    },
    lost: () => isLost || gl.isContextLost(),
  };
  return core;
};

/**
 * Frame loop with a fixed-step accumulator. `fixed` runs at stepMs intervals
 * (max maxSteps per frame); `frame` runs once per rAF with the real dt.
 */
export interface FrameLoop {
  start(): void;
  stop(): void;
}
export const createFrameLoop = (o: {
  stepMs: number;
  maxSteps?: number;
  fixed: (steps: number) => void;
  frame: (dtMs: number) => void;
  /** Called when a frame throws; the loop carries on regardless. */
  onError?: (e: unknown) => void;
}): FrameLoop => {
  let acc = 0;
  let last = 0;
  let id = 0;
  const loop = (t: number) => {
    const dt = last ? Math.min(250, t - last) : 0;
    last = t;
    acc += dt;
    let steps = Math.floor(acc / o.stepMs);
    acc -= steps * o.stepMs;
    steps = Math.min(steps, o.maxSteps ?? 5);
    // The next frame is asked for first, so one frame that throws can never stop the game.
    id = requestAnimationFrame(loop);
    try {
      if (steps > 0) o.fixed(steps);
      o.frame(dt);
    } catch (e) {
      o.onError?.(e);
    }
  };
  return {
    start: () => {
      last = 0;
      id = requestAnimationFrame(loop);
    },
    stop: () => cancelAnimationFrame(id),
  };
};
