/**
 * 多彩文本 Colorful Text —— 纯逻辑引擎（不依赖酒馆运行时，便于独立测试）
 *
 * 支持 主要文本 / 斜体文本 / 下划线文本 / 引用文本（含双引号对话）三种模式：
 *   theme    跟随酒馆主题
 *   solid    纯色自定义
 *   gradient CSS 原生线性渐变：linear-gradient(角度 deg, 色标…) + background-clip: text，
 *            角度 0–360° 任意设置（0deg 自下而上，90deg 自左而右，180deg 自上而下）。
 */

export const MODULE_NAME = 'st-colorful-text';

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
        },
        italic: {
            mode: 'theme',
            solid: '#919191',
            gradient: ['#fbc2eb', '#a6c1ee'],
            angle: 90,
        },
        underline: {
            mode: 'theme',
            solid: '#bce7cf',
            gradient: ['#84fab0', '#8fd3f4'],
            angle: 90,
        },
        quote: {
            mode: 'theme',
            solid: '#e18a24',
            gradient: ['#f6d365', '#fda085'],
            angle: 90,
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

/** 校验并补齐异常设置，保证老版本升级后字段完整（旧版 cycle / cycleLength 字段自动丢弃） */
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
        // 旧版残留字段不再使用，清理掉保持设置干净
        delete cfg.cycle;
        delete cfg.cycleLength;
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

/** 把元素按类别配置上色：theme 还原主题 / solid 纯色 / gradient CSS 角度渐变 */
function paintElement(el, cfg) {
    el.classList.add('stfc-tagged');
    el.style.removeProperty('color');
    el.style.removeProperty('background-image');
    el.style.removeProperty('-webkit-background-clip');
    el.style.removeProperty('background-clip');
    el.style.removeProperty('-webkit-text-fill-color');
    if (cfg.mode === 'solid') {
        el.style.color = cfg.solid;
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
    }
    // theme：不加任何内联样式，完全跟随酒馆主题
}

/** 处理特殊元素类别（斜体 / 下划线 / 引用容器） */
function paintCategoryElements(root, selector, cfg) {
    root.querySelectorAll(selector).forEach((el) => {
        if (el.closest('.mes_reasoning')) return;
        paintElement(el, cfg);
    });
}

/** 双引号对话切分：“...” 与 "..." 归入引用类别 */
const QUOTE_RE = /[“"]([^”"]+)[”"]/g;

/** 收集根节点下需要检查的文本节点（先收集，避免边遍历边改 DOM） */
function collectMainQuoteNodes(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            if (!node.textContent || !/[“"]/.test(node.textContent)) return NodeFilter.FILTER_REJECT;
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

/** 主要文本里裸写的双引号对话（无 q 标签）：包一层 span 并套用引用配色 */
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
        node.parentNode.replaceChild(frag, node);
    });
}

/** 撤销根节点上本扩展做过的全部改动（幂等重绘基础） */
export function resetRoot(root) {
    root.querySelectorAll('span.stfc-quote-wrap').forEach((span) => {
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
    });
}

/** 对任意文本根节点应用配色（聊天消息与面板预览共用同一引擎） */
export function applyToRoot(root) {
    resetRoot(root);
    if (!state.settings.enabled) return;
    const cats = state.settings.categories;
    paintCategoryElements(root, 'i, em', cats.italic);
    paintCategoryElements(root, 'u, ins', cats.underline);
    paintCategoryElements(root, 'q, blockquote', cats.quote);
    // 主要文本：整段根容器一把渐变 / 纯色，内部子元素各自优先使用自己的配色
    paintElement(root, cats.main);
    // 主要文本里裸写的双引号对话包一层引用色
    wrapBareQuotes(root, cats.quote);
}

/** 当前设置指纹：设置未变化时已染色消息直接跳过，避免长聊天反复重建 DOM */
export function settingsSignature() {
    const s = state.settings;
    const parts = Object.keys(CATEGORY_META).map((key) => {
        const c = s.categories[key];
        return [key, c.mode, c.solid, c.gradient.join(','), c.angle].join('|');
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
