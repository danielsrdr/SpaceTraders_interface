import { Color, DoubleSide, ShaderMaterial, Vector3 } from 'three';

export interface LitPlanetMaterialOptions {
  baseColor: number;
  glowColor: number;
  sunPosition?: Vector3;
}

export function createLitPlanetMaterial(options: LitPlanetMaterialOptions): ShaderMaterial {
  const base = new Color(options.baseColor);
  const glow = new Color(options.glowColor);
  const sunPos = options.sunPosition?.clone() ?? new Vector3(0, 0, 0);

  return new ShaderMaterial({
    uniforms: {
      sunPosition: { value: sunPos },
      baseColor: { value: new Vector3(base.r, base.g, base.b) },
      glowColor: { value: new Vector3(glow.r, glow.g, glow.b) },
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
      uniform vec3 sunPosition;
      uniform vec3 baseColor;
      uniform vec3 glowColor;
      varying vec3 vNormal;
      varying vec3 vWorldPos;

      void main() {
        vec3 normal = normalize(vNormal);
        vec3 toSun = normalize(sunPosition - vWorldPos);
        vec3 viewDir = normalize(cameraPosition - vWorldPos);

        float diffuse = max(dot(normal, toSun), 0.0);
        float rim = pow(1.0 - max(dot(viewDir, normal), 0.0), 2.8) * 0.55;
        float night = smoothstep(0.0, 0.35, diffuse);

        vec3 daySide = baseColor * (0.15 + diffuse * 0.95);
        vec3 nightSide = baseColor * 0.04;
        vec3 surface = mix(nightSide, daySide, night);
        surface += glowColor * rim * (0.35 + diffuse * 0.65);

        gl_FragColor = vec4(surface, 1.0);
      }
    `,
    side: DoubleSide,
  });
}

export function updateLitPlanetSun(material: ShaderMaterial, sunPosition: Vector3): void {
  material.uniforms['sunPosition']!.value.copy(sunPosition);
}
