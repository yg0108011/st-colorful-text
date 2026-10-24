/**
 * 多彩文本 Colorful Text —— 纯逻辑引擎（不依赖酒馆运行时，便于独立测试）
 *
 * 支持 主要文本 / 斜体文本 / 下划线文本 / 引用文本（含双引号对话）三种模式：
 *   theme    跟随酒馆主题
 *   solid    纯色自定义
 *   gradient 渐变：整段话循环（主要文本按自然段，斜体/下划线/引用按本句话/本元素），
 *              或自定义字符长度循环（默认 30 字一循环）
 */

export const MODULE_NAME = 'st-colorful-text';

/** 默认循环字符数（字符长度循环模式下的兜底值，可在面板自定义 2–999） */
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
            cycle: 'length',
            cycleLength: 30,
        },
        italic: {
            mode: 'theme',
            solid: '#919191',
            gradient: ['#fbc2eb', '#a6c1ee'],
            cycle: 'length',
            cycleLength: 30,
        },
        underline: {
            mode: 'theme',
            solid: '#bce7cf',
            gradient: ['#84fab0', '#8fd3f4'],
            cycle: 'length',
            cycleLength: 30,
        },
        quote: {
            mode: 'theme',
            solid: '#e18a24',
            gradient: ['#f6d365', '#fda085'],
            cycle: 'length',
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
        if (!['length', 'paragraph'].includes(cfg.cycle)) cfg.cycle = 'length';
        const len = Number.parseInt(cfg.cycleLength, 10);
        cfg.cycleLength = Number.isFinite(len) && len >= 2 && len <= 999 ? len : 30;
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
 * paraCtx（仅整段话循环使用）：{ index: 本片段在所属单元内的起始字符位置, total: 所属单元字符总数 }；
 * 不传时默认按本片段自身长度计算，即每个片段各自走完一遍色标。
 */
function writeSegment(fragment, text, cfg, counterRef, catKey, paraCtx) {
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
    // gradient —— 两种循环方式：整段话一循环 / 自定义字符长度循环
    const stops = cfg.gradient.map(hexToRgb);
    const len = text.length;
    if (cfg.cycle === 'paragraph') {
        // 整段话循环：所属单元首字到尾字走完一遍色标
        const total = paraCtx && paraCtx.total > 0 ? paraCtx.total : len;
        const start = paraCtx ? paraCtx.index : 0;
        for (let i = 0; i < len; i++) {
            const p = total > 1 ? (start + i) / (total - 1) : 0;
            const color = gradientColor(stops, p);
            const span = document.createElement('span');
            span.className = 'stfc-char stfc-tagged';
            span.dataset.stfcCat = catKey;
            span.style.color = rgbStr(color);
            span.textContent = text[i];
            fragment.appendChild(span);
        }
        return;
    }
    // 字符长度循环：每 cycleLength 个字一个循环
    const cycleLen = Number.isFinite(cfg.cycleLength) && cfg.cycleLength >= 2 ? Math.floor(cfg.cycleLength) : CYCLE_LENGTH;
    for (let i = 0; i < len; i++) {
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

/** 处理特殊元素类别（斜体 / 下划线 / 引用容器）；整段话循环以「本元素（本句话）」为单位 */
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
        // 元素内部需要处理的文本节点（元素内部再出现引用容器时跟随引用样式）
        const nodes = collectTextNodes(el).filter(
            (node) => !(node.parentElement.closest('q, blockquote') && catKey !== 'quote'),
        );
        const counter = { value: 0 };
        if (cfg.cycle === 'paragraph') {
            // 整段话循环：本元素全部字符共享一条梯度，不按文本节点重置
            const total = nodes.reduce((n, node) => n + node.textContent.length, 0);
            const para = { index: 0, total };
            nodes.forEach((node) => {
                const fragment = document.createDocumentFragment();
                writeSegment(fragment, node.textContent, cfg, counter, catKey, para);
                para.index += node.textContent.length;
                node.parentNode.replaceChild(fragment, node);
            });
            return;
        }
        // 字符长度循环：元素内部逐字符连续计数
        nodes.forEach((node) => {
            const fragment = document.createDocumentFragment();
            writeSegment(fragment, node.textContent, cfg, counter, catKey);
            node.parentNode.replaceChild(fragment, node);
        });
    });
}

/** 双引号对话切分：“...” 与 "..." 归入引用类别 */
const QUOTE_RE = /[“"]([^”"]+)[”"]/g;

/** 整段话循环的自然段归属：优先 `<p>`，无段落标签时回退到最近的块级 div */
function paragraphKey(node) {
    const p = node.parentElement.closest('p');
    if (p) return p;
    const div = node.parentElement.closest('div');
    return div || node.parentElement;
}

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

function processMainText(root, cats) {
    const mainCfg = cats.main;
    const mainCounter = { value: 0 };
    const quoteCounter = { value: 0 };

    if (mainCfg.mode === 'solid') {
        root.style.color = mainCfg.solid;
        root.classList.add('stfc-tagged');
    }

    const nodes = collectTextNodes(root).filter((node) => categoryOf(node) === 'main');
    const entries = nodes.map((node) => ({ node, parts: splitQuoteParts(node.textContent) }));

    // 整段话循环：按自然段统计主要文本字符总数，段内被引号打断也不重置梯度
    let paraTotals = null;
    if (mainCfg.mode === 'gradient' && mainCfg.cycle === 'paragraph') {
        paraTotals = new Map();
        for (const entry of entries) {
            const key = paragraphKey(entry.node);
            const mainLen = entry.parts
                .filter((part) => part.cat === 'main')
                .reduce((n, part) => n + part.text.length, 0);
            paraTotals.set(key, (paraTotals.get(key) || 0) + mainLen);
        }
    }
    const paraIndex = new Map();

    entries.forEach(({ node, parts }) => {
        if (parts.length === 1 && parts[0].cat === 'main') {
            if (mainCfg.mode === 'gradient') {
                const fragment = document.createDocumentFragment();
                if (mainCfg.cycle === 'paragraph') {
                    const key = paragraphKey(node);
                    const total = paraTotals.get(key) || 1;
                    const idx = paraIndex.get(key) || 0;
                    writeSegment(fragment, parts[0].text, mainCfg, mainCounter, 'main', { index: idx, total });
                    paraIndex.set(key, idx + parts[0].text.length);
                } else {
                    writeSegment(fragment, parts[0].text, mainCfg, mainCounter, 'main');
                }
                node.parentNode.replaceChild(fragment, node);
            }
            // solid / theme：沿用容器颜色，不包裹
            return;
        }

        const fragment = document.createDocumentFragment();
        const key = mainCfg.cycle === 'paragraph' ? paragraphKey(node) : null;
        parts.forEach((part) => {
            if (part.cat === 'quote') {
                // 引号对话以「本句话（本引号片段）」为单位各自走完色标
                writeSegment(fragment, part.text, cats.quote, quoteCounter, 'quote');
                return;
            }
            if (mainCfg.mode === 'gradient') {
                if (mainCfg.cycle === 'paragraph') {
                    const total = paraTotals.get(key) || 1;
                    const idx = paraIndex.get(key) || 0;
                    writeSegment(fragment, part.text, mainCfg, mainCounter, 'main', { index: idx, total });
                    paraIndex.set(key, idx + part.text.length);
                } else {
                    writeSegment(fragment, part.text, mainCfg, mainCounter, 'main');
                }
            } else {
                // solid / theme：沿用容器颜色，不包裹
                fragment.appendChild(document.createTextNode(part.text));
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

/** 当前设置指纹：设置未变化时已染色消息直接跳过，避免长聊天反复重建 DOM */
export function settingsSignature() {
    const s = state.settings;
    const parts = Object.keys(CATEGORY_META).map((key) => {
        const c = s.categories[key];
        return [key, c.mode, c.solid, c.gradient.join(','), c.cycle, c.cycleLength].join('|');
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

/** 处理单条消息：设置与文本都未变化则跳过，避免重复包裹 */
export function processMessage(mesEl) {
    if (mesEl.dataset.stfcSkipped === '1') return;
    const textEl = mesEl.querySelector('.mes_text');
    if (!textEl) return;
    const sig = settingsSignature();
    const hash = messageHash(textEl);
    if (mesEl.dataset.stfcSig === sig && mesEl.dataset.stfcHash === hash) return;
    applyToRoot(textEl);
    mesEl.dataset.stfcSig = sig;
    mesEl.dataset.stfcHash = hash;
}

/** 批量处理聊天区内全部消息；scope 默认为 document */
export function processAll(scope) {
    const root = scope || document;
    root.querySelectorAll('#chat .mes').forEach(processMessage);
}
