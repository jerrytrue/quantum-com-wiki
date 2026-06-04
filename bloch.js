/* =========================================================
   Bloch Sphere — interactive single-qubit visualization
   Uses three.js (loaded from CDN in index.html as window.THREE)
   ========================================================= */

(function () {
  function c(re, im) { return { re, im || 0 }; }
  // helpers for complex arithmetic
  const cMul = (a, b) => ({ re: a.re*b.re - a.im*b.im, im: a.re*b.im + a.im*b.re });
  const cAdd = (a, b) => ({ re: a.re + b.re, im: a.im + b.im });
  const cMag2 = (z) => z.re*z.re + z.im*z.im;
  const cConj = (z) => ({ re: z.re, im: -z.im });

  class BlochSphere {
    constructor(container) {
      if (!window.THREE) {
        container.innerHTML = '<div style="padding:20px;color:#8b97c2;font-size:12px">three.js failed to load — Bloch sphere unavailable.</div>';
        return;
      }
      this.container = container;
      this.alpha = { re: 1, im: 0 };
      this.beta  = { re: 0, im: 0 };
      this._initScene();
      this._render();
      this._resizeHandler = () => this._resize();
      window.addEventListener('resize', this._resizeHandler);
    }

    _initScene() {
      const THREE = window.THREE;
      const w = this.container.clientWidth || 400;
      const h = this.container.clientHeight || 320;

      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
      this.camera.position.set(3.2, 2.2, 3.2);
      this.camera.lookAt(0, 0, 0);

      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      this.renderer.setPixelRatio(window.devicePixelRatio || 1);
      this.renderer.setSize(w, h);
      this.renderer.setClearColor(0x000000, 0);
      this.container.appendChild(this.renderer.domElement);

      // Wireframe sphere
      const sphereGeo = new THREE.SphereGeometry(1, 28, 18);
      const wireframe = new THREE.WireframeGeometry(sphereGeo);
      const sphereLines = new THREE.LineSegments(
        wireframe,
        new THREE.LineBasicMaterial({ color: 0x29d8c5, transparent: true, opacity: 0.18 })
      );
      this.scene.add(sphereLines);

      // Axes (X = pink, Y = teal, Z = purple)
      const axisLen = 1.35;
      const axes = [
        { from: [-axisLen, 0, 0], to: [axisLen, 0, 0], color: 0xff5cb0, label: '+x' },
        { from: [0, -axisLen, 0], to: [0, axisLen, 0], color: 0x29d8c5, label: '+y' },
        { from: [0, 0, -axisLen], to: [0, 0, axisLen], color: 0x7c5cff, label: '+z' },
      ];
      axes.forEach(a => {
        const geo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(...a.from),
          new THREE.Vector3(...a.to)
        ]);
        this.scene.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: a.color })));
      });

      // |0⟩ / |1⟩ labels on the sphere poles using sprites
      this._addLabel('|0⟩', 0, 0, 1.5, 0x7c5cff);
      this._addLabel('|1⟩', 0, 0, -1.5, 0x7c5cff);
      this._addLabel('|+⟩', 1.5, 0, 0, 0xff5cb0);
      this._addLabel('|+i⟩', 0, 1.5, 0, 0x29d8c5);

      // State arrow — starts at |0⟩ pole
      this.arrow = new THREE.ArrowHelper(
        new THREE.Vector3(0, 1, 0).normalize(),
        new THREE.Vector3(0, 0, 0),
        1,
        0xff5cb0,
        0.18,
        0.09
      );
      this.scene.add(this.arrow);

      // Slow auto-rotation
      this._theta = Math.PI / 4;
      this._tick = this._tick.bind(this);
      this._tick();
    }

    _addLabel(text, x, y, z, color) {
      const THREE = window.THREE;
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
      ctx.font = 'bold 56px ui-monospace, "SF Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 64, 64);
      const tex = new THREE.CanvasTexture(canvas);
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
      const sprite = new THREE.Sprite(mat);
      sprite.position.set(x, y, z);
      sprite.scale.set(0.4, 0.4, 0.4);
      this.scene.add(sprite);
    }

    _resize() {
      if (!this.renderer) return;
      const w = this.container.clientWidth, h = this.container.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    }

    _tick() {
      if (!this.scene) return;
      this._theta += 0.003;
      const r = 3.5;
      this.camera.position.x = r * Math.cos(this._theta);
      this.camera.position.z = r * Math.sin(this._theta);
      this.camera.position.y = 2.2;
      this.camera.lookAt(0, 0, 0);
      this.renderer.render(this.scene, this.camera);
      this._raf = requestAnimationFrame(this._tick);
    }

    // Bloch vector from current state:
    //   <σx> = 2 Re(α* β),  <σy> = 2 Im(α* β),  <σz> = |α|² − |β|²
    _blochVector() {
      const a = this.alpha, b = this.beta;
      const aStarB = cMul(cConj(a), b);
      return {
        x: 2 * aStarB.re,
        y: 2 * aStarB.im,
        z: cMag2(a) - cMag2(b)
      };
    }

    _render() {
      const THREE = window.THREE;
      const v = this._blochVector();
      // Map physics-z to three.js +y (z-pole points up in our scene)
      const dir = new THREE.Vector3(v.x, v.z, v.y);
      const len = dir.length();
      if (len > 1e-6) {
        this.arrow.setDirection(dir.clone().normalize());
        this.arrow.setLength(Math.min(len, 1), 0.18, 0.09);
      }

      // DOM state display
      const fmt = (z) => {
        if (Math.abs(z.im) < 1e-4) return z.re.toFixed(3);
        const sign = z.im >= 0 ? '+' : '';
        return `(${z.re.toFixed(3)}${sign}${z.im.toFixed(3)}i)`;
      };
      const alphaEl = document.getElementById('blochAlpha');
      const betaEl  = document.getElementById('blochBeta');
      const vecEl   = document.getElementById('blochVec');
      if (alphaEl) alphaEl.textContent = fmt(this.alpha);
      if (betaEl)  betaEl.textContent  = fmt(this.beta);
      if (vecEl)   vecEl.textContent = `⟨σ⟩ = (${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`;
    }

    _applyMatrix(m) {
      const newA = cAdd(cMul(m[0][0], this.alpha), cMul(m[0][1], this.beta));
      const newB = cAdd(cMul(m[1][0], this.alpha), cMul(m[1][1], this.beta));
      this.alpha = newA;
      this.beta = newB;
      this._render();
    }

    gate(name) {
      const r = (re, im = 0) => ({ re, im });
      const s2 = 1 / Math.sqrt(2);
      const gates = {
        X: [[r(0), r(1)], [r(1), r(0)]],
        Y: [[r(0), r(0, -1)], [r(0, 1), r(0)]],
        Z: [[r(1), r(0)], [r(0), r(-1)]],
        H: [[r(s2), r(s2)], [r(s2), r(-s2)]],
        S: [[r(1), r(0)], [r(0), r(0, 1)]],
        T: [[r(1), r(0)], [r(0), r(s2, s2)]]
      };
      if (gates[name]) this._applyMatrix(gates[name]);
    }

    reset() {
      this.alpha = { re: 1, im: 0 };
      this.beta  = { re: 0, im: 0 };
      this._render();
    }

    destroy() {
      if (this._raf) cancelAnimationFrame(this._raf);
      if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
      if (this.renderer) {
        this.renderer.dispose();
        if (this.renderer.domElement && this.renderer.domElement.parentNode) {
          this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
        }
      }
      this.scene = null;
      this.renderer = null;
    }
  }

  window.BlochSphere = BlochSphere;
})();
