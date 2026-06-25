import { Color, ShaderMaterial, Vector3 } from 'three';

const vertexShader = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uSunDirection;
  uniform vec3 uSandColor;
  uniform vec3 uRockColor;
  uniform vec3 uGrassColor;
  uniform float uTime;

  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float ripple(vec2 p) {
    float r = sin(p.x * 18.0 + uTime * 0.3) * 0.5 + sin(p.y * 14.0) * 0.5;
    return r * 0.04;
  }

  void main() {
    vec3 n = normalize(vNormal);
    float slope = 1.0 - abs(n.y);
    float rippleN = ripple(vWorldPos.xz * 0.35);

    vec3 sand = uSandColor * (0.92 + rippleN);
    vec3 rock = uRockColor * (0.85 + hash(vWorldPos.xz * 0.1) * 0.15);
    vec3 grass = uGrassColor * (0.9 + hash(vWorldPos.xz * 0.2) * 0.1);

    float biomeSand = smoothstep(0.05, 0.35, 1.0 - slope) * (1.0 - smoothstep(0.5, 0.85, vWorldPos.y * 0.02));
    float biomeRock = smoothstep(0.25, 0.65, slope);
    float biomeGrass = (1.0 - biomeSand - biomeRock) * smoothstep(8.0, 14.0, vWorldPos.y);

    vec3 base = sand * biomeSand + rock * biomeRock + grass * biomeGrass;
    base = mix(base, rock, smoothstep(0.35, 0.75, slope));

    float ndl = max(dot(n, normalize(uSunDirection)), 0.0);
    float ambient = 0.28;
    vec3 lit = base * (ambient + ndl * 0.72);

    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float rim = pow(1.0 - max(dot(viewDir, n), 0.0), 3.0) * 0.12;
    lit += vec3(1.0, 0.95, 0.85) * rim;

    gl_FragColor = vec4(lit, 1.0);
  }
`;

export function createTerrainMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uSunDirection: { value: new Vector3(0.5, 0.8, 0.3).normalize() },
      uSandColor: { value: new Color(0xd4a574) },
      uRockColor: { value: new Color(0xb45309) },
      uGrassColor: { value: new Color(0x4ade80) },
      uTime: { value: 0 },
    },
  });
}

export function updateTerrainMaterialTime(material: ShaderMaterial, time: number): void {
  material.uniforms['uTime']!.value = time;
}

export function setTerrainSunDirection(material: ShaderMaterial, x: number, y: number, z: number): void {
  material.uniforms['uSunDirection']!.value.set(x, y, z).normalize();
}
