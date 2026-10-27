/**
 * 多彩文本 Colorful Text —— SillyTavern 第三方扩展入口
 * 负责：设置持久化、设置面板 UI、事件绑定、DOM 观察器；染色逻辑见 engine.js。
 */

import { extension_settings, getContext } from '../../../extensions.js';
import { eventSource, event_types, saveSettingsDebounced } from '../../../../script.js';
import * as Engine from './engine.js';

const MODULE_NAME = Engine.MODULE_NAME;
const extensionFolderPath = `scripts/extensions/third-party/${MODULE_NAME}`;

let activeCat = 'main';

function loadSettings() {
    extension_settings[MODULE_NAME] = extension_settings[MODULE_NAME] || {};
    Engine.setSettings(Engine.normalizeSettings(extension_settings[MODULE_NAME]));
    extension_settings[MODULE_NAME] = Engine.getSettings();
}

function saveSettings() {
    extension_settings[MODULE_NAME] = Engine.getSettings();
    if (typeof saveSettingsDebounced === 'function') saveSettingsDebounced();
}

function refreshPreview() {
    const preview = document.getElementById('sct-preview');
    if (!preview) return;
    Engine.applyToRoot(preview);
}

let previewRafId = null;
function schedulePreview() {
    if (previewRafId) cancelAnimationFrame(previewRafId);
    previewRafId = requestAnimationFrame(() => { previewRafId = null; refreshPreview(); });
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
        const picker = createColorPicker(hex, 'sct-gradient-stop');
        picker.wrap.dataset.cat = catKey;
        picker.wrap.dataset.idx = idx;
        const hexInput = document.createElement('input');
        hexInput.type = 'text';
        hexInput.className = 'sct-hex sct-stop-hex';
        hexInput.dataset.cat = catKey;
        hexInput.dataset.idx = idx;
        hexInput.value = hex;
        hexInput.maxLength = 7;
        hexInput.spellcheck = false;
        hexInput.autocomplete = 'off';
        bindColorPair(picker, hexInput, (hexVal) => {
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
        row.append(picker.wrap, hexInput, remove, picker.panel);
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

function normalizeHex(raw) {
    const m = HEX_RE.exec(String(raw || '').trim());
    if (!m) return null;
    let hex = '#' + m[1];
    if (hex.length === 4) hex = '#' + [...hex.slice(1)].map((c) => c + c).join('');
    return hex.toLowerCase();
}

function clamp255(n) { return Math.min(255, Math.max(0, Math.round(Number(n) || 0))); }
function clamp01(n) { return Math.min(1, Math.max(0, Number(n) || 0)); }

function hexToRgbLocal(hex) {
    const norm = normalizeHex(hex);
    if (!norm) return null;
    const n = parseInt(norm.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r, g, b) {
    const c = (v) => clamp255(v).toString(16).padStart(2, '0');
    return `#${c(r)}${c(g)}${c(b)}`;
}

function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
        if (max === r) h = ((g - b) / d) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h *= 60;
        if (h < 0) h += 360;
    }
    const s = max === 0 ? 0 : d / max;
    return { h, s, v: max };
}

function hsvToRgb(h, s, v) {
    h = ((h % 360) + 360) % 360;
    const c = v * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function createColorPicker(hex, className) {
    const wrap = document.createElement('div');
    wrap.className = `sct-cp ${className || ''}`;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sct-cp-button';
    button.title = '点击展开 / 收起调色盘';
    wrap.append(button);
    const panel = document.createElement('div');
    panel.className = 'sct-cp-panel';
    panel.hidden = true;
    panel.innerHTML = `
        <div class="sct-cp-sv" data-part="sv">
            <div class="sct-cp-sv-white"></div>
            <div class="sct-cp-sv-black"></div>
            <div class="sct-cp-sv-handler"></div>
        </div>
        <div class="sct-cp-hue" data-part="hue">
            <div class="sct-cp-hue-handler"></div>
        </div>
        <div class="sct-cp-fields">
            <label class="sct-cp-field"><span>R</span><input type="number" min="0" max="255" data-chan="r" /></label>
            <label class="sct-cp-field"><span>G</span><input type="number" min="0" max="255" data-chan="g" /></label>
            <label class="sct-cp-field"><span>B</span><input type="number" min="0" max="255" data-chan="b" /></label>
        </div>`;
    panel._wrap = wrap;
    const sv = panel.querySelector('[data-part="sv"]');
    const svHandler = panel.querySelector('.sct-cp-sv-handler');
    const hue = panel.querySelector('[data-part="hue"]');
    const hueHandler = panel.querySelector('.sct-cp-hue-handler');
    const chanInputs = [...panel.querySelectorAll('input[data-chan]')];
    let hsv = { h: 0, s: 1, v: 1 };
    let currentHex = '#888888';
    let changeHandler = null;
    function emit() { if (typeof changeHandler === 'function') changeHandler(currentHex); }
    function currentRgb() { return hsvToRgb(hsv.h, hsv.s, hsv.v); }
    function refreshUi() {
        const [r, g, b] = currentRgb();
        currentHex = rgbToHex(r, g, b);
        button.style.backgroundColor = currentHex;
        const base = hsvToRgb(hsv.h, 1, 1);
        sv.style.backgroundColor = `rgb(${base[0]}, ${base[1]}, ${base[2]})`;
        svHandler.style.left = `${hsv.s * 100}%`;
        svHandler.style.top = `${(1 - hsv.v) * 100}%`;
        hueHandler.style.left = `${(hsv.h / 360) * 100}%`;
        const chanMap = { r, g, b };
        chanInputs.forEach((inp) => { if (document.activeElement === inp) return; inp.value = chanMap[inp.dataset.chan]; });
    }
    function setColor(hexVal) {
        const rgb = hexToRgbLocal(hexVal);
        if (!rgb) return;
        hsv = rgbToHsv(rgb[0], rgb[1], rgb[2]);
        refreshUi();
    }
    function setFromRgb(r, g, b) { hsv = rgbToHsv(clamp255(r), clamp255(g), clamp255(b)); refreshUi(); emit(); }
    function bindDrag(zone, onPoint) {
        let active = false;
        const move = (ev) => { if (!active) return; ev.preventDefault(); onPoint(ev); };
        const up = () => {
            active = false;
            window.removeEventListener('mousemove', move);
            window.removeEventListener('touchmove', move);
            window.removeEventListener('mouseup', up);
            window.removeEventListener('touchend', up);
        };
        zone.addEventListener('mousedown', (ev) => {
            active = true; onPoint(ev);
            window.addEventListener('mousemove', move);
            window.addEventListener('mouseup', up);
            ev.preventDefault();
        });
        zone.addEventListener('touchstart', (ev) => {
            active = true; onPoint(ev);
            window.addEventListener('touchmove', move, { passive: false });
            window.addEventListener('touchend', up);
            ev.preventDefault();
        }, { passive: false });
    }
    bindDrag(sv, (ev) => {
        const rect = sv.getBoundingClientRect();
        const x = ev.touches ? ev.touches[0].clientX : ev.clientX;
        const y = ev.touches ? ev.touches[0].clientY : ev.clientY;
        hsv.s = clamp01((x - rect.left) / rect.width);
        hsv.v = 1 - clamp01((y - rect.top) / rect.height);
        refreshUi(); emit();
    });
    bindDrag(hue, (ev) => {
        const rect = hue.getBoundingClientRect();
        const x = ev.touches ? ev.touches[0].clientX : ev.clientX;
        hsv.h = clamp01((x - rect.left) / rect.width) * 360;
        refreshUi(); emit();
    });
    chanInputs.forEach((inp) => {
        const chan = inp.dataset.chan;
        inp.addEventListener('input', () => {
            const n = Number.parseInt(inp.value, 10);
            if (!Number.isFinite(n) || n < 0 || n > 255) return;
            const [r, g, b] = currentRgb();
            const rgb = [r, g, b];
            rgb[chan === 'r' ? 0 : chan === 'g' ? 1 : 2] = n;
            setFromRgb(rgb[0], rgb[1], rgb[2]);
        });
        inp.addEventListener('blur', () => {
            const [r, g, b] = currentRgb();
            inp.value = chan === 'r' ? r : chan === 'g' ? g : b;
        });
    });
    const close = () => { panel.hidden = true; wrap.classList.remove('open'); };
    const toggle = () => { panel.hidden = !panel.hidden; wrap.classList.toggle('open', !panel.hidden); };
    button.addEventListener('click', toggle);
    setColor(hex);
    return { wrap, button, panel, setColor, getHex: () => currentHex, onChange: (fn) => { changeHandler = fn; }, close, toggle };
}

function bindColorPair(picker, hexInput, applyHex, getCurrentHex) {
    if (!picker || !hexInput) return;
    let applyTimer = null;
    const scheduleApply = (hexVal) => { if (applyTimer) clearTimeout(applyTimer); applyTimer = setTimeout(() => applyHex(hexVal), 200); };
    picker.onChange((hexVal) => {
        if (document.activeElement !== hexInput) { hexInput.value = hexVal; hexInput.classList.remove('invalid'); }
        scheduleApply(hexVal);
    });
    hexInput.addEventListener('input', () => {
        const norm = normalizeHex(hexInput.value);
        if (norm) { hexInput.classList.remove('invalid'); picker.setColor(norm); scheduleApply(norm); }
        else hexInput.classList.add('invalid');
    });
    hexInput.addEventListener('blur', () => {
        if (applyTimer) { clearTimeout(applyTimer); applyTimer = null; }
        const norm = normalizeHex(hexInput.value);
        if (norm) { hexInput.value = norm; picker.setColor(norm); applyHex(norm); }
        else {
            const current = normalizeHex(getCurrentHex());
            hexInput.value = current || getCurrentHex();
            if (current) picker.setColor(current);
            hexInput.classList.remove('invalid');
        }
    });
}

function showRowsByMode(panel, cfg, catKey) {
    panel.querySelector('.sct-solid-row').style.display = cfg.mode === 'solid' ? 'flex' : 'none';
    panel.querySelector('.sct-gradient-row').style.display = cfg.mode === 'gradient' ? 'flex' : 'none';
    if (cfg.mode === 'gradient') {
        panel.querySelector('.sct-cycle-length-row').style.display = cfg.cycle === 'length' ? 'flex' : 'none';
        const angleRow = panel.querySelector('.sct-angle-row');
        if (angleRow) angleRow.style.display = 'flex';
    }
}

function renderPanel() {
    const list = document.getElementById('sct-category-list');
    if (!list) return;
    list.querySelectorAll('.sct-tab').forEach((tab) => { tab.classList.toggle('sct-active', tab.dataset.cat === activeCat); });
    const catKey = activeCat;
    const cfg = Engine.getSettings().categories[catKey];
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
    const solidOk = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(cfg.solid);
    const solidHex = solidOk ? cfg.solid.toLowerCase() : '#888888';
    const solidPicker = createColorPicker(solidHex, 'sct-solid');
    panel.querySelector('.sct-solid-slot').replaceChildren(solidPicker.wrap);
    panel.querySelector('.sct-solid-hex').value = solidHex;
    panel.querySelector('.sct-solid-row').append(solidPicker.panel);
    bindColorPair(solidPicker, panel.querySelector('.sct-solid-hex'), (hexVal) => { cfg.solid = hexVal; saveSettings(); refreshAll(); }, () => cfg.solid);
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
        tab.addEventListener('click', () => { activeCat = catKey; renderPanel(); });
        tabsBox.append(tab);
    });
    renderPanel();
}

function refreshAll() {
    Engine.clearSignatures(document);
    Engine.processAll(document);
    refreshPreview();
}

function setAngle(catKey, rawValue, fullRepaint) {
    const cfg = Engine.getSettings().categories[catKey];
    cfg.angle = Engine.normalizeAngle(rawValue);
    saveSettings();
    const panel = document.querySelector(`.sct-angle-row[data-cat="${catKey}"]`);
    if (panel) {
        panel.querySelector('.sct-angle').value = cfg.angle;
        panel.querySelector('.sct-angle-deg').textContent = `${cfg.angle}°`;
    }
    updateGradientStrip(catKey);
    if (fullRepaint) refreshAll();
    else schedulePreview();
}

function bindUI() {
    const enabledBox = document.getElementById('sct-enabled');
    if (enabledBox) {
        enabledBox.checked = Engine.getSettings().enabled;
        enabledBox.addEventListener('change', () => { Engine.getSettings().enabled = enabledBox.checked; saveSettings(); refreshAll(); });
    }
    const list = document.getElementById('sct-category-list');
    list.addEventListener('mousedown', (ev) => {
        list.querySelectorAll('.sct-cp-panel:not([hidden])').forEach((panel) => {
            if (!panel.contains(ev.target)) { panel.hidden = true; panel._wrap && panel._wrap.classList.remove('open'); }
        });
    });
    list.addEventListener('change', (ev) => {
        if (ev.target.classList.contains('sct-mode')) {
            const catKey = ev.target.dataset.cat;
            Engine.getSettings().categories[catKey].mode = ev.target.value;
            saveSettings(); renderPanel(); refreshAll(); return;
        }
        if (ev.target.classList.contains('sct-cycle')) {
            const catKey = ev.target.dataset.cat;
            Engine.getSettings().categories[catKey].cycle = ev.target.value;
            saveSettings(); renderPanel(); refreshAll(); return;
        }
        if (ev.target.classList.contains('sct-angle')) { setAngle(ev.target.dataset.cat, ev.target.value, true); return; }
        if (ev.target.classList.contains('sct-cycle-length')) { refreshAll(); }
    });
    list.addEventListener('input', (ev) => {
        if (ev.target.classList.contains('sct-angle')) { setAngle(ev.target.dataset.cat, ev.target.value, false); return; }
        if (ev.target.classList.contains('sct-cycle-length')) {
            const catKey = ev.target.dataset.cat;
            const cfg = Engine.getSettings().categories[catKey];
            const n = Number.parseInt(ev.target.value, 10);
            cfg.cycleLength = Number.isFinite(n) && n >= 2 && n <= 999 ? n : 2;
            saveSettings(); schedulePreview();
        }
    });
    list.addEventListener('click', (ev) => {
        const addBtn = ev.target.closest('.sct-add-stop');
        const removeBtn = ev.target.closest('.sct-remove-stop');
        if (addBtn) {
            const catKey = addBtn.dataset.cat;
            const cfg = Engine.getSettings().categories[catKey];
            if (cfg.gradient.length >= 4) return;
            cfg.gradient.push(cfg.gradient[cfg.gradient.length - 1]);
            saveSettings(); renderStopPickers(catKey); refreshAll(); return;
        }
        if (removeBtn && !removeBtn.classList.contains('disabled')) {
            const catKey = removeBtn.dataset.cat;
            const cfg = Engine.getSettings().categories[catKey];
            if (cfg.gradient.length <= 2) return;
            cfg.gradient.splice(Number(removeBtn.dataset.idx), 1);
            saveSettings(); renderStopPickers(catKey); refreshAll();
        }
    });
    document.getElementById('sct-apply')?.addEventListener('click', () => {
        Engine.clearSignatures(document);
        Engine.processAll(document);
        if (typeof toastr !== 'undefined') toastr.success('多彩文本已应用到当前聊天');
    });
    document.getElementById('sct-reset')?.addEventListener('click', () => {
        Engine.resetSettings(); saveSettings(); renderPanel();
        if (enabledBox) enabledBox.checked = Engine.getSettings().enabled;
        refreshAll();
        if (typeof toastr !== 'undefined') toastr.info('已恢复默认配色（跟随主题）');
    });
}

let observer = null;
let rafId = null;
let endTimers = [];

function scheduleProcess() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
        rafId = null;
        if (observer) observer.disconnect();
        try { Engine.processAll(document); }
        finally {
            const chatEl = document.getElementById('chat');
            if (observer && chatEl) observer.observe(chatEl, { childList: true, subtree: true });
        }
    });
}

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
    if (event_types && event_types.GENERATION_ENDED) {
        eventSource.on(event_types.GENERATION_ENDED, () => { scheduleProcess(); scheduleLateRepaint(); });
    }
    const chatEl = document.getElementById('chat');
    if (chatEl && !observer) {
        observer = new MutationObserver(() => scheduleProcess());
        observer.observe(chatEl, { childList: true, subtree: true });
    }
}

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
                        <p><q>"这是双引号内的对话内容。"</q></p>
                    </div>
                </div>
                <div class="sct-actions">
                    <button type="button" class="menu_button" id="sct-apply">应用到当前聊天</button>
                    <button type="button" class="menu_button" id="sct-reset">恢复默认颜色</button>
                </div>
                <div class="sct-note">渐变支持段落 / 句子循环（主要文本按段落，下划线 / 引用按句子；斜体句子逐字符按角度走向取色、笔画完整不被裁）或字符长度（每 N 个字一个循环，2–999 可调）；选择"跟随酒馆主题"时完全使用酒馆当前主题配色。</div>
            </div>
        </div>
    </div>`;
}

jQuery(async () => {
    try {
        loadSettings();
        let settingsHtml = '';
        try { settingsHtml = await $.get(`${extensionFolderPath}/settings.html`); }
        catch (err) { console.warn('[Colorful Text] 读取 settings.html 失败，使用内联面板', err); settingsHtml = buildFallbackPanelHtml(); }
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
