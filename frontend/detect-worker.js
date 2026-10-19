import { detect } from './detect.js';

self.onmessage = ({ data: { id, text } }) => {
  let extension = 'txt';
  try { extension = detect(text); } catch { /* Plain text keeps every paste usable. */ }
  self.postMessage({ id, extension });
};
