(function () {
  const host = window.location.hostname;
  const pathSegments = window.location.pathname.split('/').filter(Boolean);
  const isGitHubPages = host.endsWith('.github.io');
  const owner = isGitHubPages ? host.replace(/\.github\.io$/, '') : '';
  const repo = isGitHubPages && pathSegments.length > 0 ? pathSegments[0] : '';
  const repositoryUrl = owner && repo ? `https://github.com/${owner}/${repo}` : '../../';

  const targets = {
    repo: repositoryUrl,
    releases: owner && repo ? `${repositoryUrl}/releases` : '../../releases',
    compile: owner && repo ? `${repositoryUrl}/blob/main/Compile.md` : '../../blob/main/Compile.md'
  };

  const state = {
    worker: null,
    mountedFiles: [],
    frame: 0,
    running: false
  };

  const elements = {
    bootButton: document.getElementById('boot-runtime'),
    resetButton: document.getElementById('reset-runtime'),
    runtimeState: document.getElementById('runtime-state'),
    workerState: document.getElementById('worker-state'),
    mountedCount: document.getElementById('mounted-count'),
    frameCount: document.getElementById('frame-count'),
    overlay: document.getElementById('runtime-overlay'),
    canvas: document.getElementById('runtime-screen'),
    fileInput: document.getElementById('file-input'),
    fileList: document.getElementById('file-list'),
    capabilityList: document.getElementById('capability-list'),
    owner: document.getElementById('repo-owner'),
    repo: document.getElementById('repo-name'),
    mode: document.getElementById('pages-mode')
  };

  function formatBytes(bytes) {
    if (bytes === 0) {
      return '0 B';
    }

    const units = ['B', 'KB', 'MB', 'GB'];
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / (1024 ** exponent)).toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
  }

  function updateRepoLinks() {
    document.querySelectorAll('[data-repo-link]').forEach((link) => {
      const target = link.getAttribute('data-repo-link');
      if (targets[target]) {
        link.href = targets[target];
      }
    });

    if (elements.owner) {
      elements.owner.textContent = owner || 'Local preview';
    }

    if (elements.repo) {
      elements.repo.textContent = repo || 'Repository root';
    }

    if (elements.mode) {
      elements.mode.textContent = isGitHubPages ? 'GitHub Pages browser runtime' : 'Local browser runtime';
    }
  }

  function setRuntimeState(label) {
    if (elements.runtimeState) {
      elements.runtimeState.textContent = label;
    }

    if (elements.overlay) {
      elements.overlay.textContent = label;
    }
  }

  function renderFrame() {
    const canvas = elements.canvas;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#101725');
    gradient.addColorStop(1, '#0a3d22');
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.fillStyle = 'rgba(126, 231, 135, 0.16)';
    context.beginPath();
    context.arc((state.frame * 8) % canvas.width, canvas.height / 2, 140, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = '#f4f7fb';
    context.font = '700 44px system-ui, sans-serif';
    context.fillText('MeloNX Browser Runtime', 64, 110);
    context.font = '28px system-ui, sans-serif';
    context.fillText(`Frame: ${state.frame}`, 64, 170);
    context.fillText(`Mounted files: ${state.mountedFiles.length}`, 64, 215);
    context.fillText('Runtime harness active - WebAssembly core not bundled', 64, 660);
  }

  function updateFileList() {
    if (!elements.fileList || !elements.mountedCount) {
      return;
    }

    elements.mountedCount.textContent = String(state.mountedFiles.length);

    if (state.mountedFiles.length === 0) {
      elements.fileList.innerHTML = '<li>No files mounted yet.</li>';
      return;
    }

    elements.fileList.replaceChildren(...state.mountedFiles.map((file) => {
      const item = document.createElement('li');
      const name = document.createElement('span');
      const size = document.createElement('strong');

      name.textContent = file.name;
      size.textContent = formatBytes(file.size);
      item.append(name, size);

      return item;
    }));
  }

  function ensureWorker() {
    if (state.worker) {
      return state.worker;
    }

    if (!('Worker' in window)) {
      setRuntimeState('Web Workers unavailable');
      return null;
    }

    state.worker = new Worker('runtime-worker.js');

    if (elements.workerState) {
      elements.workerState.textContent = 'Started';
    }

    state.worker.addEventListener('message', (event) => {
      const message = event.data || {};

      if (message.type === 'status') {
        state.running = message.state === 'running';
        state.frame = message.frame || 0;
        setRuntimeState(state.running ? 'Runtime running' : 'Runtime idle');
      }

      if (message.type === 'frame') {
        state.frame = message.frame || state.frame;
      }

      if (elements.frameCount) {
        elements.frameCount.textContent = String(state.frame);
      }

      renderFrame();
    });

    return state.worker;
  }

  function bootRuntime() {
    const worker = ensureWorker();
    if (!worker) {
      return;
    }

    worker.postMessage({ type: 'boot' });
    setRuntimeState('Booting runtime');
  }

  function resetRuntime() {
    if (state.worker) {
      state.worker.postMessage({ type: 'reset' });
    }

    state.mountedFiles = [];
    state.frame = 0;
    updateFileList();

    if (elements.frameCount) {
      elements.frameCount.textContent = '0';
    }

    setRuntimeState('Runtime idle');
    renderFrame();
  }

  function mountFiles(files) {
    const worker = ensureWorker();
    state.mountedFiles = Array.from(files);
    updateFileList();

    if (worker) {
      state.mountedFiles.forEach((file) => {
        worker.postMessage({
          type: 'mount-file',
          file: {
            name: file.name,
            size: file.size,
            type: file.type || 'application/octet-stream',
            lastModified: file.lastModified
          }
        });
      });
    }

    renderFrame();
  }

  function checkCapabilities() {
    if (!elements.capabilityList) {
      return;
    }

    const canvas = document.createElement('canvas');
    const capabilities = [
      ['WebAssembly', 'WebAssembly' in window],
      ['Web Workers', 'Worker' in window],
      ['Canvas 2D', Boolean(canvas.getContext('2d'))],
      ['WebGL 2', Boolean(canvas.getContext('webgl2'))],
      ['File API', 'File' in window && 'FileReader' in window],
      ['IndexedDB', 'indexedDB' in window],
      ['SharedArrayBuffer', 'SharedArrayBuffer' in window]
    ];

    elements.capabilityList.replaceChildren(...capabilities.map(([name, supported]) => {
      const item = document.createElement('article');
      item.className = `capability ${supported ? 'supported' : 'missing'}`;
      item.innerHTML = `<span>${name}</span><strong>${supported ? 'Available' : 'Missing'}</strong>`;
      return item;
    }));
  }

  updateRepoLinks();
  checkCapabilities();
  updateFileList();
  renderFrame();

  if (elements.bootButton) {
    elements.bootButton.addEventListener('click', bootRuntime);
  }

  if (elements.resetButton) {
    elements.resetButton.addEventListener('click', resetRuntime);
  }

  if (elements.fileInput) {
    elements.fileInput.addEventListener('change', (event) => mountFiles(event.target.files || []));
  }
}());
