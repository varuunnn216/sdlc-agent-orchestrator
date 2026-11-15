import { useEffect, useRef, useState } from 'react';
import './LightRays.css';

interface LightRaysProps {
  raysColor?: string;
  status?: string;
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

void main() {
  vec2 uv = v_uv;
  vec2 origin = vec2(0.5, 1.08);
  vec2 d = uv - origin;
  d.x *= u_res.x / max(u_res.y, 1.0);

  float angle = atan(d.y, d.x);
  float dist = length(d);

  float ray1 = sin(angle * 9.0 + u_time * 0.25) * 0.5 + 0.5;
  float ray2 = sin(angle * 15.0 - u_time * 0.18 + 1.3) * 0.5 + 0.5;
  float rays = pow(ray1 * 0.6 + ray2 * 0.4, 2.2);

  float spread = smoothstep(1.35, 0.05, dist);
  float topFade = smoothstep(0.0, 0.95, uv.y);
  float alpha = (rays * 0.72 + 0.28) * spread * topFade * u_brightness;

  gl_FragColor = vec4(u_color * alpha, alpha);
}
`;

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  if (Number.isNaN(num)) return [0.81, 0.98, 0.99];
  return [((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255];
}

export default function LightRays({
  raysColor = '#CFFAFE',
  status = 'idle',
}: LightRaysProps) {
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

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.floor(canvas.clientWidth * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    resize();
    window.addEventListener('resize', resize);

    const [baseR, baseG, baseB] = hexToRgb(raysColor);
    const [errR, errG, errB] = [0.937, 0.267, 0.267]; // #EF4444

    let rafId = 0;
    let lastFrame = 0;
    let simTime = 0;
    let curSpeed = 0.6;
    let curBrightness = 0.2;
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
      let targetSpeed = 0.6;
      let targetBrightness = 0.2;
      let targetRed = 0;

      if (inPulse && pulseKindRef.current === 'done') {
        targetSpeed = 1.4;
        targetBrightness = 0.46;
      } else if (inPulse && pulseKindRef.current === 'failed') {
        targetSpeed = 1.0;
        targetBrightness = 0.36;
        targetRed = 1;
      } else if (s === 'running') {
        targetSpeed = 1.5;
        targetBrightness = 0.34;
      } else if (s === 'awaiting_approval') {
        targetSpeed = 0.7;
        targetBrightness = 0.24 + 0.07 * Math.sin(now * 0.0022);
      }

      const ease = 1 - Math.exp(-dt / 0.22); // ~600ms eased transition
      curSpeed += (targetSpeed - curSpeed) * ease;
      curBrightness += (targetBrightness - curBrightness) * ease;
      curRedMix += (targetRed - curRedMix) * ease;
      simTime += dt * curSpeed;

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
      document.removeEventListener('visibilitychange', onVisibility);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, [raysColor, useFallback]);

  return (
    <div className="rb-light-rays-wrap" aria-hidden="true">
      {useFallback ? (
        <div className="rb-light-rays-fallback" />
      ) : (
        <canvas ref={canvasRef} className="rb-light-rays-canvas" />
      )}
    </div>
  );
}
