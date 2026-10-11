import {
  Scene,
  OrthographicCamera,
  WebGLRenderer,
  Mesh,
  MeshStandardMaterial,
  Texture,
  CanvasTexture,
  RepeatWrapping,
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
import { diceFrustum } from './framing';
import type { DiceModels } from './models';
import type { DicePlan } from './roll-plan';

function feltTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) return;
  const grain = context.createImageData(256, 256);
  for (let pixel = 0; pixel < 256 * 256; pixel++) {
    // Larger grain survives downsampling in the compact tray.
    const patch = Math.floor((pixel % 256) / 4) + Math.floor(pixel / 1024) * 64;
    const hash = Math.imul(patch + 1, 1664525) ^ Math.imul(patch + 17, 1013904223);
    const shade = ((hash >>> 16) & 31) - 15;
    grain.data[pixel * 4] = 23 + shade;
    grain.data[pixel * 4 + 1] = 28 + shade;
    grain.data[pixel * 4 + 2] = 24 + shade;
    grain.data[pixel * 4 + 3] = 255;
  }
  context.putImageData(grain, 0, 0);
  // Broad diagonal bands provide fixed landmarks, including at smaller zoom levels.
  for (let stripe = -256; stripe <= 256; stripe += 64) {
    context.lineWidth = 12;
    context.strokeStyle = 'rgba(129, 116, 79, 0.42)';
    context.beginPath();
    context.moveTo(stripe, 0);
    context.lineTo(stripe + 256, 256);
    context.stroke();
    context.lineWidth = 3;
    context.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    context.beginPath();
    context.moveTo(stripe + 14, 0);
    context.lineTo(stripe + 270, 256);
    context.stroke();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(16, 16);
  return texture;
}

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
  camera.near = 0.1;
  camera.far = 60;
  camera.updateMatrixWorld();
  scene.add(new HemisphereLight(0xfff4d3, 0x534653, 2.7));
  const light = new DirectionalLight(0xffe5a0, 3.5);
  light.position.set(-5, 10, 3);
  light.castShadow = true;
  light.shadow.mapSize.set(512, 512);
  light.shadow.camera.left = light.shadow.camera.bottom = -12;
  light.shadow.camera.right = light.shadow.camera.top = 12;
  scene.add(light);
  const surface = feltTexture();
  const floor = new Mesh(
    new PlaneGeometry(40, 40),
    new MeshStandardMaterial({
      color: surface ? 0xffffff : 0x151319,
      map: surface,
      roughness: 1,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const columns = Math.min(5, Math.ceil(Math.sqrt(plan.dice.length)));
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
  const launchBounds = new Box3();
  const meshBounds = new Box3();
  for (const die of dice)
    launchBounds.union(meshBounds.setFromObject(die.mesh).applyMatrix4(camera.matrixWorldInverse));
  let viewportWidth = 1,
    viewportHeight = 1;
  function frameDice() {
    Object.assign(
      camera,
      diceFrustum(
        {
          minX: launchBounds.min.x,
          maxX: launchBounds.max.x,
          minY: launchBounds.min.y,
          maxY: launchBounds.max.y,
        },
        viewportWidth,
        viewportHeight,
      ),
    );
    camera.updateProjectionMatrix();
  }
  function updatePose(progress: number) {
    for (const die of dice) {
      const remaining = 1 - progress;
      const eased = 1 - remaining ** 3;
      const angle = remaining ** 2 * Math.PI * (5 + (die.index % 3));
      spin.setFromEuler(euler.set(angle, angle * 0.6, angle * 0.8));
      die.mesh.quaternion.copy(die.final).multiply(spin);
      die.mesh.position.set(
        die.x - remaining ** 2 * (0.65 + (die.index % 2) * 0.2),
        die.height + Math.sin(progress * Math.PI) * remaining * 0.8,
        die.z + (1 - eased) * Math.sin(die.index + 1) * 0.4,
      );
    }
  }
  if (animate) {
    // Fit the whole launch once. A camera following each rotating AABB pumps the zoom.
    for (let step = 0; step <= 64; step++) {
      updatePose(step / 64);
      for (const die of dice)
        launchBounds.union(
          meshBounds.setFromObject(die.mesh).applyMatrix4(camera.matrixWorldInverse),
        );
    }
    // O primeiro quadro já é o lançamento, evitando um flash da pose final.
    updatePose(0);
  }
  observer = new ResizeObserver(resize);
  function resize() {
    if (closed) return;
    viewportWidth = Math.max(1, host.clientWidth);
    viewportHeight = Math.max(1, host.clientHeight);
    frameDice();
    renderer.setSize(viewportWidth, viewportHeight);
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
    surface?.dispose();
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
    const progress = Math.max(0, Math.min(1, (now - start) / 2100));
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
