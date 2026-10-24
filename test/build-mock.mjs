// 把 engine.js 内联进 mock.template.html，生成无模块依赖的独立 mock.html（供离线渲染预览）。
import { readFileSync, writeFileSync } from 'node:fs';

const engine = readFileSync(new URL('../engine.js', import.meta.url), 'utf8')
    .replace(/^export /gm, '');

const tpl = readFileSync(new URL('./mock.template.html', import.meta.url), 'utf8');
const out = tpl.replace('/*__ENGINE__*/', engine);
writeFileSync(new URL('./mock.html', import.meta.url), out);
console.log('mock.html built; engine chars =', engine.length);
