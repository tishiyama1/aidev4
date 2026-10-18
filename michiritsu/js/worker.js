// Layer generation can take a few hundred ms (solver-validated), so it runs off the main thread.
import { startLayer } from './core.js';

self.onmessage = ({ data }) => {
  self.postMessage({ token: data.token, layer: startLayer(data.run) });
};
