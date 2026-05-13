let running = false;
let frame = 0;
let timerId = null;
const files = new Map();

function postStatus(state) {
  self.postMessage({
    type: 'status',
    state,
    frame,
    mountedFiles: files.size
  });
}

function tick() {
  if (!running) {
    return;
  }

  frame += 1;
  self.postMessage({ type: 'frame', frame, mountedFiles: files.size });
  timerId = setTimeout(tick, 1000 / 30);
}

function boot() {
  if (running) {
    postStatus('running');
    return;
  }

  running = true;
  postStatus('running');
  tick();
}

function reset() {
  running = false;
  frame = 0;

  if (timerId !== null) {
    clearTimeout(timerId);
    timerId = null;
  }

  files.clear();
  postStatus('idle');
}

self.addEventListener('message', (event) => {
  const message = event.data || {};

  switch (message.type) {
    case 'boot':
      boot();
      break;
    case 'reset':
      reset();
      break;
    case 'mount-file':
      if (message.file && message.file.name) {
        files.set(message.file.name, message.file);
        postStatus(running ? 'running' : 'idle');
      }
      break;
    default:
      self.postMessage({ type: 'log', level: 'warn', message: `Unknown command: ${message.type || 'empty'}` });
      break;
  }
});
