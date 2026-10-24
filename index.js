/**
 * 多彩文本 Colorful Text —— SillyTavern 第三方扩展入口
 * 负责：设置持久化、设置面板 UI、事件绑定、DOM 观察器；染色逻辑见 engine.js。
 */

import { extension_settings, getContext } from '../../../extensions.js';
import { eventSource, event_types, saveSettingsDebounced } from '../../../../script.js';
import * as Engine from './engine.js';

const MODULE_NAME = Engine.MODULE_NAME;
const extensionFolderPath = `scripts/extensions/third-party/${MODULE_NAME}`;

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
        const input = document.createElement('input');
        input.type = 'color';
        input.className = 'sct-gradient-stop';
        input.dataset.cat = catKey;
        input.dataset.idx = idx;
        input.value = hex;
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
    strip.style.background = `linear-gradient(90deg, ${cfg.gradient.join(', ')})`;
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

/** 取色器与色号输入框双向同步；applyHex 写入设置并刷新，getCurrentHex 用于失焦还原 */
function bindColorPair(picker, hexInput, applyHex, getCurrentHex) {
    if (!picker || !hexInput) return;
    let applyTimer = null;
    const scheduleApply = () => {
        if (applyTimer) clearTimeout(applyTimer);
        applyTimer = setTimeout(() => applyHex(picker.value), 200);
    };
    picker.addEventListener('input', () => {
        hexInput.value = picker.value;
        hexInput.classList.remove('invalid');
        scheduleApply();
    });
    hexInput.addEventListener('input', () => {
        const norm = normalizeHex(hexInput.value);
        if (norm) {
            hexInput.classList.remove('invalid');
            picker.value = norm;
            scheduleApply();
        } else {
            hexInput.classList.add('invalid');
        }
    });
    hexInput.addEventListener('blur', () => {
        if (applyTimer) { clearTimeout(applyTimer); applyTimer = null; }
        const norm = normalizeHex(hexInput.value);
        if (norm) {
            hexInput.value = norm;
            picker.value = norm;
            applyHex(norm);
        } else {
            const current = normalizeHex(getCurrentHex());
            hexInput.value = current || getCurrentHex();
            if (current) picker.value = current;
            hexInput.classList.remove('invalid');
        }
    });
}

function syncCategoryUI(catKey) {
    const cfg = Engine.getSettings().categories[catKey];
    const card = document.querySelector(`.sct-card[data-cat="${catKey}"]`);
    if (!card) return;
    card.querySelector('.sct-mode').value = cfg.mode;
    const solidOk = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(cfg.solid);
    const solidHex = solidOk ? cfg.solid.toLowerCase() : '#888888';
    card.querySelector('.sct-solid').value = solidHex;
    const solidHexInput = card.querySelector('.sct-solid-hex');
    if (solidHexInput) solidHexInput.value = solidHex;
    card.querySelectorAll('.sct-solid-row, .sct-gradient-row').forEach((row) => {
        row.style.display = 'none';
    });
    if (cfg.mode === 'solid') card.querySelector('.sct-solid-row').style.display = 'flex';
    if (cfg.mode === 'gradient') {
        card.querySelector('.sct-gradient-row').style.display = 'flex';
        card.querySelector('.sct-cycle').value = cfg.cycle;
        card.querySelector('.sct-cycle-length').value = cfg.cycleLength;
        card.querySelector('.sct-cycle-length-row').style.display = cfg.cycle === 'length' ? 'flex' : 'none';
    }
    renderStopPickers(catKey);
}

function buildCategoryUI() {
    const list = document.getElementById('sct-category-list');
    if (!list) return;
    Object.entries(Engine.CATEGORY_META).forEach(([catKey, meta]) => {
        const card = document.createElement('div');
        card.className = 'sct-card';
        card.dataset.cat = catKey;
        card.innerHTML = `
            <div class="sct-card-head"><i class="${meta.icon}"></i><span>${meta.label}</span></div>
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
                    <input type="color" class="sct-solid" data-cat="${catKey}" />
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
                <label class="sct-cycle-row">
                    <span>循环方式</span>
                    <select class="sct-cycle text_pole" data-cat="${catKey}">
                        <option value="length">字符长度循环</option>
                        <option value="paragraph">整段话 / 本句话循环</option>
                    </select>
                </label>
                <label class="sct-cycle-length-row">
                    <span>循环字符数</span>
                    <input type="number" class="sct-cycle-length" data-cat="${catKey}" min="2" max="999" step="1" />
                </label>
            </div>`;
        list.append(card);
    });
}

function refreshAll() {
    // 设置变更后清空指纹，全量重绘一次；日常观察器触发只处理新增/变化消息
    Engine.clearSignatures(document);
    Engine.processAll(document);
    refreshPreview();
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

    document.querySelectorAll('.sct-mode').forEach((select) => {
        select.addEventListener('change', () => {
            const catKey = select.dataset.cat;
            Engine.getSettings().categories[catKey].mode = select.value;
            saveSettings();
            syncCategoryUI(catKey);
            refreshAll();
        });
    });

    document.querySelectorAll('.sct-solid-row').forEach((row) => {
        const catKey = row.dataset.cat;
        bindColorPair(
            row.querySelector('.sct-solid'),
            row.querySelector('.sct-solid-hex'),
            (hexVal) => {
                Engine.getSettings().categories[catKey].solid = hexVal;
                saveSettings();
                refreshAll();
            },
            () => Engine.getSettings().categories[catKey].solid,
        );
    });

    document.querySelectorAll('.sct-cycle').forEach((select) => {
        select.addEventListener('change', () => {
            const catKey = select.dataset.cat;
            Engine.getSettings().categories[catKey].cycle = select.value;
            saveSettings();
            syncCategoryUI(catKey);
            refreshAll();
        });
    });

    document.querySelectorAll('.sct-cycle-length').forEach((input) => {
        input.addEventListener('input', () => {
            const catKey = input.dataset.cat;
            const cfg = Engine.getSettings().categories[catKey];
            const n = Number.parseInt(input.value, 10);
            cfg.cycleLength = Number.isFinite(n) && n >= 2 && n <= 999 ? n : 2;
            saveSettings();
            refreshAll();
        });
    });

    document.getElementById('sct-category-list')?.addEventListener('click', (ev) => {
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
        Object.keys(Engine.CATEGORY_META).forEach((cat) => syncCategoryUI(cat));
        if (enabledBox) enabledBox.checked = Engine.getSettings().enabled;
        refreshAll();
        if (typeof toastr !== 'undefined') toastr.info('已恢复默认配色（跟随主题）');
    });
}

function syncUIFromSettings() {
    Object.keys(Engine.CATEGORY_META).forEach(syncCategoryUI);
}

/* -------------------------------------------------------------------------- */
/* 事件绑定与观察器                                                           */
/* -------------------------------------------------------------------------- */

let observer = null;
let debounceTimer = null;

function scheduleProcess() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        // 染色写入期间断开观察器，避免自身 DOM 改动触发二次回调
        if (observer) observer.disconnect();
        try {
            Engine.processAll(document);
        } finally {
            const chatEl = document.getElementById('chat');
            if (observer && chatEl) observer.observe(chatEl, { childList: true, subtree: true, characterData: true });
        }
    }, 250);
}

function setupEvents() {
    const handled = [
        'APP_READY', 'CHAT_LOADED', 'MESSAGE_RECEIVED', 'MESSAGE_EDITED',
        'MESSAGE_UPDATED', 'MESSAGE_SWIPED', 'MORE_MESSAGES_LOADED',
        'CHARACTER_MESSAGE_RENDERED', 'USER_MESSAGE_RENDERED', 'GENERATION_ENDED',
        'CHAT_CHANGED', 'MESSAGE_SENT',
    ];
    handled.forEach((name) => {
        const type = event_types && event_types[name];
        if (type) eventSource.on(type, () => scheduleProcess());
    });

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
                <div class="sct-note">渐变支持字符长度循环（每 N 个字一个循环，默认 30，可自定义）或整段话 / 本句话循环（主要文本按自然段，斜体 / 下划线 / 引用按本句话）；跟随主题即使用酒馆当前主题配色。颜色可取色器选择，也可手动填写色号（#RGB / #RRGGBB）。</div>
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
        syncUIFromSettings();
        setupEvents();
        Engine.processAll(document);
        refreshPreview();
    } catch (err) {
        console.error('[Colorful Text] 初始化失败:', err);
    }
});
