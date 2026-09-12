import React, { useRef, useMemo, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

export type PresenceState = "idle" | "listening" | "thinking" | "speaking" | "error";

const COLOR: Record<PresenceState, string> = {
  idle: "#9b8ec7",
  listening: "#22d3ee",
  thinking: "#a78bfa",
  speaking: "#d8c4ff",
  error: "#f43f5e",
};

/**
 * A fine armillary form: three thin rings on different axes plus a small
 * orbiting satellite and a core. Real depth comes from actual 3D rotation and
 * lighting, not faux shadows — but it stays small and quiet rather than
 * becoming a globe.
 */
function Armillary({
  state,
  levelRef,
  reducedMotion,
}: {
  state: PresenceState;
  levelRef: React.MutableRefObject<number>;
  reducedMotion?: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const rings = useRef<THREE.Mesh[]>([]);
  const satellite = useRef<THREE.Mesh>(null);
  const core = useRef<THREE.Mesh>(null);
  const mats = useRef<(THREE.MeshStandardMaterial | THREE.MeshBasicMaterial)[]>([]);
  const target = useMemo(() => new THREE.Color(), []);

  useFrame((clock, delta) => {
    const t = clock.clock.elapsedTime;
    const voice = levelRef.current;
    target.set(COLOR[state]);

    mats.current.forEach((m) => {
      if (!m) return;
      m.color.lerp(target, delta * 4);
      if ((m as THREE.MeshStandardMaterial).emissive) {
        (m as THREE.MeshStandardMaterial).emissive.lerp(target, delta * 4);
      }
    });

    if (reducedMotion || !group.current) return;

    const speed =
      state === "speaking" ? 0.45 + voice * 1.9
      : state === "thinking" ? 1.05
      : state === "listening" ? 0.4
      : 0.14;

    group.current.rotation.y += delta * speed;
    group.current.rotation.x += delta * speed * 0.26;

    rings.current.forEach((r, i) => {
      if (!r) return;
      r.rotation.z += delta * speed * (i % 2 === 0 ? 0.8 : -0.55);
      // Thinking draws the rings inward — energy concentrating.
      const contract = state === "thinking" ? 0.9 + Math.sin(t * 3 + i) * 0.05 : 1;
      const swell = state === "speaking" ? 1 + voice * 0.3 : 1 + Math.sin(t * 0.85 + i) * 0.025;
      r.scale.setScalar(contract * swell);
    });

    // Satellite sweeps faster while she thinks — the clearest visual tell
    if (satellite.current) {
      const orbitSpeed = state === "thinking" ? 3.4 : state === "speaking" ? 1.6 + voice * 2 : 0.6;
      const a = t * orbitSpeed;
      const r = state === "thinking" ? 0.72 : 0.95;
      satellite.current.position.set(Math.cos(a) * r, Math.sin(a * 0.7) * r * 0.5, Math.sin(a) * r);
      satellite.current.scale.setScalar(state === "thinking" ? 1.35 : 1);
    }

    if (core.current) {
      const pulse =
        state === "speaking" ? 1 + voice * 0.85
        : state === "thinking" ? 1 + Math.sin(t * 5.5) * 0.22
        : 1 + Math.sin(t * 1.1) * 0.07;
      core.current.scale.setScalar(pulse);
    }
  });

  const ringDefs = [
    { rot: [0, 0, 0], radius: 1, thick: 0.019 },
    { rot: [Math.PI / 2.4, 0, Math.PI / 6], radius: 0.83, thick: 0.016 },
    { rot: [Math.PI / 1.7, Math.PI / 3, 0], radius: 0.66, thick: 0.013 },
  ];

  return (
    <group ref={group}>
      {ringDefs.map((r, i) => (
        <mesh key={i} rotation={r.rot as [number, number, number]} ref={(el) => { if (el) rings.current[i] = el; }}>
          <torusGeometry args={[r.radius, r.thick, 16, 128]} />
          <meshStandardMaterial
            ref={(el) => { if (el) mats.current[i] = el as THREE.MeshStandardMaterial; }}
            color={COLOR[state]}
            emissive={COLOR[state]}
            emissiveIntensity={0.7}
            roughness={0.25}
            metalness={0.6}
            transparent
            opacity={0.92 - i * 0.12}
          />
        </mesh>
      ))}

      <mesh ref={satellite}>
        <sphereGeometry args={[0.042, 16, 16]} />
        <meshStandardMaterial
          ref={(el) => { if (el) mats.current[3] = el as THREE.MeshStandardMaterial; }}
          color={COLOR[state]}
          emissive={COLOR[state]}
          emissiveIntensity={2}
          roughness={0.1}
        />
      </mesh>

      <mesh ref={core}>
        <sphereGeometry args={[0.085, 24, 24]} />
        <meshStandardMaterial
          ref={(el) => { if (el) mats.current[4] = el as THREE.MeshStandardMaterial; }}
          color={COLOR[state]}
          emissive={COLOR[state]}
          emissiveIntensity={1.6}
          roughness={0.15}
          metalness={0.3}
        />
      </mesh>
    </group>
  );
}

/** Subtle pointer parallax. The camera drifts a fraction of the pointer
 *  offset and always eases back toward centre - enough that the mark reads
 *  as a real object sitting in space, not so much that it's distracting. */
function CameraParallax({ enabled }: { enabled: boolean }) {
  const { camera } = useThree();
  const target = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!enabled) return;
    const onMove = (e: PointerEvent) => {
      target.current.x = (e.clientX / window.innerWidth - 0.5) * 0.9;
      target.current.y = -(e.clientY / window.innerHeight - 0.5) * 0.6;
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [enabled]);

  useFrame((_, delta) => {
    camera.position.x += (target.current.x - camera.position.x) * delta * 2;
    camera.position.y += (target.current.y - camera.position.y) * delta * 2;
    camera.lookAt(0, 0, 0);
  });
  return null;
}

function Lights({ state, levelRef }: { state: PresenceState; levelRef: React.MutableRefObject<number> }) {
  const key = useRef<THREE.PointLight>(null);
  useFrame((_, delta) => {
    if (!key.current) return;
    const target = state === "speaking" ? 3 + levelRef.current * 5 : state === "thinking" ? 3.4 : 2;
    key.current.intensity += (target - key.current.intensity) * delta * 5;
    key.current.color.lerp(new THREE.Color(COLOR[state]), delta * 4);
  });
  return (
    <>
      <ambientLight intensity={0.45} />
      <pointLight ref={key} position={[2, 2, 3]} intensity={2} distance={12} />
      <pointLight position={[-2.5, -1.5, -2]} intensity={0.7} color="#22d3ee" distance={10} />
    </>
  );
}

export default function PresenceMark({
  state,
  levelRef,
  size = 52,
  reducedMotion,
}: {
  state: PresenceState;
  levelRef: React.MutableRefObject<number>;
  size?: number;
  reducedMotion?: boolean;
}) {
  return (
    <div style={{ width: size, height: size, flexShrink: 0 }}>
      <Canvas
        camera={{ position: [0, 0, 3.1], fov: 42 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
        style={{ width: "100%", height: "100%" }}
        onCreated={({ gl }) => {
          // A lost context normally kills the canvas permanently. Preventing
          // the default lets the browser restore it instead - happens on tab
          // backgrounding, GPU driver resets, and during Vite hot-reload.
          const canvas = gl.domElement;
          canvas.addEventListener(
            "webglcontextlost",
            (e) => {
              e.preventDefault();
              console.warn("Estrella: WebGL context lost, awaiting restore.");
            },
            false
          );
        }}
      >
        <Lights state={state} levelRef={levelRef} />
        <CameraParallax enabled={!reducedMotion} />
        <Armillary state={state} levelRef={levelRef} reducedMotion={reducedMotion} />
      </Canvas>
    </div>
  );
}
