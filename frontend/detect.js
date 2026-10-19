import hljs from 'highlight.js/lib/common';
import graphql from 'highlight.js/lib/languages/graphql';
import ruby from 'highlight.js/lib/languages/ruby';
import scala from 'highlight.js/lib/languages/scala';

hljs.registerLanguage('graphql', graphql);
hljs.registerLanguage('ruby', ruby);
hljs.registerLanguage('scala', scala);

// Map the detector's identifiers to extensions understood by Wastebin's Syntect renderer.
const extensions = {
  bash: 'sh', c: 'c', cpp: 'cpp', csharp: 'cs', css: 'css', diff: 'diff',
  go: 'go', graphql: 'graphql', ini: 'ini', java: 'java', javascript: 'js',
  json: 'json', kotlin: 'kt', lua: 'lua', makefile: 'make', markdown: 'md',
  perl: 'pl', php: 'php', python: 'py', ruby: 'rb', rust: 'rs', scala: 'scala',
  sql: 'sql', swift: 'swift', typescript: 'ts', xml: 'xml', yaml: 'yaml',
};
const languages = Object.keys(extensions).filter(language => hljs.getLanguage(language));

export function detect(text) {
  // ponytail: sample 16,384 code units for predictable cost; use more only if real pastes need it.
  const sample = text.slice(0, 16384).trim();
  if (!sample) return 'txt';

  // These Java signatures otherwise tie with C# and TypeScript in Highlight.js.
  if (/^\s*package\s+[\w.]+\s*;/m.test(sample)
      && /\b(?:class|interface|enum|record)\s+\w+/.test(sample)) return 'java';

  // Valid JSON has an unambiguous format, even when short or also valid YAML.
  if (/^[\[{]/.test(sample)) {
    try {
      JSON.parse(sample);
      return 'json';
    } catch { /* Let the grammar detector inspect incomplete JSON and other text. */ }
  }

  const result = hljs.highlightAuto(sample, languages);
  if (!result.language || result.relevance < 3) return 'txt';

  // JavaScript/TypeScript share a grammar; prefer the detector's JavaScript tie-break.
  const related = ['javascript', 'typescript'].includes(result.language)
    && ['javascript', 'typescript'].includes(result.secondBest?.language);
  if (!related && result.secondBest && result.relevance - result.secondBest.relevance < 1) {
    return 'txt';
  }
  return extensions[result.language] || 'txt';
}
