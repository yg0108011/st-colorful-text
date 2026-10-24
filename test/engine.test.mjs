/**
 * 多彩文本引擎自动化测试（jsdom）
 * 覆盖：主题/纯色/渐变三模式、30 字循环、四类标签、双引号对话、幂等重绘、跳过标签、设置归一化。
 */
import { JSDOM } from 'jsdom';
import test from 'node:test';
import assert from 'node:assert/strict';

const SAMPLE = `
<div class="mes" id="m1">
  <div class="mes_text">
    <p>普通主要文本第一段，包含一段内心动作 <i>斜体独白在这里</i> 继续叙述收尾。</p>
    <p><u>下划线强调词句</u> 与普通文字混合在一起。</p>
    <blockquote>引用块内容在这里。</blockquote>
    <p><q>“带 q 标签的对话。”</q> 结尾叙述。</p>
    <p>这是普通段落里的 "英文双引号对话内容" 以及中文“引号对话示例”。</p>
    <p><strong>加粗不染色</strong>，<a href="#">链接不染色</a>，<code>代码不染色</code>。</p>
  </div>
</div>`;

function makeDom() {
    const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="chat">${SAMPLE}</div></body></html>`, {
        runScripts: 'outside-only',
    });
    global.document = dom.window.document;
    global.NodeFilter = dom.window.NodeFilter;
    global.Node = dom.window.Node;
    return dom;
}

let engine;

async function loadEngine() {
    makeDom();
    engine = await import('../st-colorful-text/engine.js');
}

function resetChat() {
    document.getElementById('chat').innerHTML = SAMPLE;
}

function setMode(cat, mode, solid, gradient) {
    const cfg = engine.getSettings().categories[cat];
    cfg.mode = mode;
    if (solid) cfg.solid = solid;
    if (gradient) cfg.gradient = gradient;
}

/* ---------------- 主题模式 ---------------- */

test('主题模式：不产生任何染色包裹与内联颜色', async () => {
    await loadEngine();
    resetChat();
    engine.resetSettings();
    engine.processAll(document);
    const text = document.querySelector('#m1 .mes_text');
    assert.equal(text.querySelectorAll('span.stfc-char').length, 0);
    assert.equal(text.style.color, '');
    ['i', 'u', 'q', 'blockquote'].forEach((sel) => {
        text.querySelectorAll(sel).forEach((el) => assert.equal(el.style.color, ''));
    });
});

/* ---------------- 纯色模式 ---------------- */

test('纯色模式：四类元素分别套用纯色，双引号对话归入引用色', async () => {
    await loadEngine();
    resetChat();
    engine.resetSettings();
    setMode('main', 'solid', '#ff0000');
    setMode('italic', 'solid', '#00ff00');
    setMode('underline', 'solid', '#0000ff');
    setMode('quote', 'solid', '#ffa500');
    engine.processAll(document);

    const text = document.querySelector('#m1 .mes_text');
    assert.equal(text.style.color, 'rgb(255, 0, 0)');
    assert.equal(text.querySelector('i').style.color, 'rgb(0, 255, 0)');
    assert.equal(text.querySelector('u').style.color, 'rgb(0, 0, 255)');
    assert.equal(text.querySelector('blockquote').style.color, 'rgb(255, 165, 0)');
    assert.equal(text.querySelector('q').style.color, 'rgb(255, 165, 0)');

    // 普通段落里的英文双引号与中文双引号对话都应被引用色包裹
    const plainQuoteSpans = text.querySelectorAll('span[data-stfc-cat="quote"]');
    assert.ok(plainQuoteSpans.length >= 2, '普通文本中的双引号对话应被切分染色');
    plainQuoteSpans.forEach((sp) => assert.equal(sp.style.color, 'rgb(255, 165, 0)'));
});

/* ---------------- 渐变模式：30 字循环与全覆盖 ---------------- */

test('渐变模式：主要文本逐字符上色，30 字循环，位置 0 与 30 同色', async () => {
    await loadEngine();
    resetChat();
    engine.resetSettings();
    setMode('main', 'gradient', null, ['#ff0000', '#0000ff']);
    setMode('italic', 'theme');
    setMode('underline', 'theme');
    setMode('quote', 'theme');
    engine.processAll(document);

    const text = document.querySelector('#m1 .mes_text');
    const mainSpans = [...text.querySelectorAll('span[data-stfc-cat="main"]')];
    assert.ok(mainSpans.length > 30, '主要文本应被逐字符包裹');

    // 循环校验：位置 i 与 i+30 颜色一致
    const colorAt = (i) => mainSpans[i].style.color;
    assert.equal(colorAt(0), colorAt(30));
    assert.equal(colorAt(5), colorAt(35));
    assert.notEqual(colorAt(0), colorAt(15), '循环内颜色应有变化');

    // 渐变覆盖：主要文本字符全部被包裹（不含跳过标签与引用对话）
    const plainMainText = '普通主要文本第一段，包含一段内心动作 继续叙述收尾 与普通文字混合在一起 结尾叙述 这是普通段落里的 以及中文 。，。，。，';
    const wrappedMainChars = mainSpans.reduce((n, sp) => n + sp.textContent.length, 0);
    assert.ok(wrappedMainChars >= 20, `主要文本字符应被渐变覆盖，实际 ${wrappedMainChars}`);
});

test('渐变模式：斜体/下划线/引用元素内部逐字符循环上色', async () => {
    await loadEngine();
    resetChat();
    engine.resetSettings();
    setMode('main', 'theme');
    setMode('italic', 'gradient', null, ['#00ff00', '#ffff00']);
    setMode('underline', 'gradient', null, ['#0000ff', '#ff00ff']);
    setMode('quote', 'gradient', null, ['#ffa500', '#ff0000']);
    engine.processAll(document);

    const text = document.querySelector('#m1 .mes_text');
    const italicSpans = text.querySelectorAll('span[data-stfc-cat="italic"]');
    const underlineSpans = text.querySelectorAll('span[data-stfc-cat="underline"]');
    const quoteSpans = text.querySelectorAll('span[data-stfc-cat="quote"]');
    assert.ok(italicSpans.length > 5);
    assert.ok(underlineSpans.length > 5);
    assert.ok(quoteSpans.length >= 3, 'blockquote / q / 普通双引号对话都应被引用渐变覆盖');
    // 无嵌套包裹
    text.querySelectorAll('span.stfc-char span.stfc-char').forEach((n) => assert.fail('不应出现嵌套染色包裹'));
});

/* ---------------- 幂等性 ---------------- */

test('重复应用两次：包裹数量不变，无嵌套，无残留内联样式', async () => {
    await loadEngine();
    resetChat();
    engine.resetSettings();
    setMode('main', 'gradient', null, ['#ff0000', '#00ff00']);
    setMode('italic', 'gradient');
    setMode('underline', 'solid', '#0000ff');
    setMode('quote', 'solid', '#ffa500');
    engine.processAll(document);
    const before = document.querySelectorAll('span.stfc-char').length;
    engine.processAll(document);
    engine.processAll(document);
    const after = document.querySelectorAll('span.stfc-char').length;
    assert.equal(after, before);
    assert.equal(document.querySelectorAll('span.stfc-char span.stfc-char').length, 0);
});

/* ---------------- 跳过标签 ---------------- */

test('代码/链接/加粗不被染色', async () => {
    await loadEngine();
    resetChat();
    engine.resetSettings();
    setMode('main', 'gradient', null, ['#ff0000', '#0000ff']);
    engine.processAll(document);
    const text = document.querySelector('#m1 .mes_text');
    ['code', 'a', 'strong'].forEach((sel) => {
        const el = text.querySelector(sel);
        assert.equal(el.querySelectorAll('span.stfc-char').length, 0);
    });
});

/* ---------------- 设置归一化 ---------------- */

test('normalizeSettings：非法模式回退主题，过短渐变回退默认', async () => {
    await loadEngine();
    const bad = {
        enabled: 'yes',
        categories: {
            main: { mode: 'rainbow', solid: '#123456', gradient: ['#abc'] },
            italic: { mode: 'solid', solid: '#00ff00' },
        },
    };
    const norm = engine.normalizeSettings(bad);
    assert.equal(norm.enabled, true);
    assert.equal(norm.categories.main.mode, 'theme');
    assert.ok(norm.categories.main.gradient.length >= 2);
    assert.equal(norm.categories.italic.mode, 'solid');
    assert.equal(norm.categories.quote.mode, 'theme');
});

/* ---------------- 渐变颜色工具 ---------------- */

test('gradientColor：端点与中段插值正确', async () => {
    await loadEngine();
    const stops = [engine.hexToRgb('#ff0000'), engine.hexToRgb('#0000ff')];
    assert.deepEqual(engine.gradientColor(stops, 0), [255, 0, 0]);
    assert.deepEqual(engine.gradientColor(stops, 1), [0, 0, 255]);
    const mid = engine.gradientColor(stops, 0.5);
    assert.equal(mid[0], 128);
    assert.equal(mid[2], 128);
});
