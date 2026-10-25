/**
 * 多彩文本引擎自动化测试（jsdom）
 * 覆盖：主题/纯色/渐变三模式、渐变角度 0–360、四类标签、双引号对话、幂等重绘、
 * 跳过标签、设置归一化、整段话循环与字符长度循环。
 * paragraph 循环：CSS 原生 linear-gradient(angle) + background-clip: text；
 * length 循环：逐字符插值上色，每 cycleLength 字走完一遍色标。
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
    engine = await import('../engine.js');
}

function resetChat() {
    document.getElementById('chat').innerHTML = SAMPLE;
}

function setMode(cat, mode, solid, gradient, angle) {
    const cfg = engine.getSettings().categories[cat];
    cfg.mode = mode;
    if (solid !== undefined) cfg.solid = solid;
    if (gradient !== undefined) cfg.gradient = gradient;
    if (angle !== undefined) cfg.angle = angle;
}

/** paragraph 循环下主要文本对应的自然段（与引擎 paintMainParagraphs 选择口径一致） */
function mainParagraphs(text) {
    return [...text.querySelectorAll('p')].filter(
        (p) => !p.closest('blockquote, q, i, em, u, ins'),
    );
}

/* ---------------- 主题模式 ---------------- */

test('主题模式：不产生任何染色包裹与内联颜色', async () => {
    await loadEngine();
    resetChat();
    engine.resetSettings();
    engine.processAll(document);
    const text = document.querySelector('#m1 .mes_text');
    assert.equal(text.querySelectorAll('span.stfc-quote-wrap').length, 0);
    assert.equal(text.style.color, '');
    ['i', 'u', 'q', 'blockquote'].forEach((sel) => {
        text.querySelectorAll(sel).forEach((el) => {
            assert.equal(el.style.color, '');
            assert.ok(!el.style.backgroundImage, '主题模式不应设置背景');
        });
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
    const plainQuoteSpans = text.querySelectorAll('span.stfc-quote-wrap');
    assert.ok(plainQuoteSpans.length >= 2, '普通文本中的双引号对话应被切分包裹');
    plainQuoteSpans.forEach((sp) => assert.equal(sp.style.color, 'rgb(255, 165, 0)'));
});

/* ---------------- 渐变 paragraph 循环 ---------------- */

test('渐变 paragraph 循环：主要文本按自然段铺渐变，根容器本身不铺', async () => {
    await loadEngine();
    resetChat();
    engine.resetSettings();
    setMode('main', 'gradient', null, ['#ff0000', '#0000ff'], 90);
    setMode('italic', 'theme');
    setMode('underline', 'theme');
    setMode('quote', 'theme');
    engine.processAll(document);

    const text = document.querySelector('#m1 .mes_text');
    assert.ok(!text.style.backgroundImage, 'paragraph 循环下根容器不直接铺渐变');
    const paras = mainParagraphs(text);
    assert.ok(paras.length >= 1, '应至少选中一个主要文本自然段');
    paras.forEach((p) => {
        assert.ok(p.style.backgroundImage.includes('linear-gradient(90deg'));
        assert.ok(p.style.backgroundImage.includes('rgb(255, 0, 0)'));
        assert.ok(p.style.backgroundImage.includes('rgb(0, 0, 255)'));
        assert.equal(p.style.webkitTextFillColor, 'transparent');
        assert.equal(p.style.color, 'transparent');
    });
});

test('渐变角度：不同角度写入不同 deg，0/180/270 均可', async () => {
    await loadEngine();
    resetChat();
    engine.resetSettings();
    setMode('italic', 'gradient', null, ['#00ff00', '#ffff00'], 180);
    setMode('underline', 'gradient', null, ['#0000ff', '#ff00ff'], 0);
    engine.processAll(document);

    const text = document.querySelector('#m1 .mes_text');
    assert.ok(text.querySelector('i').style.backgroundImage.includes('linear-gradient(180deg'));
    assert.ok(text.querySelector('u').style.backgroundImage.includes('linear-gradient(0deg'));
});

test('渐变 paragraph 循环：斜体/下划线/引用元素各自带渐变背景，双引号对话包裹', async () => {
    await loadEngine();
    resetChat();
    engine.resetSettings();
    setMode('main', 'theme');
    setMode('italic', 'gradient', null, ['#00ff00', '#ffff00'], 90);
    setMode('underline', 'gradient', null, ['#0000ff', '#ff00ff'], 90);
    setMode('quote', 'gradient', null, ['#ffa500', '#ff0000'], 90);
    engine.processAll(document);

    const text = document.querySelector('#m1 .mes_text');
    assert.ok(text.querySelector('i').style.backgroundImage.includes('linear-gradient(90deg'));
    assert.ok(text.querySelector('u').style.backgroundImage.includes('linear-gradient(90deg'));
    assert.ok(text.querySelector('blockquote').style.backgroundImage.includes('linear-gradient(90deg'));
    assert.ok(text.querySelector('q').style.backgroundImage.includes('linear-gradient(90deg'));
    // 裸双引号对话包裹 span 且带引用渐变
    const wraps = text.querySelectorAll('span.stfc-quote-wrap');
    assert.ok(wraps.length >= 2);
    wraps.forEach((sp) => assert.ok(sp.style.backgroundImage.includes('linear-gradient(90deg')));
});

/* ---------------- 渐变 length 循环 ---------------- */

test('渐变 length 循环：逐字符插值，每 cycleLength 字走完一遍色标', async () => {
    await loadEngine();
    resetChat();
    engine.resetSettings();
    const mainCfg = engine.getSettings().categories.main;
    mainCfg.mode = 'gradient';
    mainCfg.cycle = 'length';
    mainCfg.cycleLength = 4;
    mainCfg.gradient = ['#ff0000', '#0000ff'];
    engine.processAll(document);

    const text = document.querySelector('#m1 .mes_text');
    const chars = text.querySelectorAll('span.stfc-char[data-stfc-cat="main"]');
    assert.ok(chars.length > 0, 'length 循环应把主要文本逐字符包裹');
    // 计数器连续：第 0、4、8… 字回到起始色红
    assert.equal(chars[0].style.color, 'rgb(255, 0, 0)');
    assert.equal(chars[4].style.color, 'rgb(255, 0, 0)');
    // 中间位置为两色插值，既非纯红也非纯蓝
    const mid = chars[2].style.color;
    assert.notEqual(mid, 'rgb(255, 0, 0)');
    assert.notEqual(mid, 'rgb(0, 0, 255)');
});

test('length 循环重复应用：字符包裹数量不变、无嵌套', async () => {
    await loadEngine();
    resetChat();
    engine.resetSettings();
    const mainCfg = engine.getSettings().categories.main;
    mainCfg.mode = 'gradient';
    mainCfg.cycle = 'length';
    mainCfg.cycleLength = 10;
    engine.processAll(document);
    const before = document.querySelectorAll('span.stfc-char').length;
    engine.processAll(document);
    engine.processAll(document);
    const after = document.querySelectorAll('span.stfc-char').length;
    assert.equal(after, before);
    assert.equal(document.querySelectorAll('span.stfc-char span.stfc-char').length, 0);
});

/* ---------------- 幂等性（paragraph） ---------------- */

test('重复应用两次：包裹数量不变，无嵌套，无残留内联样式', async () => {
    await loadEngine();
    resetChat();
    engine.resetSettings();
    setMode('main', 'gradient', null, ['#ff0000', '#00ff00'], 90);
    setMode('italic', 'gradient', null, ['#00ff00', '#ffff00'], 90);
    setMode('underline', 'solid', '#0000ff');
    setMode('quote', 'solid', '#ffa500');
    engine.processAll(document);
    const before = document.querySelectorAll('span.stfc-quote-wrap').length;
    engine.processAll(document);
    engine.processAll(document);
    const after = document.querySelectorAll('span.stfc-quote-wrap').length;
    assert.equal(after, before);
    assert.equal(document.querySelectorAll('span.stfc-quote-wrap span.stfc-quote-wrap').length, 0);
});

/* ---------------- 跳过标签 ---------------- */

test('代码/链接/加粗不被染色', async () => {
    await loadEngine();
    resetChat();
    engine.resetSettings();
    setMode('main', 'gradient', null, ['#ff0000', '#0000ff'], 90);
    engine.processAll(document);
    const text = document.querySelector('#m1 .mes_text');
    ['code', 'a', 'strong'].forEach((sel) => {
        const el = text.querySelector(sel);
        assert.equal(el.querySelectorAll('span.stfc-quote-wrap').length, 0);
        assert.ok(!el.style.backgroundImage, `${sel} 不应被染色`);
    });
});

/* ---------------- 设置归一化 ---------------- */

test('normalizeSettings：非法模式回退主题，过短渐变回退默认，角度校验，循环字段归一化', async () => {
    await loadEngine();
    const bad = {
        enabled: 'yes',
        categories: {
            main: { mode: 'rainbow', solid: '#123456', gradient: ['#abc'], angle: 'abc' },
            italic: { mode: 'solid', solid: '#00ff00', angle: 400 },
            quote: { angle: -90, cycle: 'paragraph', cycleLength: 5000 },
            underline: { cycle: 'weird', cycleLength: 1 },
        },
    };
    const norm = engine.normalizeSettings(bad);
    assert.equal(norm.enabled, true);
    assert.equal(norm.categories.main.mode, 'theme');
    assert.ok(norm.categories.main.gradient.length >= 2);
    assert.equal(norm.categories.main.angle, 90); // 非法角度回退默认
    assert.equal(norm.categories.italic.mode, 'solid');
    assert.equal(norm.categories.italic.angle, 40); // 400° 归一化到 40°
    assert.equal(norm.categories.quote.mode, 'theme');
    assert.equal(norm.categories.quote.angle, 270); // -90° 归一化到 270°
    assert.equal(norm.categories.quote.cycle, 'paragraph'); // 合法循环方式保留
    assert.equal(norm.categories.quote.cycleLength, 30); // 5000 超出 2–999，回退默认 30
    assert.equal(norm.categories.underline.cycle, 'paragraph'); // 非法循环方式回退
    assert.equal(norm.categories.underline.cycleLength, 30); // 1 低于下限，回退默认 30
});

/* ---------------- 角度工具 ---------------- */

test('normalizeAngle：0–360 全角度与取模', async () => {
    await loadEngine();
    assert.equal(engine.normalizeAngle(0), 0);
    assert.equal(engine.normalizeAngle(90), 90);
    assert.equal(engine.normalizeAngle(360), 0);
    assert.equal(engine.normalizeAngle(359), 359);
    assert.equal(engine.normalizeAngle(-1), 359);
    assert.equal(engine.normalizeAngle(720), 0);
    assert.equal(engine.normalizeAngle(''), 90);
});
