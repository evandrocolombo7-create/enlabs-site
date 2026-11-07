/* =========================================================
   enlabs — visualizador 360° com antes/depois (WebGL, sem biblioteca)

   <div data-pano data-a="vista.jpg" data-b="render.jpg" data-fallback="render.jpg"></div>
   Um canvas desenha as duas panorâmicas (equirretangulares 2:1) com a mesma câmera.
   À esquerda do divisor: A (vista do SketchUp). À direita: B (render).
   Arrastar gira · roda/pinça dá zoom · setas do teclado giram · o divisor arrasta.
   As imagens precisam vir do mesmo domínio (no file:// local o navegador bloqueia o WebGL: mostra a imagem estática).
   ========================================================= */
(function () {
  var VERT = 'attribute vec2 p;varying vec2 v;void main(){v=p;gl_Position=vec4(p,0.,1.);}';
  var FRAG = [
    'precision highp float;',
    'varying vec2 v;',
    'uniform sampler2D tA,tB;',
    'uniform float yaw,pitch,tanHalf,aspect,split;',
    'const float PI=3.14159265;',
    'void main(){',
    '  vec3 d=normalize(vec3(v.x*tanHalf*aspect,v.y*tanHalf,-1.));',
    '  float cp=cos(pitch),sp=sin(pitch);',
    '  d=vec3(d.x,d.y*cp+d.z*sp,-d.y*sp+d.z*cp);',
    '  float cy=cos(yaw),sy=sin(yaw);',
    '  d=vec3(d.x*cy+d.z*sy,d.y,-d.x*sy+d.z*cy);',
    '  vec2 uv=vec2(atan(d.x,-d.z)/(2.*PI)+.5,.5-asin(clamp(d.y,-1.,1.))/PI);',
    '  gl_FragColor=(v.x*.5+.5)<split?texture2D(tA,uv):texture2D(tB,uv);',
    '}'
  ].join('\n');

  function Pano(el) {
    this.el = el;
    this.yaw = parseFloat(el.getAttribute('data-yaw') || '0') * Math.PI / 180;
    this.pitch = 0;
    this.fov = 75 * Math.PI / 180;
    this.split = 0.5;
    this.auto = true;
    this.dirty = true;
    this.visible = false;
    this.build();
  }

  Pano.prototype.build = function () {
    var el = this.el, self = this;
    el.classList.add('pn');
    el.innerHTML =
      '<canvas class="pn-canvas" tabindex="0" aria-label="Panorâmica 360°: arraste para olhar em volta"></canvas>' +
      '<div class="pn-split" aria-hidden="true"><span class="pn-handle"></span></div>' +
      '<span class="pn-tag pn-tag--l">Vista SketchUp</span><span class="pn-tag pn-tag--r">Render 360° IA</span>' +
      '<span class="pn-hint">arraste para olhar em volta</span>' +
      '<span class="pn-loading">carregando panorâmica…</span>';
    this.canvas = el.querySelector('canvas');
    this.splitEl = el.querySelector('.pn-split');
    this.loadingEl = el.querySelector('.pn-loading');

    var gl = this.canvas.getContext('webgl', { antialias: false, preserveDrawingBuffer: false });
    if (!gl) { this.fallback(); return; }
    this.gl = gl;
    var prog = gl.createProgram();
    [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, FRAG]].forEach(function (s) {
      var sh = gl.createShader(s[0]); gl.shaderSource(sh, s[1]); gl.compileShader(sh); gl.attachShader(prog, sh);
    });
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { this.fallback(); return; }
    gl.useProgram(prog);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    ['tA', 'tB', 'yaw', 'pitch', 'tanHalf', 'aspect', 'split'].forEach(function (n) { self.u[n] = gl.getUniformLocation(prog, n); });
    gl.uniform1i(this.u.tA, 0);
    gl.uniform1i(this.u.tB, 1);

    this.bind();
    // só baixa as imagens quando a seção aparece na tela
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        self.visible = e.isIntersecting;
        if (e.isIntersecting && !self.loaded) self.load();
        if (e.isIntersecting) self.loop();
      });
    }, { rootMargin: '200px' });
    io.observe(el);
  };

  Pano.prototype.fallback = function () {
    var src = this.el.getAttribute('data-fallback') || this.el.getAttribute('data-b');
    this.el.classList.add('pn--static');
    this.el.innerHTML = '<img class="pn-static" src="' + src + '" alt="Render 360° (prévia estática)">' +
      '<span class="pn-hint">prévia estática · a navegação 360° funciona no site publicado</span>';
  };

  Pano.prototype.load = function () {
    var self = this, gl = this.gl;
    this.loaded = true;
    var srcs = [this.el.getAttribute('data-a'), this.el.getAttribute('data-b')];
    var done = 0;
    srcs.forEach(function (src, i) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        try {
          var tex = gl.createTexture();
          gl.activeTexture(i ? gl.TEXTURE1 : gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          if (gl.getError() !== gl.NO_ERROR) throw new Error('texture');
        } catch (e) { self.fallback(); return; }
        if (++done === 2) { self.ready = true; self.loadingEl.remove(); self.dirty = true; self.loop(); }
      };
      img.onerror = function () { self.fallback(); };
      img.src = src;
    });
  };

  Pano.prototype.bind = function () {
    var self = this, c = this.canvas, pointers = {}, last = null, pinch = null, draggingSplit = false;
    function stopAuto() { self.auto = false; self.el.classList.add('is-touched'); }
    function rect() { return self.el.getBoundingClientRect(); }

    this.splitEl.addEventListener('pointerdown', function (e) {
      draggingSplit = true; e.stopPropagation(); self.splitEl.setPointerCapture(e.pointerId); stopAuto();
    });
    this.splitEl.addEventListener('pointermove', function (e) {
      if (!draggingSplit) return;
      var r = rect();
      self.split = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      self.dirty = true; self.loop();
    });
    this.splitEl.addEventListener('pointerup', function () { draggingSplit = false; });

    c.addEventListener('pointerdown', function (e) {
      c.setPointerCapture(e.pointerId);
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      last = { x: e.clientX, y: e.clientY };
      stopAuto();
    });
    c.addEventListener('pointermove', function (e) {
      if (!pointers[e.pointerId]) return;
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(pointers);
      if (ids.length === 2) {
        var a = pointers[ids[0]], b = pointers[ids[1]];
        var dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) self.zoom(pinch / dist);
        pinch = dist;
        return;
      }
      var h = rect().height;
      var k = self.fov / h;
      self.yaw -= (e.clientX - last.x) * k;
      self.pitch = Math.max(-1.45, Math.min(1.45, self.pitch + (e.clientY - last.y) * k));
      last = { x: e.clientX, y: e.clientY };
      self.dirty = true; self.loop();
    });
    function up(e) { delete pointers[e.pointerId]; pinch = null; var ids = Object.keys(pointers); if (ids.length) last = pointers[ids[0]]; }
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', function (e) { e.preventDefault(); stopAuto(); self.zoom(Math.exp(e.deltaY * 0.001)); }, { passive: false });
    c.addEventListener('keydown', function (e) {
      var step = 0.08;
      if (e.key === 'ArrowLeft') self.yaw -= step;
      else if (e.key === 'ArrowRight') self.yaw += step;
      else if (e.key === 'ArrowUp') self.pitch = Math.min(1.45, self.pitch + step);
      else if (e.key === 'ArrowDown') self.pitch = Math.max(-1.45, self.pitch - step);
      else if (e.key === '+' || e.key === '=') self.zoom(0.9);
      else if (e.key === '-') self.zoom(1.1);
      else return;
      e.preventDefault(); stopAuto(); self.dirty = true; self.loop();
    });
    window.addEventListener('resize', function () { self.dirty = true; self.loop(); });
  };

  Pano.prototype.zoom = function (f) {
    this.fov = Math.max(35 * Math.PI / 180, Math.min(100 * Math.PI / 180, this.fov * f));
    this.dirty = true; this.loop();
  };

  Pano.prototype.loop = function () {
    if (this.raf || !this.ready) return;
    var self = this;
    this.raf = requestAnimationFrame(function () {
      self.raf = null;
      if (!self.visible) return;
      if (self.auto && !matchMedia('(prefers-reduced-motion: reduce)').matches) { self.yaw += 0.0012; self.dirty = true; }
      if (self.dirty) self.draw();
      if (self.auto) self.loop();
    });
  };

  Pano.prototype.draw = function () {
    var gl = this.gl, c = this.canvas;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    gl.viewport(0, 0, w, h);
    gl.uniform1f(this.u.yaw, this.yaw);
    gl.uniform1f(this.u.pitch, this.pitch);
    gl.uniform1f(this.u.tanHalf, Math.tan(this.fov / 2));
    gl.uniform1f(this.u.aspect, w / h);
    gl.uniform1f(this.u.split, this.split);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.splitEl.style.left = (this.split * 100) + '%';
    this.dirty = false;
  };

  // troca de panorâmica (abas)
  Pano.prototype.setSources = function (a, b) {
    this.el.setAttribute('data-a', a);
    this.el.setAttribute('data-b', b);
    this.el.setAttribute('data-fallback', b);
    var keep = { yaw: this.yaw };
    var fresh = new Pano(this.el);
    fresh.yaw = keep.yaw;
    return fresh;
  };

  window.EnlabsPano = Pano;
  document.querySelectorAll('[data-pano]').forEach(function (el) { el._pano = new Pano(el); });
})();
