import assert from 'node:assert/strict';
import test from 'node:test';
import { detect } from './detect.js';

test('detects common snippets and leaves uncertain text plain', () => {
  const samples = [
    ['json', '{"hello": "world", "enabled": true}'],
    ['yaml', 'server:\n  host: localhost\n  port: 25565\n  enabled: true\n  plugins:\n    - LuckPerms\n    - Vault\n'],
    ['java', 'package studio.blocksmith;\npublic class Main {\n  public static void main(String[] args) {\n    System.out.println("Hello world");\n  }\n}\n'],
    ['js', 'const greet = (name) => {\n  console.log(`Hello ${name}`);\n};\nexport default greet;\n'],
    ['py', 'import sys\ndef greet(name):\n    print(f"Hello {name}")\n\nif __name__ == "__main__":\n    greet(sys.argv[1])\n'],
    ['xml', '<?xml version="1.0" encoding="UTF-8"?>\n<project><groupId>studio.blocksmith</groupId><artifactId>demo</artifactId></project>'],
    ['sql', 'SELECT users.id, users.name FROM users WHERE users.active = TRUE ORDER BY users.name;'],
    ['txt', ''],
    ['txt', 'Hello world!'],
    ['txt', 'Please restart the server and send me the new log file. Thank you.'],
    ['xml', '<script>alert("hello")</script>'],
  ];
  for (const [expected, text] of samples) assert.equal(detect(text), expected, text);
  assert.equal(detect(' '.repeat(16384) + samples[2][1]), 'txt', 'bounded sample');
});
