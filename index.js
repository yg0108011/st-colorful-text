/**
 * 多彩文本 Colorful Text —— SillyTavern 第三方扩展入口
 * 负责：设置持久化、设置面板 UI、事件绑定、DOM 观察器；染色逻辑见 engine.js。
 */

import { extension_settings, getContext } from '../../../extensions.js';
import { eventSource, event_types, saveSettingsDebounced } from '../../../../script.js';
import * as Engine from './engine.js';

const MODULE_NAME = Engine.MODULE_NAME;
const extensionFolderPath = `scripts/extensions/third-party/${MODULE_NAME}`;

/** 当前激活的分类标签 */
let activeCat = 'main';

/* -------------------------------------------------------------------------- */
/* 设置持久化                                                                 */
/* -------------------------------------------------------------------------- */

function loadSettings() {
    extension_settings[MODULE_NAME] = extension_settings[MODULE_NAME] || {};
    Engine.setSettings(Engine.normalizeSettings(extension_settings[MODULE_NAME]));
    extension_settings[MODULE_NAME] = Engine.getSettings();
}

function saveSettings() {
    extension_settings[MODULE_NAME] = Engine.getSettings();
    if (typeof saveSettingsDebounced === 'function') saveSettingsDebounced();
}

/* -------------------------------------------------------------------------- */
/* 面板 UI                                                                    */
/* -------------------------------------------------------------------------- */

function refreshPreview() {
    const preview = document.getElementById('sct-preview');
    if (!preview) return;
    Engine.applyToRoot(preview);
}

function renderStopPickers(catKey) {
    const cfg = Engine.getSettings().categories[catKey];
    const box = document.querySelector(`.sct-stops[data-cat="${catKey}"]`);
    if (!box) return;
    box.innerHTML = '';
    cfg.gradient.forEach((color, idx) => {
        const row = document.createElement('div');
        row.className = 'sct-stop-row';
        const valid = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color);
        const hex = valid ? color.toLowerCase() : '#888888';
        const input = createColorPicker(hex, 'sct-gradient-stop');
        input.dataset.cat = catKey;
        input.dataset.idx = idx;
        const hexInput = document.createElement('input');
        hexInput.type = 'text';
        hexInput.className = 'sct-hex sct-stop-hex';
        hexInput.dataset.cat = catKey;
        hexInput.dataset.idx = idx;
        hexInput.value = hex;
        hexInput.maxLength = 7;
        hexInput.spellcheck = false;
        hexInput.autocomplete = 'off';
        bindColorPair(input, hexInput, (hexVal) => {
            cfg.gradient[idx] = hexVal;
            saveSettings();
            updateGradientStrip(catKey);
            refreshAll();
        }, () => cfg.gradient[idx]);
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'sct-remove-stop menu_button_icon';
        remove.title = '删除此颜色';
        remove.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        remove.dataset.cat = catKey;
        remove.dataset.idx = idx;
        if (cfg.gradient.length <= 2) remove.classList.add('disabled');
        row.append(input, hexInput, remove);
        box.append(row);
    });
    updateGradientStrip(catKey);
}

function updateGradientStrip(catKey) {
    const cfg = Engine.getSettings().categories[catKey];
    const strip = document.querySelector(`.sct-gradient-preview[data-cat="${catKey}"]`);
    if (!strip) return;
    const angle = Engine.normalizeAngle(cfg.angle);
    strip.style.background = `linear-gradient(${angle}deg, ${cfg.gradient.join(', ')})`;
}

const HEX_RE = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** 校验并归一化色号：接受 #RGB / #RRGGBB（可省略 #），返回小写 6 位色号；非法返回 null */
function normalizeHex(raw) {
    const m = HEX_RE.exec(String(raw || '').trim());
    if (!m) return null;
    let hex = '#' + m[1];
    if (hex.length === 4) {
        hex = '#' + [...hex.slice(1)].map((c) => c + c).join('');
    }
    return hex.toLowerCase();
}

/* -------------------------------------------------------------------------- */
/* 取色器适配层：优先使用酒馆自带的 <toolcool-color-picker> 组件（与主题色面板同款
   的调色盘 + 色相条 + 透明条 + Hex/R/G/B/A，无建议预设页、无「取消 / 设置」模态
   弹窗）；当前酒馆版本未注册该组件时回退原生 <input type="color">，保证旧版本可用。 */
/* -------------------------------------------------------------------------- */

const TOOLCOOL_TAG = 'toolcool-color-picker';

/** 当前环境是否已注册酒馆自带的 toolcool 取色组件 */
function hasToolcoolPicker() {
    return typeof customElements !== 'undefined' && Boolean(customElements.get(TOOLCOOL_TAG));
}

/** 判断取色器是否为 toolcool 组件 */
function isToolcool(picker) {
    return Boolean(picker) && picker.tagName === TOOLCOOL_TAG.toUpperCase();
}

/** 创建取色器按钮：组件优先，未注册时回退原生 color input */
function createColorPicker(hex, className) {
    if (hasToolcoolPicker()) {
        const picker = document.createElement(TOOLCOOL_TAG);
        picker.setAttribute('color', hex);
        // 面板位于右侧栏，popup 向右对齐按钮右缘、向左展开，避免被栏宽裁掉
        picker.setAttribute('popup-position', 'right');
        picker.setAttribute('button-height', '1.9em');
        picker.className = className;
        return picker;
    }
    const picker = document.createElement('input');
    picker.type = 'color';
    picker.className = className;
    picker.value = hex;
    return picker;
}

/** 读取取色器当前颜色，返回归一化 6 位小写 hex；非法回退 #888888 */
function pickerColor(picker) {
    const raw = isToolcool(picker)
        ? (picker.hex || picker.getAttribute('color') || '')
        : picker.value;
    return normalizeHex(raw) || '#888888';
}

/** 回写取色器颜色（6 位 hex） */
function setPickerColor(picker, hex) {
    if (isToolcool(picker)) {
        picker.setAttribute('color', hex);
    } else {
        picker.value = hex;
    }
}

/** 绑定取色器颜色变更：组件为 change 事件，原生为 input 事件；回调回传归一化 hex */
function onPickerChange(picker, handler) {
    const listener = () => handler(pickerColor(picker));
    if (isToolcool(picker)) {
        picker.addEventListener('change', listener);
    } else {
        picker.addEventListener('input', listener);
    }
}

/** 取色器与色号输入框双向同步；applyHex 写入设置并刷新，getCurrentHex 用于失焦还原 */
function bindColorPair(picker, hexInput, applyHex, getCurrentHex) {
    if (!picker || !hexInput) return;
    let applyTimer = null;
    // 组件连入 DOM 时会按初始色派发一次 change，忽略该次初始化回写；原生 input 无此事件
    let skipFirst = isToolcool(picker);
    const scheduleApply = (hexVal) => {
        if (applyTimer) clearTimeout(applyTimer);
        applyTimer = setTimeout(() => applyHex(hexVal), 200);
    };
    onPickerChange(picker, (hexVal) => {
        if (skipFirst) { skipFirst = false; return; }
        hexInput.value = hexVal;
        hexInput.classList.remove('invalid');
        scheduleApply(hexVal);
    });
    hexInput.addEventListener('input', () => {
        const norm = normalizeHex(hexInput.value);
        if (norm) {
            hexInput.classList.remove('invalid');
            setPickerColor(picker, norm);
            scheduleApply(norm);
        } else {
            hexInput.classList.add('invalid');
        }
    });
    hexInput.addEventListener('blur', () => {
        if (applyTimer) { clearTimeout(applyTimer); applyTimer = null; }
        const norm = normalizeHex(hexInput.value);
        if (norm) {
            hexInput.value = norm;
            setPickerColor(picker, norm);
            applyHex(norm);
        } else {
            const current = normalizeHex(getCurrentHex());
            hexInput.value = current || getCurrentHex();
            if (current) setPickerColor(picker, current);
            hexInput.classList.remove('invalid');
        }
    });
}

/** 根据模式显示对应的设置行；字符数输入框仅「字符长度」显示；斜体句子循环不支持角度 */
function showRowsByMode(panel, cfg, catKey) {
    panel.querySelector('.sct-solid-row').style.display = cfg.mode === 'solid' ? 'flex' : 'none';
    panel.querySelector('.sct-gradient-row').style.display = cfg.mode === 'gradient' ? 'flex' : 'none';
    if (cfg.mode === 'gradient') {
        panel.querySelector('.sct-cycle-length-row').style.display = cfg.cycle === 'length' ? 'flex' : 'none';
        // 斜体句子循环走整句逐字水平插值，角度滑杆不生效，隐藏该行
        const angleRow = panel.querySelector('.sct-angle-row');
        const angleHidden = catKey === 'italic' && cfg.cycle === 'paragraph';
        if (angleRow) angleRow.style.display = angleHidden ? 'none' : 'flex';
    }
}

/** 渲染当前激活分类的设置面板（每次切 tab 或切模式时重建） */
function renderPanel() {
    const list = document.getElementById('sct-category-list');
    if (!list) return;
    list.querySelectorAll('.sct-tab').forEach((tab) => {
        tab.classList.toggle('sct-active', tab.dataset.cat === activeCat);
    });

    const catKey = activeCat;
    const cfg = Engine.getSettings().categories[catKey];
    // 主要文本按「段落」循环，斜体 / 下划线 / 引用按「句子」循环；后端取值统一为 paragraph
    const paragraphLabel = catKey === 'main' ? '段落' : '句子';
    const panel = list.querySelector('.sct-tab-panel');
    panel.innerHTML = `
        <label class="sct-mode-row">
            <span>配色模式</span>
            <select class="sct-mode text_pole" data-cat="${catKey}">
                <option value="theme">跟随酒馆主题</option>
                <option value="solid">纯色</option>
                <option value="gradient">渐变</option>
            </select>
        </label>
        <div class="sct-solid-row" data-cat="${catKey}">
            <span>纯色颜色</span>
            <div class="sct-color-control">
                <span class="sct-solid-slot" data-cat="${catKey}"></span>
                <input type="text" class="sct-hex sct-solid-hex" data-cat="${catKey}" maxlength="7" spellcheck="false" autocomplete="off" />
            </div>
        </div>
        <div class="sct-gradient-row" data-cat="${catKey}">
            <div class="sct-gradient-head">
                <span>渐变颜色（2–4 色）</span>
                <button type="button" class="sct-add-stop menu_button_icon" data-cat="${catKey}" title="添加一个颜色">
                    <i class="fa-solid fa-plus"></i>
                </button>
            </div>
            <div class="sct-stops" data-cat="${catKey}"></div>
            <div class="sct-gradient-preview" data-cat="${catKey}"></div>
            <label class="sct-cycle-row" data-cat="${catKey}">
                <span>循环方式</span>
                <select class="sct-cycle text_pole" data-cat="${catKey}">
                    <option value="length">字符长度</option>
                    <option value="paragraph">${paragraphLabel}</option>
                </select>
            </label>
            <label class="sct-cycle-length-row" data-cat="${catKey}">
                <span>循环字符数</span>
                <input type="number" class="sct-cycle-length" data-cat="${catKey}" min="2" max="999" step="1" />
            </label>
            <div class="sct-angle-row" data-cat="${catKey}">
                <span class="sct-angle-label">渐变角度</span>
                <input type="range" class="sct-angle" min="0" max="360" step="1" data-cat="${catKey}" />
                <span class="sct-angle-deg" data-cat="${catKey}">${Engine.normalizeAngle(cfg.angle)}°</span>
            </div>
        </div>`;

    panel.querySelector('.sct-mode').value = cfg.mode;
    panel.querySelector('.sct-cycle').value = cfg.cycle;
    panel.querySelector('.sct-cycle-length').value = cfg.cycleLength;
    showRowsByMode(panel, cfg, catKey);

    // 纯色取色器（组件优先，未注册时回退原生 color input）
    const solidOk = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(cfg.solid);
    const solidHex = solidOk ? cfg.solid.toLowerCase() : '#888888';
    const solidPicker = createColorPicker(solidHex, 'sct-solid');
    panel.querySelector('.sct-solid-slot').replaceChildren(solidPicker);
    panel.querySelector('.sct-solid-hex').value = solidHex;
    bindColorPair(
        solidPicker,
        panel.querySelector('.sct-solid-hex'),
        (hexVal) => {
            cfg.solid = hexVal;
            saveSettings();
            refreshAll();
        },
        () => cfg.solid,
    );

    renderStopPickers(catKey);
}

function buildCategoryUI() {
    const list = document.getElementById('sct-category-list');
    if (!list) return;
    list.innerHTML = `<div class="sct-tabs"></div><div class="sct-tab-panel"></div>`;
    const tabsBox = list.querySelector('.sct-tabs');
    Object.entries(Engine.CATEGORY_META).forEach(([catKey, meta]) => {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'sct-tab';
        tab.dataset.cat = catKey;
        tab.innerHTML = `<i class="${meta.icon}"></i><span>${meta.label}</span>`;
        tab.addEventListener('click', () => {
            activeCat = catKey;
            renderPanel();
        });
        tabsBox.append(tab);
    });
    renderPanel();
}

function refreshAll() {
    // 设置变更后清空指纹，全量重绘一次；日常观察器触发只处理新增/变化消息
    Engine.clearSignatures(document);
    Engine.processAll(document);
    refreshPreview();
}

function setAngle(catKey, rawValue) {
    const cfg = Engine.getSettings().categories[catKey];
    cfg.angle = Engine.normalizeAngle(rawValue);
    saveSettings();
    const panel = document.querySelector(`.sct-angle-row[data-cat="${catKey}"]`);
    if (panel) {
        panel.querySelector('.sct-angle').value = cfg.angle;
        panel.querySelector('.sct-angle-deg').textContent = `${cfg.angle}°`;
    }
    updateGradientStrip(catKey);
    refreshAll();
}

function bindUI() {
    const enabledBox = document.getElementById('sct-enabled');
    if (enabledBox) {
        enabledBox.checked = Engine.getSettings().enabled;
        enabledBox.addEventListener('change', () => {
            Engine.getSettings().enabled = enabledBox.checked;
            saveSettings();
            refreshAll();
        });
    }

    const list = document.getElementById('sct-category-list');

    // 配色模式切换（切模式后重建面板以显示/隐藏对应行）
    list.addEventListener('change', (ev) => {
        if (ev.target.classList.contains('sct-mode')) {
            const catKey = ev.target.dataset.cat;
            Engine.getSettings().categories[catKey].mode = ev.target.value;
            saveSettings();
            renderPanel();
            refreshAll();
            return;
        }
        // 循环方式切换：paragraph / length 重建面板以显示/隐藏字符数输入框
        if (ev.target.classList.contains('sct-cycle')) {
            const catKey = ev.target.dataset.cat;
            Engine.getSettings().categories[catKey].cycle = ev.target.value;
            saveSettings();
            renderPanel();
            refreshAll();
        }
    });

    // 角度滑杆 + 循环字符数输入
    list.addEventListener('input', (ev) => {
        if (ev.target.classList.contains('sct-angle')) {
            setAngle(ev.target.dataset.cat, ev.target.value);
            return;
        }
        if (ev.target.classList.contains('sct-cycle-length')) {
            const catKey = ev.target.dataset.cat;
            const cfg = Engine.getSettings().categories[catKey];
            const n = Number.parseInt(ev.target.value, 10);
            cfg.cycleLength = Number.isFinite(n) && n >= 2 && n <= 999 ? n : 2;
            saveSettings();
            refreshAll();
        }
    });

    // 增删渐变色
    list.addEventListener('click', (ev) => {
        const addBtn = ev.target.closest('.sct-add-stop');
        const removeBtn = ev.target.closest('.sct-remove-stop');
        if (addBtn) {
            const catKey = addBtn.dataset.cat;
            const cfg = Engine.getSettings().categories[catKey];
            if (cfg.gradient.length >= 4) return;
            cfg.gradient.push(cfg.gradient[cfg.gradient.length - 1]);
            saveSettings();
            renderStopPickers(catKey);
            refreshAll();
            return;
        }
        if (removeBtn && !removeBtn.classList.contains('disabled')) {
            const catKey = removeBtn.dataset.cat;
            const cfg = Engine.getSettings().categories[catKey];
            if (cfg.gradient.length <= 2) return;
            cfg.gradient.splice(Number(removeBtn.dataset.idx), 1);
            saveSettings();
            renderStopPickers(catKey);
            refreshAll();
        }
    });

    document.getElementById('sct-apply')?.addEventListener('click', () => {
        Engine.clearSignatures(document);
        Engine.processAll(document);
        if (typeof toastr !== 'undefined') toastr.success('多彩文本已应用到当前聊天');
    });

    document.getElementById('sct-reset')?.addEventListener('click', () => {
        Engine.resetSettings();
        saveSettings();
        renderPanel();
        if (enabledBox) enabledBox.checked = Engine.getSettings().enabled;
        refreshAll();
        if (typeof toastr !== 'undefined') toastr.info('已恢复默认配色（跟随主题）');
    });
}

/* -------------------------------------------------------------------------- */
/* 事件绑定与观察器                                                           */
/* -------------------------------------------------------------------------- */

let observer = null;
let rafId = null;
let endTimers = [];

function scheduleProcess() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
        rafId = null;
        // 染色写入期间断开观察器，避免自身 DOM 改动触发二次回调
        if (observer) observer.disconnect();
        try {
            Engine.processAll(document);
        } finally {
            const chatEl = document.getElementById('chat');
            if (observer && chatEl) observer.observe(chatEl, { childList: true, subtree: true, characterData: true });
        }
    });
}

/**
 * 生成结束后延迟二次巡检：酒馆最终 Markdown 渲染有时晚于 GENERATION_ENDED 事件触发，
 * 事件回调里立即染色后 innerHTML 又被替换会冲掉染色；分两次延迟补染兜底。
 */
function scheduleLateRepaint() {
    endTimers.forEach((t) => clearTimeout(t));
    endTimers = [300, 700].map((delay) => setTimeout(() => scheduleProcess(), delay));
}

function setupEvents() {
    const handled = [
        'APP_READY', 'CHAT_LOADED', 'MESSAGE_RECEIVED', 'MESSAGE_EDITED',
        'MESSAGE_UPDATED', 'MESSAGE_SWIPED', 'MORE_MESSAGES_LOADED',
        'CHARACTER_MESSAGE_RENDERED', 'USER_MESSAGE_RENDERED',
        'CHAT_CHANGED', 'MESSAGE_SENT',
    ];
    handled.forEach((name) => {
        const type = event_types && event_types[name];
        if (type) eventSource.on(type, () => scheduleProcess());
    });

    // 生成结束：立即处理一次，再延迟补染两次，覆盖酒馆异步最终渲染窗口
    if (event_types && event_types.GENERATION_ENDED) {
        eventSource.on(event_types.GENERATION_ENDED, () => {
            scheduleProcess();
            scheduleLateRepaint();
        });
    }

    const chatEl = document.getElementById('chat');
    if (chatEl && !observer) {
        observer = new MutationObserver(() => scheduleProcess());
        observer.observe(chatEl, { childList: true, subtree: true, characterData: true });
    }
}

/* -------------------------------------------------------------------------- */
/* 初始化                                                                     */
/* -------------------------------------------------------------------------- */

function buildFallbackPanelHtml() {
    return `
    <div class="sct-settings-block">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b><i class="fa-solid fa-palette"></i> 多彩文本 Colorful Text</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <label class="checkbox_label"><input type="checkbox" id="sct-enabled" /><span>启用多彩文本</span></label>
                <div id="sct-category-list"></div>
                <div class="sct-preview-box">
                    <div class="sct-preview-title"><i class="fa-solid fa-eye"></i> 实时预览</div>
                    <div id="sct-preview">
                        <p>这是主要文本示例。</p>
                        <p><i>这是斜体文本示例。</i></p>
                        <p><u>这是下划线文本示例。</u></p>
                        <blockquote>这是引用文本示例。</blockquote>
                        <p><q>“这是双引号内的对话内容。”</q></p>
                    </div>
                </div>
                <div class="sct-actions">
                    <button type="button" class="menu_button" id="sct-apply">应用到当前聊天</button>
                    <button type="button" class="menu_button" id="sct-reset">恢复默认颜色</button>
                </div>
                <div class="sct-note">渐变支持段落 / 句子循环（主要文本按段落，斜体 / 下划线 / 引用按句子）或字符长度（每 N 个字一个循环，2–999 可调）；选择“跟随酒馆主题”时完全使用酒馆当前主题配色。</div>
            </div>
        </div>
    </div>`;
}

jQuery(async () => {
    try {
        loadSettings();

        let settingsHtml = '';
        try {
            settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
        } catch (err) {
            console.warn('[Colorful Text] 读取 settings.html 失败，使用内联面板', err);
            settingsHtml = buildFallbackPanelHtml();
        }
        const target = document.querySelector('#extensions_settings2') || document.getElementById('extensions_settings');
        if (target) target.insertAdjacentHTML('beforeend', settingsHtml);

        buildCategoryUI();
        bindUI();
        setupEvents();
        Engine.processAll(document);
        refreshPreview();
    } catch (err) {
        console.error('[Colorful Text] 初始化失败:', err);
    }
});
