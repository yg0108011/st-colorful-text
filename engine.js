/**
 * 多彩文本 Colorful Text —— 纯逻辑引擎（不依赖酒馆运行时，便于独立测试）
 *
 * 支持 主要文本 / 斜体文本 / 下划线文本 / 引用文本（含双引号对话）三种模式：
 *   theme    跟随酒馆主题
 *   solid    纯色自定义
 *   gradient 静态循环渐变（每 30 个字符完成一次循环，渐变覆盖全部字符）
 */

export const MODULE_NAME = 'st-colorful-text';

/** 渐变循环长度：30 个字一个静态循环（需求固定值） */
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
        },
        italic: {
            mode: 'theme',
            solid: '#919191',
            gradient: ['#fbc2eb', '#a6c1ee'],
        },
        underline: {
            mode: 'theme',
            solid: '#bce7cf',
            gradient: ['#84fab0', '#8fd3f4'],
        },
        quote: {
            mode: 'theme',
            solid: '#e18a24',
            gradient: ['#f6d365', '#fda085'],
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
        }
        if (!cfg.solid) cfg.solid = defaultSettings.categories[cat].solid;
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

/** 识别文本节点所属类别：引用 > 下划线 > 斜体 > 主要 */
export function categoryOf(node) {
    let el = node.parentElement;
    let fallback = null;
    while (el && !el.classList.contains('mes_text') && el.id !== 'sct-preview') {
        const tag = el.tagName;
        if (SKIP_TAGS.has(tag)) return null;
        if (tag === 'Q' || tag === 'BLOCKQUOTE') return 'quote';
        if (tag === 'U' || tag === 'INS') fallback = fallback || 'underline';
        if (tag === 'I' || tag === 'EM') fallback = fallback || 'italic';
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

/** 收集根节点下所有需要处理的文本节点（先收集，避免边遍历边改 DOM） */
function collectTextNodes(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            if (!node.textContent) return NodeFilter.FILTER_REJECT;
            if (isSkipped(node)) return NodeFilter.FILTER_REJECT;
            const parent = node.parentElement;
            if (!parent) return NodeFilter.FILTER_REJECT;
            if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
            if (parent.closest('pre, code, kbd, samp, a, script, style, video, audio, button, input, select, textarea')) {
                return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_ACCEPT;
        },
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
}

/** 撤销根节点上本扩展做过的全部改动（幂等重绘基础） */
export function resetRoot(root) {
    root.querySelectorAll('span.stfc-char').forEach((span) => {
        const parent = span.parentNode;
        if (!parent) return;
        while (span.firstChild) parent.insertBefore(span.firstChild, span);
        parent.removeChild(span);
    });
    root.querySelectorAll('.stfc-tagged').forEach((el) => {
        el.classList.remove('stfc-tagged');
        el.style.removeProperty('color');
        el.style.removeProperty('background');
        el.style.removeProperty('background-image');
        el.style.removeProperty('-webkit-text-fill-color');
        el.style.removeProperty('text-shadow');
    });
}

/**
 * 把一段文本按模式写入碎片。
 * 渐变模式：逐字符上色，渐变覆盖整段文字（渐变覆盖大于纯色，不留未着色字符）。
 */
function writeSegment(fragment, text, cfg, counterRef, catKey) {
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
    // gradient —— 静态循环渐变，30 字一循环
    const stops = cfg.gradient.map(hexToRgb);
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const p = (counterRef.value % CYCLE_LENGTH) / CYCLE_LENGTH;
        const color = gradientColor(stops, p);
        const span = document.createElement('span');
        span.className = 'stfc-char stfc-tagged';
        span.dataset.stfcCat = catKey;
        span.style.color = rgbStr(color);
        span.textContent = ch;
        fragment.appendChild(span);
        counterRef.value++;
    }
}

/** 处理特殊元素类别（斜体 / 下划线 / 引用容器） */
function applyToElements(root, selector, catKey, cfg) {
    root.querySelectorAll(selector).forEach((el) => {
        if (el.closest('.mes_reasoning')) return;
        el.classList.add('stfc-tagged');
        if (cfg.mode === 'theme') {
            el.style.removeProperty('color');
            return;
        }
        if (cfg.mode === 'solid') {
            el.style.color = cfg.solid;
            return;
        }
        // 渐变：元素内部逐字符循环上色
        const counter = { value: 0 };
        const nodes = collectTextNodes(el);
        nodes.forEach((node) => {
            // 元素内部再出现引用容器时跟随引用样式（与酒馆 q i { color: inherit } 一致）
            if (node.parentElement.closest('q, blockquote') && catKey !== 'quote') return;
            const fragment = document.createDocumentFragment();
            writeSegment(fragment, node.textContent, cfg, counter, catKey);
            node.parentNode.replaceChild(fragment, node);
        });
    });
}

/** 双引号对话切分：“...” 与 "..." 归入引用类别 */
const QUOTE_RE = /[“"]([^”"]+)[”"]/g;

function processMainText(root, cats) {
    const mainCfg = cats.main;
    const mainCounter = { value: 0 };
    const quoteCounter = { value: 0 };

    if (mainCfg.mode === 'solid') {
        root.style.color = mainCfg.solid;
        root.classList.add('stfc-tagged');
    }

    const nodes = collectTextNodes(root);
    nodes.forEach((node) => {
        const cat = categoryOf(node);
        if (cat !== 'main') return; // 特殊类别已由 applyToElements 处理
        const text = node.textContent;
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

        if (parts.length === 1 && parts[0].cat === 'main') {
            if (mainCfg.mode === 'gradient') {
                const fragment = document.createDocumentFragment();
                writeSegment(fragment, parts[0].text, mainCfg, mainCounter, 'main');
                node.parentNode.replaceChild(fragment, node);
            }
            // solid / theme：沿用容器颜色，不包裹
            return;
        }

        const fragment = document.createDocumentFragment();
        parts.forEach((part) => {
            if (part.cat === 'quote') {
                writeSegment(fragment, part.text, cats.quote, quoteCounter, 'quote');
            } else {
                writeSegment(fragment, part.text, mainCfg, mainCounter, 'main');
            }
        });
        node.parentNode.replaceChild(fragment, node);
    });
}

/** 对任意文本根节点应用配色（聊天消息与面板预览共用同一引擎） */
export function applyToRoot(root) {
    resetRoot(root);
    if (!state.settings.enabled) return;
    applyToElements(root, 'i, em', 'italic', state.settings.categories.italic);
    applyToElements(root, 'u, ins', 'underline', state.settings.categories.underline);
    applyToElements(root, 'q, blockquote', 'quote', state.settings.categories.quote);
    processMainText(root, state.settings.categories);
}

/** 处理单条消息 */
export function processMessage(mesEl) {
    if (mesEl.dataset.stfcSkipped === '1') return;
    const textEl = mesEl.querySelector('.mes_text');
    if (!textEl) return;
    applyToRoot(textEl);
}

/** 批量处理聊天区内全部消息；scope 默认为 document */
export function processAll(scope) {
    const root = scope || document;
    root.querySelectorAll('#chat .mes').forEach(processMessage);
}
