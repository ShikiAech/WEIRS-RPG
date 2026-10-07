import {
  Scene,
  OrthographicCamera,
  WebGLRenderer,
  Mesh,
  MeshStandardMaterial,
  Texture,
  SRGBColorSpace,
  HemisphereLight,
  DirectionalLight,
  PlaneGeometry,
  Quaternion,
  Euler,
  Box3,
  PCFShadowMap,
} from 'three';
import { asset } from '../../lib/paths';
import { geometryFromModel, resultOrientation } from './models';
import type { DiceModels } from './models';
import type { DicePlan } from './roll-plan';

export async function renderDice(
  host: HTMLDivElement,
  plan: DicePlan,
  signal: AbortSignal,
  done: () => void,
  failed: () => void,
  animate = true,
) {
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
  const [models, image] = await Promise.all([
    fetch(asset('dice/models.json'), { signal: deadline }).then(async (r) => {
      if (!r.ok) throw new Error('Modelos indisponíveis');
      return r.json() as Promise<DiceModels>;
    }),
    fetch(asset('dice/diffuse-light.png'), { signal: deadline }).then(async (r) => {
      if (!r.ok) throw new Error('Textura indisponível');
      return r.blob();
    }),
  ]);
  if (signal.aborted) return;
  const bitmap = await createImageBitmap(image, { imageOrientation: 'flipY' });
  if (signal.aborted) {
    bitmap.close();
    return;
  }
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ alpha: true, antialias: true });
  } catch (error) {
    bitmap.close();
    throw error;
  }
  const texture = new Texture(bitmap);
  texture.flipY = false;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  host.appendChild(renderer.domElement);
  const scene = new Scene();
  let frame = 0;
  let closed = false;
  let observer: ResizeObserver | undefined;
  const camera = new OrthographicCamera();
  camera.position.set(0, 15, 5);
  camera.lookAt(0, 0, 0);
  scene.add(new HemisphereLight(0xfff4d3, 0x534653, 2.7));
  const light = new DirectionalLight(0xffe5a0, 3.5);
  light.position.set(-5, 10, 3);
  light.castShadow = true;
  light.shadow.mapSize.set(512, 512);
  light.shadow.camera.left = light.shadow.camera.bottom = -12;
  light.shadow.camera.right = light.shadow.camera.top = 12;
  scene.add(light);
  const floor = new Mesh(
    new PlaneGeometry(40, 40),
    new MeshStandardMaterial({ color: 0x151319, roughness: 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const columns = Math.min(5, Math.ceil(Math.sqrt(plan.dice.length * 1.7)));
  const rows = Math.ceil(plan.dice.length / columns);
  const spacing = 2.6;
  const dice = (() => {
    try {
      return plan.dice.map((die, index) => {
        const model = models.meshes.find((m) => m.name === die.type);
        if (!model) throw new Error('Modelo ausente.');
        const geometry = geometryFromModel(model);
        const mesh = new Mesh(
          geometry,
          new MeshStandardMaterial({
            map: texture,
            color: die.kept ? 0xd4af37 : 0x87818c,
            roughness: 0.48,
            metalness: 0.25,
          }),
        );
        scene.add(mesh);
        // Mesmo tamanho aparente para os diferentes sólidos do catálogo.
        geometry.computeBoundingSphere();
        geometry.scale(
          1 / geometry.boundingSphere!.radius,
          1 / geometry.boundingSphere!.radius,
          1 / geometry.boundingSphere!.radius,
        );
        const final = resultOrientation(
          models,
          die.type,
          die.value,
          (((index * 0.73) % 1) - 0.5) * 0.65,
        );
        mesh.quaternion.copy(final);
        const height = -new Box3().setFromObject(mesh).min.y + 0.015;
        const x = ((index % columns) - (columns - 1) / 2) * spacing;
        const z = (Math.floor(index / columns) - (rows - 1) / 2) * spacing;
        mesh.castShadow = true;
        mesh.position.set(x, height, z);
        return { mesh, final, height, x, z, index };
      });
    } catch (error) {
      dispose();
      throw error;
    }
  })();
  const spin = new Quaternion();
  const euler = new Euler();
  function updatePose(progress: number) {
    for (const die of dice) {
      const remaining = 1 - progress;
      const eased = 1 - remaining ** 3;
      const angle = remaining ** 2 * Math.PI * (5 + (die.index % 3));
      spin.setFromEuler(euler.set(angle, angle * 0.6, angle * 0.8));
      die.mesh.quaternion.copy(die.final).multiply(spin);
      die.mesh.position.set(
        die.x - remaining ** 2 * (3 + (die.index % 2)),
        die.height + Math.abs(Math.sin(progress * Math.PI * 3.5)) * remaining * 3,
        die.z + (1 - eased) * Math.sin(die.index + 1) * 2,
      );
    }
  }
  // O primeiro quadro já é o lançamento, evitando um flash da pose final.
  if (animate) updatePose(0);
  observer = new ResizeObserver(resize);
  function resize() {
    if (closed) return;
    const width = Math.max(1, host.clientWidth),
      height = Math.max(1, host.clientHeight);
    const halfHeight = Math.max(
      3.4,
      (rows * spacing) / 2 + 1.8,
      ((columns * spacing) / 2 + 1.5) / (width / height),
    );
    camera.left = (-halfHeight * width) / height;
    camera.right = -camera.left;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.near = 0.1;
    camera.far = 60;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    try {
      renderer.render(scene, camera);
    } catch {
      dispose();
      failed();
    }
  }
  function dispose() {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(frame);
    observer?.disconnect();
    renderer.domElement.removeEventListener('webglcontextlost', contextLost);
    signal.removeEventListener('abort', dispose);
    scene.traverse((object) => {
      if (object instanceof DirectionalLight) object.shadow.dispose();
      if (object instanceof Mesh) {
        object.geometry.dispose();
        (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) =>
          material.dispose(),
        );
      }
    });
    texture.dispose();
    bitmap.close();
    renderer.dispose();
    if (!renderer.getContext().isContextLost()) renderer.forceContextLoss();
    renderer.domElement.remove();
  }
  function contextLost(event: Event) {
    event.preventDefault();
    dispose();
    failed();
  }
  renderer.domElement.addEventListener('webglcontextlost', contextLost);
  signal.addEventListener('abort', dispose, { once: true });
  observer.observe(host);
  resize();
  const start = performance.now();
  if (!animate || closed) return dispose;
  function tick(now: number) {
    if (closed) return;
    const progress = Math.min(1, (now - start) / 2100);
    updatePose(progress);
    try {
      renderer.render(scene, camera);
    } catch {
      dispose();
      failed();
      return;
    }
    if (progress < 1) frame = requestAnimationFrame(tick);
    else done(); // Nenhum loop continua rodando quando os dados param.
  }
  frame = requestAnimationFrame(tick);
  return dispose;
}
