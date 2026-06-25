import {
  AdditiveBlending,
  BackSide,
  Color,
  Group,
  Mesh,
  PointLight,
  ShaderMaterial,
  SphereGeometry,
} from 'three';
import { NOISE_GLSL } from './shader-noise.glsl';

export interface SystemSunResult {
  group: Group;
  light: PointLight;
}

function createSunCoreMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uHot: { value: new Color(0xfff3c0) },
      uCool: { value: new Color(0xff8a1e) },
    },
    vertexShader: `
      varying vec3 vObjPos;
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      void main() {
        vObjPos = position;
        vNormal = normalize(normalMatrix * normal);
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPos = world.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uHot;
      uniform vec3 uCool;
      varying vec3 vObjPos;
      varying vec3 vNormal;
      varying vec3 vWorldPos;

      ${NOISE_GLSL}

      void main() {
        vec3 sp = normalize(vObjPos);
        vec3 flow = vec3(uTime * 0.05, uTime * 0.03, -uTime * 0.04);
        float gran = fbm(sp * 4.0 + flow, 5) * 0.5 + 0.5;
        float gran2 = ridgedFbm(sp * 8.0 + flow * 1.7, 4);
        float heat = clamp(gran * 0.7 + gran2 * 0.5, 0.0, 1.0);

        float pulse = 0.95 + 0.05 * sin(uTime * 0.8);
        vec3 color = mix(uCool, uHot, heat) * (0.85 + heat * 0.6) * pulse;

        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float limb = pow(max(dot(viewDir, normalize(vNormal)), 0.0), 0.55);
        color *= mix(0.55, 1.15, limb);

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
}

function createSunGlowMaterial(color: number, intensity: number, power: number): ShaderMaterial {
  const c = new Color(color);
  return new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new Color(c.r, c.g, c.b) },
      uIntensity: { value: intensity },
      uPower: { value: power },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPos = world.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uIntensity;
      uniform float uPower;
      varying vec3 vNormal;
      varying vec3 vWorldPos;

      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float fres = pow(1.0 - abs(dot(viewDir, normalize(vNormal))), uPower);
        float pulse = 0.9 + 0.1 * sin(uTime * 0.6);
        float alpha = clamp(fres * uIntensity * pulse, 0.0, 1.0);
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    blending: AdditiveBlending,
    side: BackSide,
    depthWrite: false,
  });
}

export function buildSystemSun(radius = 14): SystemSunResult {
  const group = new Group();
  group.name = 'system-sun';

  const core = new Mesh(new SphereGeometry(radius, 64, 64), createSunCoreMaterial());
  group.add(core);

  const innerGlow = new Mesh(
    new SphereGeometry(radius * 1.35, 32, 32),
    createSunGlowMaterial(0xffdd55, 0.9, 2.0),
  );
  group.add(innerGlow);

  const corona = new Mesh(
    new SphereGeometry(radius * 2.2, 32, 32),
    createSunGlowMaterial(0xff9933, 0.5, 2.6),
  );
  group.add(corona);

  const outerHalo = new Mesh(
    new SphereGeometry(radius * 3.5, 24, 24),
    createSunGlowMaterial(0xff6600, 0.25, 3.2),
  );
  group.add(outerHalo);

  const light = new PointLight(new Color(0xffeebb), 3.5, 0, 1.4);
  light.position.set(0, 0, 0);
  group.add(light);

  return { group, light };
}
