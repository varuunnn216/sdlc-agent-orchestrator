import { useEffect, useRef, useState } from 'react';
import './FloatingLines.css';

interface FloatingLinesProps {
  status?: string;
  interactive?: boolean;
  clickEffect?: boolean;
}

const VERT_SRC = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG_SRC = `
precision mediump float;
varying vec2 v_uv;
uniform float u_time;
uniform vec2 u_res;
uniform vec3 u_color;
uniform float u_brightness;
uniform float u_lines;
uniform vec2 u_mouse;
uniform float u_mouseActive;
uniform vec2 u_click;
uniform float u_clickStrength;

void main() {
  vec2 uv = v_uv;
  float aspect = u_res.x / max(u_res.y, 1.0);
  vec2 p = vec2(uv.x * aspect, uv.y);

  // Subtle cursor parting
  vec2 m = vec2(u_mouse.x * aspect, u_mouse.y);
  vec2 dm = p - m;
  float md = length(dm);
  float part = exp(-md * md * 18.0) * 0.045 * u_mouseActive;
  float yShift = (dm.y >= 0.0 ? 1.0 : -1.0) * part;

  // Click curl distortion
  vec2 c = vec2(u_click.x * aspect, u_click.y);
  vec2 dc = p - c;
  float cd = length(dc);
  float curl = sin(cd * 26.0 - (1.0 - u_clickStrength) * 8.0)
             * exp(-cd * 6.0) * 0.035 * u_clickStrength;

  float acc = 0.0;
  float count = u_lines;
  for (int i = 0; i < 16; i++) {
    float fi = float(i);
    if (fi >= count) break;
    float base = (fi + 0.5) / count;
    float wave = sin(uv.x * (3.2 + fi * 0.23) + u_time * (0.55 + fi * 0.04) + fi * 1.1) * 0.035
               + cos(uv.x * 1.7 - u_time * 0.32 + fi * 0.7) * 0.02;
    float lineY = base + wave + yShift + curl;
    float dist = abs(uv.y - lineY);
    float w = 0.0022;
    float line = smoothstep(w * 2.4, 0.0, dist);
    acc += line * (0.45 + 0.55 * sin(fi * 1.7 + u_time * 0.4) * 0.5 + 0.25);
  }

  float alpha = clamp(acc * u_brightness, 0.0, 0.85);
  gl_FragColor = vec4(u_color * alpha, alpha);
}
`;

export default function FloatingLines({
  status = 'idle',
  interactive = true,
  clickEffect = true,
}: FloatingLinesProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const statusRef = useRef(status);
  const pulseUntilRef = useRef<number>(0);
  const pulseKindRef = useRef<'done' | 'failed' | null>(null);

  const [useFallback, setUseFallback] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    const prev = statusRef.current;
    statusRef.current = status;
    if (prev !== status) {
      if (status === 'done' || status === 'approved') {
        pulseKindRef.current = 'done';
        pulseUntilRef.current = performance.now() + 750;
      } else if (
        status === 'failed' ||
        status === 'rejected' ||
        status === 'budget_exceeded'
      ) {
        pulseKindRef.current = 'failed';
        pulseUntilRef.current = performance.now() + 750;
      } else {
        pulseKindRef.current = null;
      }
    }
  }, [status]);

  useEffect(() => {
    if (useFallback) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: false,
      powerPreference: 'low-power',
    });
    if (!gl) {
      setUseFallback(true);
      return;
    }

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type);
      if (!sh) return null;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        gl.deleteShader(sh);
        return null;
      }
      return sh;
    };

    const vs = compile(gl.VERTEX_SHADER, VERT_SRC);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG_SRC);
    if (!vs || !fs) {
      setUseFallback(true);
      return;
    }

    const prog = gl.createProgram();
    if (!prog) {
      setUseFallback(true);
      return;
    }
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      setUseFallback(true);
      return;
    }

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );

    const aPos = gl.getAttribLocation(prog, 'a_pos');
    const uTime = gl.getUniformLocation(prog, 'u_time');
    const uRes = gl.getUniformLocation(prog, 'u_res');
    const uColor = gl.getUniformLocation(prog, 'u_color');
    const uBrightness = gl.getUniformLocation(prog, 'u_brightness');
    const uLines = gl.getUniformLocation(prog, 'u_lines');
    const uMouse = gl.getUniformLocation(prog, 'u_mouse');
    const uMouseActive = gl.getUniformLocation(prog, 'u_mouseActive');
    const uClick = gl.getUniformLocation(prog, 'u_click');
    const uClickStrength = gl.getUniformLocation(prog, 'u_clickStrength');

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener('resize', resize);

    let mouseX = 0.5;
    let mouseY = 0.5;
    let mouseActive = 0;
    let clickX = 0.5;
    let clickY = 0.5;
    let clickStrength = 0;

    const onPointerMove = (e: PointerEvent) => {
      if (!interactive) return;
      mouseX = e.clientX / Math.max(window.innerWidth, 1);
      mouseY = 1 - e.clientY / Math.max(window.innerHeight, 1);
      mouseActive = 1;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!clickEffect) return;
      clickX = e.clientX / Math.max(window.innerWidth, 1);
      clickY = 1 - e.clientY / Math.max(window.innerHeight, 1);
      clickStrength = 1;
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });

    const [baseR, baseG, baseB] = [0.894, 0.894, 0.906]; // #E4E4E7 silver
    const [errR, errG, errB] = [0.937, 0.267, 0.267]; // #EF4444

    let rafId = 0;
    let lastFrame = 0;
    let simTime = 0;
    let curSpeed = 0.35;
    let curBrightness = 0.34;
    let curRedMix = 0;

    const render = (now: number) => {
      if (document.visibilityState === 'hidden') {
        rafId = 0;
        return;
      }
      rafId = window.requestAnimationFrame(render);
      if (now - lastFrame < 33.3) return; // 30 fps cap
      const dt = Math.min(0.1, (now - (lastFrame || now)) / 1000);
      lastFrame = now;

      const s = statusRef.current;
      const inPulse = now < pulseUntilRef.current;
      let targetSpeed = 0.35;
      let targetBrightness = 0.34;
      let targetRed = 0;

      if (inPulse && pulseKindRef.current === 'done') {
        targetSpeed = 1.1;
        targetBrightness = 0.72;
      } else if (inPulse && pulseKindRef.current === 'failed') {
        targetSpeed = 0.7;
        targetBrightness = 0.62;
        targetRed = 1;
      } else if (s === 'running') {
        targetSpeed = 0.95;
        targetBrightness = 0.58;
      } else if (s === 'awaiting_approval') {
        targetSpeed = 0.4;
        targetBrightness = 0.34 + 0.12 * Math.sin(now * 0.0022);
      }

      const ease = 1 - Math.exp(-dt / 0.22); // ~600ms eased transition
      curSpeed += (targetSpeed - curSpeed) * ease;
      curBrightness += (targetBrightness - curBrightness) * ease;
      curRedMix += (targetRed - curRedMix) * ease;
      simTime += dt * curSpeed;

      clickStrength = Math.max(0, clickStrength - dt * 1.6);
      mouseActive = Math.max(0, mouseActive - dt * 0.4);

      const isMobile = window.innerWidth <= 640;

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(prog);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
      gl.uniform1f(uTime, simTime);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform3f(
        uColor,
        baseR + (errR - baseR) * curRedMix,
        baseG + (errG - baseG) * curRedMix,
        baseB + (errB - baseB) * curRedMix
      );
      gl.uniform1f(uBrightness, curBrightness);
      gl.uniform1f(uLines, isMobile ? 7.0 : 14.0);
      gl.uniform2f(uMouse, mouseX, mouseY);
      gl.uniform1f(uMouseActive, mouseActive);
      gl.uniform2f(uClick, clickX, clickY);
      gl.uniform1f(uClickStrength, clickStrength);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && rafId === 0) {
        lastFrame = performance.now();
        rafId = window.requestAnimationFrame(render);
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    rafId = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('visibilitychange', onVisibility);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, [interactive, clickEffect, useFallback]);

  return (
    <div className="rb-floating-lines-wrap" aria-hidden="true">
      {useFallback ? (
        <div className="rb-floating-lines-fallback" />
      ) : (
        <canvas ref={canvasRef} className="rb-floating-lines-canvas" />
      )}
    </div>
  );
}
