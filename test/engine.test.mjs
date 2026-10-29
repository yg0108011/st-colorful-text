/**
 * 多彩文本引擎自动化测试（jsdom）
 * 覆盖：主题/纯色/渐变三模式、渐变角度 0–360、四类标签、双引号对话、幂等重绘、
 * 跳过标签、设置归一化、段落/句子循环与字符长度循环、结束重绘兜底、透明继承阻断。
 * paragraph 循环：主要文本 / 下划线 / 引用走 CSS 原生 linear-gradient(angle) + background-clip: text；
 * 斜体句子为避免背景盒裁掉倾斜伸出笔画，整句逐字符按角度走向投影取色、直接写 color；
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

/* ---------------- 透明继承阻断（段落渐变下子元素发黑回归） ---------------- */

test('段落渐变下 theme 斜体与 solid 子元素阻断透明继承，不再发黑缺色', async () => {
    await loadEngine();
    resetChat();
    engine.resetSettings();
    setMode('main', 'gradient', null, ['#ff0000', '#0000ff'], 90);
    setMode('italic', 'theme');
    setMode('underline', 'solid', '#00ff00');
    setMode('quote', 'theme');
    engine.processAll(document);

    const text = document.querySelector('#m1 .mes_text');
    const i = text.querySelector('i');
    const u = text.querySelector('u');
    const block = text.querySelector('blockquote');

    // theme 子元素：填充色跟随 currentColor，不继承父级 transparent，也不铺渐变背景
    assert.equal(i.style.webkitTextFillColor, 'currentcolor');
    assert.equal(i.style.backgroundImage, '');
    assert.equal(block.style.webkitTextFillColor, 'currentcolor');
    assert.equal(block.style.backgroundImage, '');

    // solid 子元素：纯色 + currentColor 填充，透明继承不会盖掉纯色
    assert.equal(u.style.color, 'rgb(0, 255, 0)');
    assert.equal(u.style.webkitTextFillColor, 'currentcolor');

    // 主段落仍是透明文字 + 渐变背景
    mainParagraphs(text).forEach((p) => {
        assert.ok(p.style.backgroundImage.includes('linear-gradient(90deg'));
        assert.equal(p.style.webkitTextFillColor, 'transparent');
    });
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

test('渐变角度：下划线走 CSS 背景渐变写入 deg；斜体句子整句逐字符投影上色、不铺背景', async () => {
    await loadEngine();
    resetChat();
    engine.resetSettings();
    setMode('italic', 'gradient', null, ['#00ff00', '#ffff00'], 180);
    setMode('underline', 'gradient', null, ['#0000ff', '#ff00ff'], 0);
    engine.processAll(document);

    const text = document.querySelector('#m1 .mes_text');
    // 下划线仍是 CSS 背景渐变，角度写入 deg
    assert.ok(text.querySelector('u').style.backgroundImage.includes('linear-gradient(0deg'));
    const i = text.querySelector('i');
    // 斜体 180°（接近垂直走向）：整句逐字符取中间色，不铺背景、不用透明填充
    assert.equal(i.style.backgroundImage, '');
    assert.equal(i.style.webkitTextFillColor, '');
    const chars = i.querySelectorAll('span.stfc-char[data-stfc-cat="italic"]');
    assert.ok(chars.length > 0, '斜体句子循环应逐字符包裹');
    chars.forEach((ch) => assert.equal(ch.style.color, 'rgb(128, 255, 0)'));
});

test('渐变 paragraph 循环：下划线/引用铺 CSS 角度渐变；斜体句子逐字符投影，双引号对话包裹引用渐变', async () => {
    await loadEngine();
    resetChat();
    engine.resetSettings();
    setMode('main', 'theme');
    setMode('italic', 'gradient', null, ['#00ff00', '#ffff00'], 90);
    setMode('underline', 'gradient', null, ['#0000ff', '#ff00ff'], 90);
    setMode('quote', 'gradient', null, ['#ffa500', '#ff0000'], 90);
    engine.processAll(document);

    const text = document.querySelector('#m1 .mes_text');
    // 斜体句子循环：整句逐字符按水平走向取色，不铺背景、不用透明填充、无盒补偿
    const i = text.querySelector('i');
    const chars = i.querySelectorAll('span.stfc-char[data-stfc-cat="italic"]');
    assert.ok(chars.length > 0);
    assert.equal(i.style.backgroundImage, '');
    assert.equal(i.style.webkitTextFillColor, '');
    assert.equal(i.style.padding, '');
    assert.equal(i.style.margin, '');
    // 90° 自左而右：首字起始色绿，末字结束色黄
    assert.equal(chars[0].style.color, 'rgb(0, 255, 0)');
    assert.equal(chars[chars.length - 1].style.color, 'rgb(255, 255, 0)');
    // 下划线 / 引用仍是 CSS 背景渐变
    assert.ok(text.querySelector('u').style.backgroundImage.includes('linear-gradient(90deg'));
    assert.ok(text.querySelector('blockquote').style.backgroundImage.includes('linear-gradient(90deg'));
    assert.ok(text.querySelector('q').style.backgroundImage.includes('linear-gradient(90deg'));
    // 裸双引号对话包裹 span 且带引用渐变
    const wraps = text.querySelectorAll('span.stfc-quote-wrap');
    assert.ok(wraps.length >= 2);
    wraps.forEach((sp) => assert.ok(sp.style.backgroundImage.includes('linear-gradient(90deg')));
});

test('斜体句子逐字符投影上色；下划线/引用为 CSS 渐变；切回主题后产物清除', async () => {
    await loadEngine();
    resetChat();
    engine.resetSettings();
    setMode('main', 'theme');
    setMode('italic', 'gradient', null, ['#00ff00', '#ffff00'], 90);
    setMode('underline', 'gradient', null, ['#0000ff', '#ff00ff'], 90);
    setMode('quote', 'gradient', null, ['#ffa500', '#ff0000'], 90);
    engine.processAll(document);

    const text = document.querySelector('#m1 .mes_text');
    const i = text.querySelector('i');
    // 斜体句子循环：逐字符写 color，不铺背景、不用透明填充、无盒补偿残留
    const chars = i.querySelectorAll('span.stfc-char[data-stfc-cat="italic"]');
    assert.ok(chars.length > 0);
    assert.equal(i.style.backgroundImage, '');
    assert.equal(i.style.webkitTextFillColor, '');
    assert.equal(i.style.color, '');
    assert.equal(i.style.padding, '');
    assert.equal(i.style.margin, '');
    assert.equal(i.style.backgroundOrigin, '');
    assert.equal(chars[0].style.color, 'rgb(0, 255, 0)');
    // 下划线 / 引用仍是 CSS 背景渐变，不逐字包裹
    const u = text.querySelector('u');
    assert.ok(u.style.backgroundImage.includes('linear-gradient(90deg'));
    assert.equal(u.querySelector('span.stfc-char'), null);
    const block = text.querySelector('blockquote');
    assert.ok(block.style.backgroundImage.includes('linear-gradient(90deg'));

    // 幂等：斜体切回主题后逐字符包裹与内联颜色清空
    setMode('italic', 'theme');
    engine.processAll(document);
    assert.equal(i.querySelector('span.stfc-char'), null);
    assert.equal(i.style.backgroundImage, '');
    assert.equal(i.style.color, '');
});

test('斜体字符长度循环：逐字符按 cycleLength 回绕，不写背景与盒补偿', async () => {
    await loadEngine();
    resetChat();
    engine.resetSettings();
    const italicCfg = engine.getSettings().categories.italic;
    italicCfg.mode = 'gradient';
    italicCfg.cycle = 'length';
    italicCfg.cycleLength = 3;
    italicCfg.gradient = ['#00ff00', '#ffff00'];
    engine.processAll(document);
    const text = document.querySelector('#m1 .mes_text');
    const i = text.querySelector('i');
    const chars = i.querySelectorAll('span.stfc-char[data-stfc-cat="italic"]');
    assert.ok(chars.length > 0);
    // 第 0、3、6 字回到起始色绿，按 cycleLength 回绕
    assert.equal(chars[0].style.color, 'rgb(0, 255, 0)');
    assert.equal(chars[3].style.color, 'rgb(0, 255, 0)');
    assert.equal(i.style.backgroundImage, '');
    assert.equal(i.style.padding, '');
    assert.equal(i.style.margin, '');
    assert.equal(i.style.backgroundOrigin, '');
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

/* ---------------- 结束重绘兜底（流式结束退回默认色回归） ---------------- */

test('生成结束重绘清空染色后：指纹相同仍强制重染，不再退回酒馆默认色', async () => {
    await loadEngine();
    resetChat();
    engine.resetSettings();
    setMode('main', 'gradient', null, ['#ff0000', '#0000ff'], 90);
    setMode('italic', 'gradient', null, ['#00ff00', '#ffff00'], 90);

    const mes = document.querySelector('#m1');
    const text = mes.querySelector('.mes_text');
    // 染色前缓存原始内部 HTML，用来模拟酒馆结束时重新生成的那份 DOM
    const rawInner = text.innerHTML;
    engine.processAll(document);
    assert.ok(text.querySelector('.stfc-tagged'), '首次染色应产生本扩展标记');

    // 模拟酒馆结束时替换 innerHTML：mesEl 元素与指纹保留，仅内部 DOM 被重绘清空
    text.innerHTML = rawInner;
    assert.equal(text.querySelector('.stfc-tagged, .stfc-char, .stfc-quote-wrap'), null, '重绘后染色产物已丢失');

    // 文本长度与前 80 字符未变、设置指纹相同；旧逻辑会跳过，修复后应检测到产物丢失并重染
    engine.processAll(document);
    assert.ok(text.querySelector('.stfc-tagged'), '产物丢失时即使指纹相同也必须强制重染');
    mainParagraphs(text).forEach((p) => {
        assert.ok(p.style.backgroundImage.includes('linear-gradient(90deg'));
    });
    const i = text.querySelector('i');
    assert.ok(i.querySelector('span.stfc-char[data-stfc-cat="italic"]'), '重染后斜体应恢复逐字符上色');
});

test('全主题模式：无自定义配色时不产生包裹与内联样式，重复处理也不染色', async () => {
    await loadEngine();
    resetChat();
    engine.resetSettings();
    engine.processAll(document);
    engine.processAll(document);
    const text = document.querySelector('#m1 .mes_text');
    assert.equal(text.querySelectorAll('span.stfc-char, span.stfc-quote-wrap').length, 0);
    ['i', 'u', 'q', 'blockquote'].forEach((sel) => {
        text.querySelectorAll(sel).forEach((el) => {
            assert.equal(el.style.color, '');
            assert.ok(!el.style.backgroundImage, `${sel} 主题模式不应设置背景`);
        });
    });
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

/* ---------------- 颜文字碎片：Markdown 误配对的斜体归还主要文本 ---------------- */

const KAOMOJI_HTML = `
<div class="mes" id="km">
  <div class="mes_text">
    <p>闲聊片段 <em>_</em> 与 (<em>/ω＼</em>) 还有 <em>)</em>，真斜体 <em>这是真正的内心独白</em> 结束。</p>
  </div>
</div>`;

function loadKaomojiDom() {
    document.getElementById('chat').innerHTML = KAOMOJI_HTML;
}

test('isKaomojiOnly：符号碎片为真，含汉字或英文单词为假', async () => {
    await loadEngine();
    const holder = document.createElement('div');
    const make = (tag, text) => {
        const el = document.createElement(tag);
        el.textContent = text;
        return el;
    };
    assert.equal(engine.isKaomojiOnly(make('em', '_')), true);
    assert.equal(engine.isKaomojiOnly(make('em', '/ω＼')), true);
    assert.equal(engine.isKaomojiOnly(make('em', '＾ω＾')), true);
    assert.equal(engine.isKaomojiOnly(make('em', ')')), true);
    assert.equal(engine.isKaomojiOnly(make('em', '这是真正的内心独白')), false);
    assert.equal(engine.isKaomojiOnly(make('em', 'Hello')), false);
    assert.equal(engine.isKaomojiOnly(make('em', 'a')), true);
    assert.equal(engine.isKaomojiOnly(holder), false);
});

test('段落渐变 + 斜体纯色：颜文字碎片不上斜体色，跟随父段主渐变', async () => {
    await loadEngine();
    resetChat();
    document.getElementById('chat').innerHTML = KAOMOJI_HTML;
    engine.resetSettings();
    setMode('main', 'gradient', null, ['#ff9ec7', '#7ec8ff'], 90);
    setMode('italic', 'solid', '#00ff00');
    engine.processAll(document);

    const text = document.querySelector('#km .mes_text');
    const ems = [...text.querySelectorAll('em')];
    const fragments = ems.filter((el) => el.classList.contains('stfc-kaomoji'));
    const realItalic = ems.filter((el) => el.classList.contains('stfc-tagged') && !el.classList.contains('stfc-kaomoji'));

    // 三个符号碎片被识别
    assert.equal(fragments.length, 3);
    fragments.forEach((el) => {
        // 不套用斜体绿色；颜色 / 填充继承父级，无自身背景
        assert.equal(el.style.color, 'inherit');
        assert.equal(el.style.webkitTextFillColor, 'inherit');
        assert.ok(!el.style.backgroundImage || el.style.backgroundImage === 'none');
        assert.notEqual(el.style.color, 'rgb(0, 255, 0)');
    });
    // 真斜体独白仍套用斜体绿色
    assert.equal(realItalic.length, 1);
    assert.equal(realItalic[0].style.color, 'rgb(0, 255, 0)');
    // 父段仍是主文本渐变
    const p = text.querySelector('p');
    assert.ok(p.style.backgroundImage.includes('linear-gradient(90deg'));
    assert.equal(p.style.webkitTextFillColor, 'transparent');
});

test('字符长度循环：颜文字碎片字符计入主要文本计数器，真斜体字符归入斜体', async () => {
    await loadEngine();
    resetChat();
    document.getElementById('chat').innerHTML = KAOMOJI_HTML;
    engine.resetSettings();
    const mainCfg = engine.getSettings().categories.main;
    mainCfg.mode = 'gradient';
    mainCfg.cycle = 'length';
    mainCfg.cycleLength = 10;
    mainCfg.gradient = ['#ff0000', '#0000ff'];
    const italicCfg = engine.getSettings().categories.italic;
    italicCfg.mode = 'gradient';
    italicCfg.cycle = 'length';
    italicCfg.gradient = ['#00ff00', '#ffff00'];
    engine.processAll(document);

    const text = document.querySelector('#km .mes_text');
    const ems = [...text.querySelectorAll('em')];
    const fragments = ems.filter((el) => el.classList.contains('stfc-kaomoji'));
    // 碎片内部字符全部包成 main 字符 span，不产生 italic 字符 span
    fragments.forEach((el) => {
        assert.equal(el.querySelectorAll('span.stfc-char[data-stfc-cat="italic"]').length, 0);
        const mainChars = el.querySelectorAll('span.stfc-char[data-stfc-cat="main"]');
        assert.ok(mainChars.length > 0, '碎片字符应随主要文本计数器逐字上色');
    });
    // 真斜体独白内部字符归 italic
    const realItalic = ems.find((el) => !el.classList.contains('stfc-kaomoji'));
    assert.ok(realItalic.querySelector('span.stfc-char[data-stfc-cat="italic"]'));
});

test('颜文字碎片幂等：重复处理后无重复标记、无嵌套字符包裹', async () => {
    await loadEngine();
    resetChat();
    document.getElementById('chat').innerHTML = KAOMOJI_HTML;
    engine.resetSettings();
    setMode('main', 'gradient', null, ['#ff9ec7', '#7ec8ff'], 90);
    setMode('italic', 'solid', '#00ff00');
    engine.processAll(document);
    const before = document.querySelectorAll('span.stfc-char, .stfc-kaomoji').length;
    engine.processAll(document);
    engine.processAll(document);
    const after = document.querySelectorAll('span.stfc-char, .stfc-kaomoji').length;
    assert.equal(after, before);
    assert.equal(document.querySelectorAll('.stfc-kaomoji .stfc-kaomoji').length, 0);
    assert.equal(document.querySelectorAll('span.stfc-char span.stfc-char').length, 0);
});

/* ---------------- 被颜文字星号从中间劈碎的含汉字交错 em ---------------- */

// 现场形态：整句被颜文字里的成对星号劈成两段含汉字 em，中间夹颜文字符号
const SPLIT_HTML = `
<div class="mes" id="sp">
  <div class="mes_text">
    <p><em>你在干什</em>(^o^)/<em>么呀</em></p>
  </div>
</div>`;

// 对照组：单个真斜体独白，前后为汉字叙述，句尾带一个颜文字符号；不允许被误判为碎片
const REAL_SINGLE_HTML = `
<div class="mes" id="rs">
  <div class="mes_text">
    <p>她轻轻开口 <em>这是真正的内心独白</em>，说完笑了 (^_^)。</p>
  </div>
</div>`;

test('isMispairedByKaomoji：交错含汉字 em 命中，独立真斜体不命中', async () => {
    await loadEngine();
    document.getElementById('chat').innerHTML = SPLIT_HTML;
    const splitEms = [...document.querySelectorAll('#sp em')];
    assert.equal(engine.isMispairedByKaomoji(splitEms[0]), true);
    assert.equal(engine.isMispairedByKaomoji(splitEms[1]), true);

    document.getElementById('chat').innerHTML = REAL_SINGLE_HTML;
    const real = document.querySelector('#rs em');
    assert.equal(engine.isMispairedByKaomoji(real), false);

    // 纯符号碎片仍然命中
    const make = (tag, text) => {
        const el = document.createElement(tag);
        el.textContent = text;
        return el;
    };
    assert.equal(engine.isMispairedByKaomoji(make('em', '_')), true);
});

test('被劈碎的交错 em：段落渐变下归还父段主渐变，不上斜体色', async () => {
    await loadEngine();
    resetChat();
    document.getElementById('chat').innerHTML = SPLIT_HTML;
    engine.resetSettings();
    setMode('main', 'gradient', null, ['#ff9ec7', '#7ec8ff'], 90);
    setMode('italic', 'solid', '#00ff00');
    engine.processAll(document);

    const text = document.querySelector('#sp .mes_text');
    const ems = [...text.querySelectorAll('em')];
    assert.equal(ems.length, 2);
    ems.forEach((el) => {
        assert.ok(el.classList.contains('stfc-kaomoji'));
        assert.equal(el.style.color, 'inherit');
        assert.equal(el.style.webkitTextFillColor, 'inherit');
        assert.ok(!el.style.backgroundImage || el.style.backgroundImage === 'none');
        assert.notEqual(el.style.color, 'rgb(0, 255, 0)');
    });
    const p = text.querySelector('p');
    assert.ok(p.style.backgroundImage.includes('linear-gradient(90deg'));
    assert.equal(p.style.webkitTextFillColor, 'transparent');
});

test('被劈碎的交错 em：字符长度循环下字符并入主要文本计数器', async () => {
    await loadEngine();
    resetChat();
    document.getElementById('chat').innerHTML = SPLIT_HTML;
    engine.resetSettings();
    const mainCfg = engine.getSettings().categories.main;
    mainCfg.mode = 'gradient';
    mainCfg.cycle = 'length';
    mainCfg.cycleLength = 10;
    mainCfg.gradient = ['#ff0000', '#0000ff'];
    const italicCfg = engine.getSettings().categories.italic;
    italicCfg.mode = 'gradient';
    italicCfg.cycle = 'length';
    italicCfg.gradient = ['#00ff00', '#ffff00'];
    engine.processAll(document);

    const text = document.querySelector('#sp .mes_text');
    text.querySelectorAll('em').forEach((el) => {
        assert.ok(el.classList.contains('stfc-kaomoji'));
        assert.equal(el.querySelectorAll('span.stfc-char[data-stfc-cat="italic"]').length, 0);
        assert.ok(el.querySelectorAll('span.stfc-char[data-stfc-cat="main"]').length > 0);
    });
});

test('独立真斜体后跟颜文字符号：不被误判碎片，照常走斜体配色', async () => {
    await loadEngine();
    resetChat();
    document.getElementById('chat').innerHTML = REAL_SINGLE_HTML;
    engine.resetSettings();
    setMode('main', 'theme');
    setMode('italic', 'gradient', null, ['#00ff00', '#ffff00'], 90);
    engine.processAll(document);

    const text = document.querySelector('#rs .mes_text');
    const em = text.querySelector('em');
    assert.ok(!em.classList.contains('stfc-kaomoji'));
    const chars = em.querySelectorAll('span.stfc-char[data-stfc-cat="italic"]');
    assert.ok(chars.length > 0);
    assert.equal(chars[0].style.color, 'rgb(0, 255, 0)');
});

test('交错 em 碎片幂等：重复处理无重复标记、无嵌套字符包裹', async () => {
    await loadEngine();
    resetChat();
    document.getElementById('chat').innerHTML = SPLIT_HTML;
    engine.resetSettings();
    setMode('main', 'gradient', null, ['#ff9ec7', '#7ec8ff'], 90);
    setMode('italic', 'solid', '#00ff00');
    engine.processAll(document);
    const before = document.querySelectorAll('span.stfc-char, .stfc-kaomoji').length;
    engine.processAll(document);
    engine.processAll(document);
    const after = document.querySelectorAll('span.stfc-char, .stfc-kaomoji').length;
    assert.equal(after, before);
    assert.equal(document.querySelectorAll('.stfc-kaomoji .stfc-kaomoji').length, 0);
    assert.equal(document.querySelectorAll('span.stfc-char span.stfc-char').length, 0);
});
