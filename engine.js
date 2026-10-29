/**
 * 多彩文本 Colorful Text —— 纯逻辑引擎（不依赖酒馆运行时，便于独立测试）
 *
 * 支持 主要文本 / 斜体文本 / 下划线文本 / 引用文本（含双引号对话）三种模式：
 *   theme    跟随酒馆主题
 *   solid    纯色自定义
 *   gradient 渐变，两种循环方式（四类独立设置）：
 *     paragraph 段落 / 句子循环：主要文本 / 下划线 / 引用按本单元走完一遍 CSS 线性渐变
 *              （0–360° 角度生效）；斜体为避免 background-clip: text 背景盒裁掉合成
 *              倾斜伸出的笔画，改为整句逐字符按角度走向投影取色、直接写 color，不铺背景。
 *     length    字符长度：每 cycleLength 个字走完一遍色标，逐字符插值上色。
 *
 * 颜文字兼容：Markdown 会把颜文字里成对的星号误配对成斜体，一类是只含符号 / 希腊 /
 * 假名字形的 i / em 碎片；另一类是整句被颜文字星号从中间劈碎、同层交错出现多个含汉字
 * 的 i / em（例如 <em>片段一</em>颜文字符号<em>片段二</em>）。这两类都不套用斜体配色，
 * 归还主要文本，让主文本渐变连续穿过；真正独立、含汉字或英文单词的斜体独白仍走斜体配置。
 */

export const MODULE_NAME = 'st-colorful-text';

/** 默认循环字符数（length 模式兜底值，面板可自定义 2–999） */
export const CYCLE_LENGTH = 30;

export const CATEGORY_META = {
    main: {
        label: '主要文本',
        icon: 'fa-solid fa-font',
        themeVar: '--SmartThemeBodyColor',
    },
    italic: {
        label: '斜体文本',
        icon: 'fa-solid fa-italic',
        themeVar: '--SmartThemeEmColor',
    },
    underline: {
        label: '下划线文本',
        icon: 'fa-solid fa-underline',
        themeVar: '--SmartThemeUnderlineColor',
    },
    quote: {
        label: '引用文本',
        icon: 'fa-solid fa-quote-right',
        themeVar: '--SmartThemeQuoteColor',
    },
};

export const defaultSettings = {
    enabled: true,
    categories: {
        main: {
            mode: 'theme',
            solid: '#dcdcd2',
            gradient: ['#ff9ec7', '#b388ff', '#7ec8ff'],
            angle: 90,
            cycle: 'paragraph',
            cycleLength: 30,
        },
        italic: {
            mode: 'theme',
            solid: '#919191',
            gradient: ['#fbc2eb', '#a6c1ee'],
            angle: 90,
            cycle: 'paragraph',
            cycleLength: 30,
        },
        underline: {
            mode: 'theme',
            solid: '#bce7cf',
            gradient: ['#84fab0', '#8fd3f4'],
            angle: 90,
            cycle: 'paragraph',
            cycleLength: 30,
        },
        quote: {
            mode: 'theme',
            solid: '#e18a24',
            gradient: ['#f6d365', '#fda085'],
            angle: 90,
            cycle: 'paragraph',
            cycleLength: 30,
        },
    },
};

/** 运行时设置状态 */
export const state = {
    settings: structuredClone(defaultSettings),
};

export function getSettings() {
    return state.settings;
}

export function setSettings(next) {
    state.settings = next;
}

export function resetSettings() {
    state.settings = structuredClone(defaultSettings);
}

/* -------------------------------------------------------------------------- */
/* 设置合并与校验                                                             */
/* -------------------------------------------------------------------------- */

export function deepMerge(base, overlay) {
    if (!overlay || typeof overlay !== 'object') return structuredClone(base);
    const out = structuredClone(base);
    for (const key of Object.keys(overlay)) {
        if (
            overlay[key] && typeof overlay[key] === 'object' && !Array.isArray(overlay[key]) &&
            out[key] && typeof out[key] === 'object' && !Array.isArray(out[key])
        ) {
            out[key] = deepMerge(out[key], overlay[key]);
        } else if (overlay[key] !== undefined) {
            out[key] = overlay[key];
        }
    }
    return out;
}

/** 角度归一化：任意数字取整后映射到 [0, 359] 度；非法值回退 90°（自左而右） */
export function normalizeAngle(raw) {
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) return 90;
    return ((n % 360) + 360) % 360;
}

/** 校验并补齐异常设置，保证老版本升级后字段完整 */
export function normalizeSettings(raw) {
    const merged = deepMerge(defaultSettings, raw || {});
    for (const cat of Object.keys(CATEGORY_META)) {
        const cfg = merged.categories[cat];
        if (!cfg || typeof cfg !== 'object') {
            merged.categories[cat] = structuredClone(defaultSettings.categories[cat]);
            continue;
        }
        if (!['theme', 'solid', 'gradient'].includes(cfg.mode)) cfg.mode = 'theme';
        if (!Array.isArray(cfg.gradient) || cfg.gradient.length < 2) {
            cfg.gradient = structuredClone(defaultSettings.categories[cat].gradient);
        } else if (cfg.gradient.length > 4) {
            cfg.gradient = cfg.gradient.slice(0, 4);
        }
        if (!cfg.solid) cfg.solid = defaultSettings.categories[cat].solid;
        cfg.angle = normalizeAngle(cfg.angle);
        if (!['paragraph', 'length'].includes(cfg.cycle)) cfg.cycle = 'paragraph';
        const len = Number.parseInt(cfg.cycleLength, 10);
        cfg.cycleLength = Number.isFinite(len) && len >= 2 && len <= 999 ? len : CYCLE_LENGTH;
    }
    if (typeof merged.enabled !== 'boolean') merged.enabled = true;
    return merged;
}

/* -------------------------------------------------------------------------- */
/* 颜色工具                                                                   */
/* -------------------------------------------------------------------------- */

export function hexToRgb(hex) {
    let h = String(hex || '#000000').trim().replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    if (Number.isNaN(n)) return [128, 128, 128];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbStr(c) {
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function lerpColor(a, b, t) {
    return [Math.round(lerp(a[0], b[0], t)), Math.round(lerp(a[1], b[1], t)), Math.round(lerp(a[2], b[2], t))];
}

/** 在 stops 中按 p(0~1) 取插值颜色 */
export function gradientColor(stopsRgb, p) {
    if (stopsRgb.length === 1) return stopsRgb[0];
    const seg = Math.min(Math.max(p, 0), 1) * (stopsRgb.length - 1);
    const i = Math.min(Math.floor(seg), stopsRgb.length - 2);
    const t = seg - i;
    return lerpColor(stopsRgb[i], stopsRgb[i + 1], t);
}

/* -------------------------------------------------------------------------- */
/* DOM 处理引擎                                                               */
/* -------------------------------------------------------------------------- */

/** 不参与染色的标签（代码、链接、加粗等保持主题原色） */
const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'PRE', 'CODE', 'KBD', 'SAMP', 'A', 'STRONG', 'B',
    'H1', 'H2', 'H3', 'H4', 'SMALL', 'SUP', 'SUB', 'IMG', 'VIDEO', 'AUDIO',
    'TEXTAREA', 'BUTTON', 'INPUT', 'SELECT',
]);

/** 汉字（CJK 统一表意文字 + 扩展 A） */
const CJK_RE = /[\u3400-\u9fff\uF900-\uFAFF]/;
/** 连续两个及以上拉丁字母视为英文单词（单字母星号碎片不算真斜体） */
const LATIN_WORD_RE = /[A-Za-z]{2,}/;
/** 颜文字专用字形（^ ￣ ω ≧ ∇ ＾ ・ ﾟ 等）；普通中文 / 西文标点不算颜文字 */
const KAOMOJI_CHAR_RE = /[\^￣ω≧∇＾・ﾟДᴗ꒳ロ⊂⊃つノ´∀△▽●○★☆∠⊥ゝ]/;

/**
 * 判断一段兄弟文本是否为「颜文字符号片段」：
 * 去掉空白后不含汉字、不含连续拉丁字母，且至少含一个颜文字专用字形。
 * 普通标点（，。！？：；等）不含颜文字字形，不会命中。
 */
function isKaomojiSymbolText(text) {
    const t = String(text || '').trim();
    if (!t) return false;
    if (CJK_RE.test(t) || LATIN_WORD_RE.test(t)) return false;
    return KAOMOJI_CHAR_RE.test(t);
}

/**
 * 判断 i / em 是否为「颜文字 / 符号碎片」：
 * Markdown 会把颜文字里成对出现的星号（例如星号下划线星号、斜杠 omega 反斜杠这类组合）
 * 误配对成斜体，渲染出只含括号、符号、希腊 / 假名 / 颜文字专用字形的 i / em 元素。
 * 这类元素不含汉字、也不含英文单词，不属于语义斜体，应归还主要文本处理，不套用斜体配色。
 * 真正的斜体独白（含汉字或英文单词）不受影响。
 */
export function isKaomojiOnly(el) {
    if (!el) return false;
    const text = el.textContent || '';
    if (!text.trim()) return false;
    if (CJK_RE.test(text)) return false;
    if (LATIN_WORD_RE.test(text)) return false;
    return true;
}

/**
 * 判断 i / em 是否为 Markdown 误配对产生的碎片（应归还主要文本），覆盖两类：
 *  ① 元素自身只含符号 / 颜文字字形（见 isKaomojiOnly）；
 *  ② 元素含汉字 / 英文单词，但它紧邻的前一个或后一个兄弟节点是颜文字符号片段，
 *     且同层另有其它 i / em——原本整句应连续，被颜文字里的成对星号从中间劈成多个交错
 *     斜体段（例如 <em>你在干什</em>(^o^)/<em>么呀</em>）。
 * 单独出现、前后为汉字叙述的真斜体独白，即使后面跟一个颜文字也不会被命中。
 */
export function isMispairedByKaomoji(el) {
    if (!el) return false;
    if (isKaomojiOnly(el)) return true;
    const parent = el.parentElement;
    if (!parent) return false;
    const siblings = [...parent.childNodes];
    const idx = siblings.indexOf(el);
    const nearSymbol = (node) =>
        node && node.nodeType === Node.TEXT_NODE && isKaomojiSymbolText(node.textContent);
    if (!nearSymbol(siblings[idx - 1]) && !nearSymbol(siblings[idx + 1])) return false;
    const siblingItalics = [...parent.children].filter(
        (c) => c.tagName === 'I' || c.tagName === 'EM',
    );
    return siblingItalics.length >= 2;
}

/** 识别文本节点所属类别：引用 > 下划线 > 斜体 > 主要；颜文字碎片不计入斜体 */
export function categoryOf(node) {
    let el = node.parentElement;
    let fallback = null;
    while (el && !el.classList.contains('mes_text') && el.id !== 'sct-preview') {
        const tag = el.tagName;
        if (SKIP_TAGS.has(tag)) return null;
        if (tag === 'Q' || tag === 'BLOCKQUOTE') return 'quote';
        if (tag === 'U' || tag === 'INS') fallback = fallback || 'underline';
        if ((tag === 'I' || tag === 'EM') && !isMispairedByKaomoji(el)) fallback = fallback || 'italic';
        el = el.parentElement;
    }
    return fallback || 'main';
}

function isSkipped(node) {
    const parent = node.parentElement;
    if (!parent) return true;
    if (parent.closest('.mes_reasoning, .edit_textarea, .mes_img, .tokenCounterDisplay, .mes_timer')) return true;
    return false;
}

/** 通用排除条件：已被本扩展包裹的字符 / 引号片段内部不再二次处理 */
function acceptTextNode(node) {
    if (!node.textContent) return NodeFilter.FILTER_REJECT;
    if (isSkipped(node)) return NodeFilter.FILTER_REJECT;
    const parent = node.parentElement;
    if (!parent) return NodeFilter.FILTER_REJECT;
    if (parent.closest('.stfc-char, .stfc-quote-wrap')) return NodeFilter.FILTER_REJECT;
    if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
    if (parent.closest('pre, code, kbd, samp, a, script, style, video, audio, button, input, select, textarea')) {
        return NodeFilter.FILTER_REJECT;
    }
    return NodeFilter.FILTER_ACCEPT;
}

/** 收集根节点下所有需要处理的文本节点（先收集，避免边遍历边改 DOM） */
function collectTextNodes(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: acceptTextNode,
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
}

/** 收集根节点下含裸双引号、需要检查的文本节点 */
function collectMainQuoteNodes(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            if (!node.textContent || !/[“"]/.test(node.textContent)) return NodeFilter.FILTER_REJECT;
            return acceptTextNode(node);
        },
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
}

/** CSS 方案：把元素按类别配置上色（theme 还原主题 / solid 纯色 / gradient 角度渐变） */
function paintElement(el, cfg, catKey) {
    el.classList.add('stfc-tagged');
    el.style.removeProperty('color');
    el.style.removeProperty('background-image');
    el.style.removeProperty('-webkit-background-clip');
    el.style.removeProperty('background-clip');
    el.style.removeProperty('-webkit-text-fill-color');
    // 兼容旧版本残留的盒补偿样式，保证切换类别 / 模式后不残留
    el.style.removeProperty('padding');
    el.style.removeProperty('margin');
    el.style.removeProperty('background-origin');
    if (cfg.mode === 'solid') {
        el.style.color = cfg.solid;
        // 阻断父级渐变元素 -webkit-text-fill-color: transparent 的继承泄漏：
        // 填充色跟随 currentColor，否则透明会盖掉上面的纯色（末字 / 子元素发黑缺色）
        el.style.webkitTextFillColor = 'currentColor';
        return;
    }
    if (cfg.mode === 'gradient') {
        const stops = cfg.gradient.join(', ');
        const angle = normalizeAngle(cfg.angle);
        el.style.backgroundImage = `linear-gradient(${angle}deg, ${stops})`;
        el.style.webkitBackgroundClip = 'text';
        el.style.backgroundClip = 'text';
        el.style.webkitTextFillColor = 'transparent';
        el.style.color = 'transparent';
        return;
    }
    // theme：颜色完全跟随酒馆主题；同样阻断父级渐变透明继承，避免透明填充盖掉主题色
    el.style.webkitTextFillColor = 'currentColor';
}

/** CSS 方案：处理特殊元素类别（斜体 / 下划线 / 引用容器），本元素一把渐变；斜体跳过颜文字碎片 */
function paintCategoryElements(root, selector, cfg, catKey) {
    root.querySelectorAll(selector).forEach((el) => {
        if (el.closest('.mes_reasoning')) return;
        if (catKey === 'italic' && isMispairedByKaomoji(el)) return;
        paintElement(el, cfg, catKey);
    });
}

/* -------------------------------------------------------------------------- */
/* length 循环：逐字符插值上色                                                  */
/* -------------------------------------------------------------------------- */

/**
 * 把一段文本写入碎片：
 *   theme  —— 原样文本；solid —— 整段纯色 span；
 *   gradient.length —— 按计数器连续插值，每 cycleLength 字走完一遍色标。
 */
function writeChars(fragment, text, cfg, counterRef, catKey) {
    if (!text) return;
    if (cfg.mode === 'theme') {
        fragment.appendChild(document.createTextNode(text));
        return;
    }
    if (cfg.mode === 'solid') {
        const span = document.createElement('span');
        span.className = 'stfc-char stfc-tagged';
        span.dataset.stfcCat = catKey;
        span.style.color = cfg.solid;
        span.textContent = text;
        fragment.appendChild(span);
        counterRef.value += text.length;
        return;
    }
    const stops = cfg.gradient.map(hexToRgb);
    const cycleLen = Number.isFinite(cfg.cycleLength) && cfg.cycleLength >= 2
        ? Math.floor(cfg.cycleLength)
        : CYCLE_LENGTH;
    for (let i = 0; i < text.length; i++) {
        const p = (counterRef.value % cycleLen) / cycleLen;
        const color = gradientColor(stops, p);
        const span = document.createElement('span');
        span.className = 'stfc-char stfc-tagged';
        span.dataset.stfcCat = catKey;
        span.style.color = rgbStr(color);
        span.textContent = text[i];
        fragment.appendChild(span);
        counterRef.value++;
    }
}

/** length 方案：斜体 / 下划线 / 引用元素内部连续计数，逐字符上色；斜体跳过颜文字碎片 */
function applyElementsByLength(root, selector, catKey, cfg) {
    root.querySelectorAll(selector).forEach((el) => {
        if (el.closest('.mes_reasoning')) return;
        if (catKey === 'italic' && isMispairedByKaomoji(el)) return;
        el.classList.add('stfc-tagged');
        const nodes = collectTextNodes(el).filter(
            (node) => !(node.parentElement.closest('q, blockquote') && catKey !== 'quote'),
        );
        const counter = { value: 0 };
        nodes.forEach((node) => {
            const fragment = document.createDocumentFragment();
            writeChars(fragment, node.textContent, cfg, counter, catKey);
            node.parentNode.replaceChild(fragment, node);
        });
    });
}

/**
 * 斜体句子循环（paragraph）：整句逐字符按角度走向投影取色，直接写 color。
 * 不铺背景渐变、不写透明填充与盒补偿，从机制上绕开 background-clip: text
 * 背景盒裁掉合成倾斜伸出笔画的问题；水平 / 斜角走向按字符位置过渡，
 * 接近垂直（0° / 180°）走向时单行内所有字取渐变中间色，均匀不偏色。
 */
function applyItalicSentence(root, cfg) {
    const stops = cfg.gradient.map(hexToRgb);
    const angle = normalizeAngle(cfg.angle);
    const rad = (angle * Math.PI) / 180;
    const dir = Math.sin(rad);
    const horizontal = Math.abs(dir) >= 0.15;

    root.querySelectorAll('i, em').forEach((el) => {
        if (el.closest('.mes_reasoning')) return;
        if (isMispairedByKaomoji(el)) return;
        el.classList.add('stfc-tagged');
        // 清理历史背景渐变 / 透明填充 / 盒补偿残留，保证逐字符 color 不被覆盖
        el.style.removeProperty('color');
        el.style.removeProperty('background-image');
        el.style.removeProperty('-webkit-background-clip');
        el.style.removeProperty('background-clip');
        el.style.removeProperty('-webkit-text-fill-color');
        el.style.removeProperty('padding');
        el.style.removeProperty('margin');
        el.style.removeProperty('background-origin');

        const nodes = collectTextNodes(el);
        const total = nodes.reduce((sum, n) => sum + n.textContent.length, 0);
        let index = 0;
        nodes.forEach((node) => {
            const fragment = document.createDocumentFragment();
            const text = node.textContent;
            for (let i = 0; i < text.length; i++) {
                const x = total > 1 ? index / (total - 1) : 0;
                const p = horizontal ? (dir > 0 ? x : 1 - x) : 0.5;
                const color = gradientColor(stops, p);
                const span = document.createElement('span');
                span.className = 'stfc-char stfc-tagged';
                span.dataset.stfcCat = 'italic';
                span.style.color = rgbStr(color);
                span.textContent = text[i];
                fragment.appendChild(span);
                index++;
            }
            node.parentNode.replaceChild(fragment, node);
        });
    });
}

/* -------------------------------------------------------------------------- */
/* 颜文字碎片：Markdown 误配对产生的 <i>/<em> 归还主要文本                        */
/* -------------------------------------------------------------------------- */

/**
 * 把颜文字碎片 <i>/<em> 重置为跟随父级主要文本：
 * 清除斜体分支可能写入的背景 / 填充 / 颜色，颜色与填充一律 inherit 父级，
 * 让父段主文本渐变（background-clip: text）连续穿过碎片；字形倾斜保持不动。
 */
function restoreKaomojiToMain(el) {
    el.classList.add('stfc-kaomoji');
    el.style.removeProperty('color');
    el.style.removeProperty('background-image');
    el.style.removeProperty('-webkit-background-clip');
    el.style.removeProperty('background-clip');
    el.style.removeProperty('-webkit-text-fill-color');
    el.style.removeProperty('padding');
    el.style.removeProperty('margin');
    el.style.removeProperty('background-origin');
    el.style.color = 'inherit';
    el.style.webkitTextFillColor = 'inherit';
    el.style.backgroundImage = 'none';
}

/** 扫描所有 i/em，颜文字碎片标记并归还主要文本；真斜体留给后续斜体分支处理 */
function markKaomojiFragments(root) {
    root.querySelectorAll('i, em').forEach((el) => {
        if (el.closest('.mes_reasoning')) return;
        if (isMispairedByKaomoji(el)) restoreKaomojiToMain(el);
    });
}

/* -------------------------------------------------------------------------- */
/* 主要文本与裸引号                                                            */
/* -------------------------------------------------------------------------- */

/** 双引号对话切分：“...” 与 "..." 归入引用类别 */
const QUOTE_RE = /[“"]([^”"]+)[”"]/g;

/** 把一段文本切分为 main / quote 片段 */
function splitQuoteParts(text) {
    const parts = [];
    let last = 0;
    let m;
    QUOTE_RE.lastIndex = 0;
    while ((m = QUOTE_RE.exec(text)) !== null) {
        if (m.index > last) parts.push({ text: text.slice(last, m.index), cat: 'main' });
        parts.push({ text: m[0], cat: 'quote' });
        last = m.index + m[0].length;
    }
    if (last < text.length) parts.push({ text: text.slice(last), cat: 'main' });
    return parts;
}

/** CSS 方案：段落 / 句子循环——主要文本按自然段分别一把渐变，段内子元素优先用自己的配色 */
function paintMainParagraphs(root, cfg) {
    if (cfg.mode !== 'gradient') {
        paintElement(root, cfg);
        return;
    }
    const paras = [...root.querySelectorAll('p')].filter(
        (p) => !p.closest('blockquote, q, i, em, u, ins'),
    );
    if (paras.length === 0) {
        paintElement(root, cfg);
        return;
    }
    paras.forEach((p) => paintElement(p, cfg));
}

/** 主要文本里裸写的双引号对话（无 q 标签）：包一层 span 并套用引用配色（CSS 方案） */
function wrapBareQuotes(root, quoteCfg) {
    if (!quoteCfg || quoteCfg.mode === 'theme') return;
    const nodes = collectMainQuoteNodes(root).filter((node) => categoryOf(node) === 'main');
    nodes.forEach((node) => {
        const text = node.textContent;
        QUOTE_RE.lastIndex = 0;
        if (!QUOTE_RE.test(text)) return;
        QUOTE_RE.lastIndex = 0;
        const frag = document.createDocumentFragment();
        let last = 0;
        let m;
        while ((m = QUOTE_RE.exec(text)) !== null) {
            if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
            const span = document.createElement('span');
            span.className = 'stfc-quote-wrap';
            span.dataset.stfcCat = 'quote';
            span.textContent = m[0];
            paintElement(span, quoteCfg);
            frag.appendChild(span);
            last = m.index + m[0].length;
        }
        if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
        node.parentNode.replaceChild(fragment, node);
    });
}

/** 主要文本入口：CSS 方案（theme / solid / paragraph 渐变）与 length 逐字符方案分派 */
function processMainText(root, cats) {
    const mainCfg = cats.main;

    if (mainCfg.mode !== 'gradient' || mainCfg.cycle === 'paragraph') {
        paintMainParagraphs(root, mainCfg);
        wrapBareQuotes(root, cats.quote);
        return;
    }

    // length 循环：主要文本连续计数，裸引号片段独立走引用计数器
    const mainCounter = { value: 0 };
    const quoteCounter = { value: 0 };
    const nodes = collectTextNodes(root).filter((node) => categoryOf(node) === 'main');
    nodes.forEach((node) => {
        const parts = splitQuoteParts(node.textContent);
        const fragment = document.createDocumentFragment();
        parts.forEach((part) => {
            if (part.cat === 'quote') {
                writeChars(fragment, part.text, cats.quote, quoteCounter, 'quote');
            } else {
                writeChars(fragment, part.text, mainCfg, mainCounter, 'main');
            }
        });
        node.parentNode.replaceChild(fragment, node);
    });
}

/* -------------------------------------------------------------------------- */
/* 对外入口                                                                    */
/* -------------------------------------------------------------------------- */

/** 撤销根节点上本扩展做过的全部改动（幂等重绘基础） */
export function resetRoot(root) {
    root.querySelectorAll('span.stfc-quote-wrap').forEach((span) => {
        const parent = span.parentNode;
        if (!parent) return;
        while (span.firstChild) parent.insertBefore(span.firstChild, span);
        parent.removeChild(span);
    });
    root.querySelectorAll('span.stfc-char').forEach((span) => {
        const parent = span.parentNode;
        if (!parent) return;
        while (span.firstChild) parent.insertBefore(span.firstChild, span);
        parent.removeChild(span);
    });
    root.querySelectorAll('.stfc-tagged').forEach((el) => {
        el.classList.remove('stfc-tagged');
        el.style.removeProperty('color');
        el.style.removeProperty('background-image');
        el.style.removeProperty('-webkit-background-clip');
        el.style.removeProperty('background-clip');
        el.style.removeProperty('-webkit-text-fill-color');
        el.style.removeProperty('text-shadow');
        el.style.removeProperty('padding');
        el.style.removeProperty('margin');
        el.style.removeProperty('background-origin');
    });
    // 颜文字碎片标记：移除 class 与继承样式，回到未染色状态
    root.querySelectorAll('.stfc-kaomoji').forEach((el) => {
        el.classList.remove('stfc-kaomoji');
        el.style.removeProperty('color');
        el.style.removeProperty('background-image');
        el.style.removeProperty('-webkit-background-clip');
        el.style.removeProperty('background-clip');
        el.style.removeProperty('-webkit-text-fill-color');
        el.style.removeProperty('padding');
        el.style.removeProperty('margin');
        el.style.removeProperty('background-origin');
    });
}

/** 对任意文本根节点应用配色（聊天消息与面板预览共用同一引擎） */
export function applyToRoot(root) {
    resetRoot(root);
    if (!state.settings.enabled) return;
    const cats = state.settings.categories;
    // 先把颜文字碎片 <i>/<em> 归还主要文本，避免被斜体分支误染色
    markKaomojiFragments(root);
    applyCategory(root, 'i, em', 'italic', cats.italic);
    applyCategory(root, 'u, ins', 'underline', cats.underline);
    applyCategory(root, 'q, blockquote', 'quote', cats.quote);
    processMainText(root, cats);
}

/** 类别分派：length 走逐字符方案；斜体句子渐变走整句角度投影逐字符方案；其余走 CSS 方案 */
function applyCategory(root, selector, catKey, cfg) {
    if (cfg.mode === 'gradient' && cfg.cycle === 'length') {
        applyElementsByLength(root, selector, catKey, cfg);
        return;
    }
    if (catKey === 'italic' && cfg.mode === 'gradient' && cfg.cycle === 'paragraph') {
        applyItalicSentence(root, cfg);
        return;
    }
    paintCategoryElements(root, selector, cfg, catKey);
}

/** 当前设置指纹：设置未变化时已染色消息直接跳过，避免长聊天反复重建 DOM */
export function settingsSignature() {
    const s = state.settings;
    const parts = Object.keys(CATEGORY_META).map((key) => {
        const c = s.categories[key];
        return [key, c.mode, c.solid, c.gradient.join(','), c.angle, c.cycle, c.cycleLength].join('|');
    });
    return `${s.enabled ? '1' : '0'}:${parts.join(';')}`;
}

/** 清空消息指纹（设置变更需要全量重绘时调用） */
export function clearSignatures(scope) {
    (scope || document).querySelectorAll('#chat .mes').forEach((el) => {
        el.dataset.stfcSig = '';
        el.dataset.stfcHash = '';
    });
}

/** 单条消息文本指纹：流式追加新内容时指纹变化，仅重染该条消息 */
function messageHash(textEl) {
    const text = textEl.textContent || '';
    return `${text.length}|${text.slice(0, 80)}`;
}

/** 是否配置了任一自定义（纯色 / 渐变）类别；全为「跟随主题」时本扩展本就不产生染色产物 */
function hasCustomColor() {
    return Object.values(state.settings.categories).some((c) => c.mode !== 'theme');
}

/**
 * 染色产物是否已被外部清空：
 * 酒馆生成结束、切换滑条或重新渲染 Markdown 时会替换 `.mes_text` 的 innerHTML，
 * 把本扩展写入的包裹与内联样式整体冲掉；此时即便设置指纹与文本指纹都未变化，
 * 也必须强制重染，否则消息会退回酒馆默认色。
 */
function needsRepaint(textEl) {
    if (!state.settings.enabled || !hasCustomColor()) return false;
    return !textEl.querySelector('.stfc-tagged, .stfc-char, .stfc-quote-wrap, .stfc-kaomoji');
}

/** 处理单条消息：设置、文本均未变化且染色产物仍在则跳过；产物被外部清空时强制重染 */
export function processMessage(mesEl) {
    if (mesEl.dataset.stfcSkipped === '1') return;
    if (!state.settings.enabled) return;
    const textEl = mesEl.querySelector('.mes_text');
    if (!textEl) return;
    const sig = settingsSignature();
    const hash = messageHash(textEl);
    if (
        mesEl.dataset.stfcSig === sig &&
        mesEl.dataset.stfcHash === hash &&
        !needsRepaint(textEl)
    ) return;
    applyToRoot(textEl);
    mesEl.dataset.stfcSig = sig;
    mesEl.dataset.stfcHash = hash;
}

/** 批量处理聊天区内全部消息；scope 默认为 document */
export function processAll(scope) {
    const root = scope || document;
    root.querySelectorAll('#chat .mes').forEach(processMessage);
}
