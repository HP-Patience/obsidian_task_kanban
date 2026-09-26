const { Plugin, Modal, Notice } = require('obsidian');

// --- 1. DEFINE 15 RAW SVGS ---
const ICONS = {
    title: `<svg viewBox="0 0 24 24"><path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h10v2H4z"/></svg>`,
    emoji: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`,
    dateSingle: `<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
    dateMulti: `<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h8M8 18h4"/></svg>`,
    timeSingle: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    timeMulti: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/><path d="M19 19l3 3"/></svg>`,
    alarm: `<svg viewBox="0 0 24 24"><path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 13A17.89 17.89 0 0 1 18 8"/><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M18 8a6 6 0 0 0-12 0"/></svg>`,
    repeat: `<svg viewBox="0 0 24 24"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`,
    tag: `<svg viewBox="0 0 24 24"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`,
    note: `<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
    submit: `<svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    clipboard: `<svg viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>`,
    error: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    startFlag: `<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
    endFlag: `<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12"/></svg>`
};

class CEventPlannerExtraPlugin extends Plugin {
    async onload() {
        console.log('Loading CEvent-Planner-Extra (Material Edition, No-Save Mode)...');

        const style = document.createElement('style');
        style.id = 'cevent-extra-styles';
        style.textContent = `
            /* Core Modal Setup */
            .cevent-extra-modal * { box-sizing: border-box; }
            .cevent-extra-modal { display: flex; flex-direction: column; height: 85vh; max-height: 800px; width: 90vw; max-width: 650px; overflow: hidden; padding: 0; background-color: var(--background-primary); border-radius: 8px;}
            
            /* Header */
            .cevent-extra-header { padding: 24px 24px 16px 24px; border-bottom: 1px solid var(--background-modifier-border); background: var(--background-secondary); z-index: 10; display: flex; align-items: center; gap: 12px;}
            .cevent-extra-header-icon { width: 24px; height: 24px; color: var(--interactive-accent); display: flex; align-items: center; }
            .cevent-extra-header-icon svg { width: 100%; height: 100%; stroke: currentColor; stroke-width: 2; fill: none; stroke-linecap: round; stroke-linejoin: round; }
            .cevent-extra-header h2 { margin: 0; font-size: 1.4em; font-weight: 500; color: var(--text-normal); letter-spacing: 0.15px; }
            
            /* Perfect Scroll Content Area */
            .cevent-extra-content-wrapper { flex: 1 1 auto; overflow-y: overlay; overflow-x: hidden; padding: 24px; scroll-behavior: smooth; }
            .cevent-extra-content-wrapper::-webkit-scrollbar { width: 10px; }
            .cevent-extra-content-wrapper::-webkit-scrollbar-track { background: transparent; }
            .cevent-extra-content-wrapper::-webkit-scrollbar-thumb { background-color: var(--background-modifier-border); border-radius: 10px; border: 2px solid var(--background-primary); }
            .cevent-extra-content-wrapper::-webkit-scrollbar-thumb:hover { background-color: var(--text-muted); }
            
            /* Organized UI Cards */
            .cevent-extra-card { background: var(--background-secondary-alt); border: 1px solid var(--background-modifier-border); border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.03); }
            .cevent-extra-section-title { font-size: 0.9em; font-weight: 600; color: var(--interactive-accent); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
            
            /* Form Layout */
            .cevent-extra-container { display: flex; flex-direction: column; gap: 16px; }
            .cevent-extra-row { display: flex; gap: 16px; flex-wrap: wrap; }
            .cevent-extra-row .cevent-extra-group { flex: 1; min-width: 200px; }
            
            /* Inputs & SVG Integrations */
            .cevent-extra-group { display: flex; flex-direction: column; gap: 6px; position: relative; width: 100%; }
            .cevent-extra-group label { font-size: 0.85em; font-weight: 500; color: var(--text-muted); margin-left: 4px; }
            
            .cevent-extra-input-wrapper { position: relative; display: flex; align-items: center; width: 100%; }
            .cevent-extra-input-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); display: flex; align-items: center; justify-content: center; color: var(--text-muted); width: 18px; height: 18px; pointer-events: none; }
            .cevent-extra-input-icon svg { width: 100%; height: 100%; stroke: currentColor; stroke-width: 2; fill: none; stroke-linecap: round; stroke-linejoin: round; }
            .cevent-extra-textarea-wrapper .cevent-extra-input-icon { top: 16px; transform: none; }

            .cevent-extra-input, .cevent-extra-select, .cevent-extra-textarea { 
                width: 100%; padding: 10px 16px 10px 40px; border-radius: 6px; 
                border: 1px solid var(--background-modifier-border); background-color: var(--background-primary); 
                color: var(--text-normal); font-family: inherit; font-size: 14px; 
                transition: border-color 0.2s, box-shadow 0.2s; 
            }
            .cevent-extra-select { appearance: none; cursor: pointer; }
            .cevent-extra-textarea { resize: vertical; min-height: 80px; }
            
            .cevent-extra-input:hover, .cevent-extra-select:hover, .cevent-extra-textarea:hover { border-color: var(--text-muted); }
            .cevent-extra-input:focus, .cevent-extra-select:focus, .cevent-extra-textarea:focus { border-color: var(--interactive-accent); outline: none; box-shadow: 0 0 0 2px rgba(var(--interactive-accent-rgb), 0.2); }
            .cevent-extra-error-state { border-color: var(--text-error) !important; box-shadow: inset 0 0 0 1px var(--text-error); }
            .cevent-extra-error-text { color: var(--text-error); font-size: 0.8em; margin-top: 2px; margin-left: 4px; display: none; font-weight: 500; }
            
            /* Material Footer & Button */
            .cevent-extra-footer { padding: 16px 24px; border-top: 1px solid var(--background-modifier-border); background: var(--background-secondary); display: flex; justify-content: flex-end; z-index: 10; }
            .cevent-extra-submit { 
                display: flex; align-items: center; gap: 8px; position: relative; overflow: hidden; 
                background-color: var(--interactive-accent); color: var(--text-on-accent); 
                border: none; padding: 10px 24px; border-radius: 6px; cursor: pointer; 
                font-weight: 500; font-size: 14px; text-transform: uppercase; 
                box-shadow: 0 2px 4px rgba(0,0,0,0.1); transition: background-color 0.2s, transform 0.1s; 
            }
            .cevent-extra-submit svg { width: 18px; height: 18px; stroke: currentColor; stroke-width: 2; fill: none; stroke-linecap: round; stroke-linejoin: round; }
            .cevent-extra-submit:hover { background-color: var(--interactive-accent-hover); box-shadow: 0 4px 8px rgba(0,0,0,0.15); transform: translateY(-1px); }
            .cevent-extra-submit:active { transform: translateY(0); }
        `;
        document.head.appendChild(style);

        this.addRibbonIcon('clipboard-paste', 'Create CEvent ', () => {
            new EventPlannerModal(this.app, this).open();
        });

        this.addCommand({
            id: 'open-cevent-extra-form',
            name: 'CEvent Planner Extra',
            callback: () => {
                new EventPlannerModal(this.app, this).open();
            }
        });
    }

    onunload() {
        const style = document.getElementById('cevent-extra-styles');
        if (style) style.remove();
    }
}

class EventPlannerModal extends Modal {
    constructor(app, plugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        this.modalEl.querySelector('.modal-content').style.padding = '0';
        this.modalEl.querySelector('.modal-content').classList.add('cevent-extra-modal');
        this.contentEl.empty();
        
        // Header
        const header = this.contentEl.createDiv({ cls: 'cevent-extra-header' });
        const headerIcon = header.createDiv({ cls: 'cevent-extra-header-icon' });
        headerIcon.innerHTML = ICONS.clipboard;
        header.createEl('h2', { text: 'CEvent Planner Extra' });

        // Scrollable Body
        const scrollWrapper = this.contentEl.createDiv({ cls: 'cevent-extra-content-wrapper' });
        this.renderCreateForm(scrollWrapper);
    }

    onClose() {
        this.contentEl.empty();
    }

    createField(parent, labelText, type, svgStr, placeholder = '', options = []) {
        const group = parent.createDiv({ cls: 'cevent-extra-group' });
        group.createEl('label', { text: labelText });
        
        const wrapperCls = type === 'textarea' ? 'cevent-extra-input-wrapper cevent-extra-textarea-wrapper' : 'cevent-extra-input-wrapper';
        const inputWrapper = group.createDiv({ cls: wrapperCls });
        
        const iconEl = inputWrapper.createDiv({ cls: 'cevent-extra-input-icon' });
        iconEl.innerHTML = svgStr;

        let input;
        if (type === 'textarea') {
            input = inputWrapper.createEl('textarea', { cls: 'cevent-extra-textarea', placeholder });
        } else if (type === 'select') {
            input = inputWrapper.createEl('select', { cls: 'cevent-extra-select' });
            options.forEach(opt => input.createEl('option', { value: opt.value, text: opt.text }));
        } else {
            input = inputWrapper.createEl('input', { cls: 'cevent-extra-input', type, placeholder });
        }

        const error = group.createDiv({ cls: 'cevent-extra-error-text' });
        return { group, input, error };
    }

    renderCreateForm(parentEl) {
        const formContainer = parentEl.createDiv({ cls: 'cevent-extra-container' });
        // --- CARD 0 INSTRUCTIONS ---
        const basicInfoCard=formContainer.createDiv({ cls: 'cevent-extra-card' });
        basicInfoCard.createDiv({ cls: 'cevent-extra-section-title', text: 'Instruction' });
        basicInfoCard.createDiv({ cls: '', text: 'This plugin is UI tool for CEvent-Planner. With it you can make easily Event. First Fill up necessary input and others then click Generate Button Event will copy.Now can paste This event any where is File of this vault.' });
        // --- CARD 1: GENERAL INFO ---
        const cardGeneral = formContainer.createDiv({ cls: 'cevent-extra-card' });
        cardGeneral.createDiv({ cls: 'cevent-extra-section-title', text: 'General Information' });
        
        const row1 = cardGeneral.createDiv({ cls: 'cevent-extra-row' });
        const titleField = this.createField(row1, 'Event Title *', 'text',null, 'e.g., Team Sync Meeting');
        titleField.error.textContent = 'Title is required.';
        
        const iconField = this.createField(row1, 'Icon (Emoji)', 'text', null, 'e.g. 🚀');

        // --- CARD 2: DATE & TIME ---
        const cardDateTime = formContainer.createDiv({ cls: 'cevent-extra-card' });
        cardDateTime.createDiv({ cls: 'cevent-extra-section-title', text: 'Date & Time Settings' });
        
        // Date Setup
        const rowDateMode = cardDateTime.createDiv({ cls: 'cevent-extra-row' });
        const dateSelectField = this.createField(rowDateMode, 'Date Format', 'select', ICONS.dateSingle, '', [
            { value: 'single', text: 'Single Day' },
            { value: 'multiple', text: 'Multiple Days (Range)' }
        ]);
        
        const dateBlock = cardDateTime.createDiv({ cls: 'cevent-extra-container', attr: { style: 'margin-top: 10px;' } });
        const dateErrorMsg = dateBlock.createDiv({ cls: 'cevent-extra-error-text', text: 'Valid date selection is required.' });
        
        const singleDateField = this.createField(dateBlock, 'Select Date', 'date', ICONS.dateSingle);
        
        const multiDateRow = dateBlock.createDiv({ cls: 'cevent-extra-row' });
        const startDateField = this.createField(multiDateRow, 'Start Date', 'date', ICONS.startFlag);
        const endDateField = this.createField(multiDateRow, 'End Date', 'date', ICONS.endFlag);

        dateSelectField.input.addEventListener('change', () => {
            dateErrorMsg.style.display = 'none';
            singleDateField.input.classList.remove('cevent-extra-error-state');
            startDateField.input.classList.remove('cevent-extra-error-state');
            endDateField.input.classList.remove('cevent-extra-error-state');
            
            if (dateSelectField.input.value === 'single') {
                singleDateField.group.style.display = 'flex';
                multiDateRow.style.display = 'none';
                dateSelectField.group.querySelector('.cevent-extra-input-icon').innerHTML = ICONS.dateSingle;
            } else {
                singleDateField.group.style.display = 'none';
                multiDateRow.style.display = 'flex';
                dateSelectField.group.querySelector('.cevent-extra-input-icon').innerHTML = ICONS.dateMulti;
            }
        });
        dateSelectField.input.dispatchEvent(new Event('change')); // Init

        // Time Setup
        const rowTimeMode = cardDateTime.createDiv({ cls: 'cevent-extra-row', attr: { style: 'margin-top: 16px;' } });
        const timeSelectField = this.createField(rowTimeMode, 'Time Format', 'select', ICONS.timeSingle, '', [
            { value: 'single', text: 'Single Time' },
            { value: 'multiple', text: 'Multiple Times (Range)' }
        ]);

        const timeBlock = cardDateTime.createDiv({ cls: 'cevent-extra-container', attr: { style: 'margin-top: 10px;' } });
        
        const singleTimeField = this.createField(timeBlock, 'Select Time', 'time', ICONS.timeSingle);
        
        const multiTimeRow = timeBlock.createDiv({ cls: 'cevent-extra-row' });
        const startTimeField = this.createField(multiTimeRow, 'Start Time', 'time', ICONS.startFlag);
        const endTimeField = this.createField(multiTimeRow, 'End Time', 'time', ICONS.endFlag);

        timeSelectField.input.addEventListener('change', () => {
            if (timeSelectField.input.value === 'single') {
                singleTimeField.group.style.display = 'flex';
                multiTimeRow.style.display = 'none';
                timeSelectField.group.querySelector('.cevent-extra-input-icon').innerHTML = ICONS.timeSingle;
            } else {
                singleTimeField.group.style.display = 'none';
                multiTimeRow.style.display = 'flex';
                timeSelectField.group.querySelector('.cevent-extra-input-icon').innerHTML = ICONS.timeMulti;
            }
        });
        timeSelectField.input.dispatchEvent(new Event('change')); // Init


        // --- CARD 3: META & NOTES ---
        const cardMeta = formContainer.createDiv({ cls: 'cevent-extra-card' });
        cardMeta.createDiv({ cls: 'cevent-extra-section-title', text: 'Details & Notifications' });

        const rowMeta = cardMeta.createDiv({ cls: 'cevent-extra-row' });
        const alarmField = this.createField(rowMeta, 'Alarm Time', 'time', ICONS.alarm);
        const repeatField = this.createField(rowMeta, 'Recurrence', 'select', ICONS.repeat, '', [
            { value: 'none', text: 'None' },
            { value: 'daily', text: 'Daily' },
            { value: 'weekly', text: 'Weekly' },
            { value: 'monthly', text: 'Monthly' },
            { value: 'yearly', text: 'Yearly' }
        ]);

        const tagField = this.createField(cardMeta, 'Tags (Space Separated)', 'text', null, '#planning #work');
        const descField = this.createField(cardMeta, 'Description / Notes', 'textarea', ICONS.note, 'Add additional context...');

        // --- FOOTER & BUTTON ---
        const footer = this.contentEl.createDiv({ cls: 'cevent-extra-footer' });
        const submitBtn = footer.createEl('button', { cls: 'cevent-extra-submit' });
        submitBtn.innerHTML = `${ICONS.submit} <span>Generate & Copy</span>`;

        // Extra Formatters
        const parseDateStr = (rawDate) => {
            if (!rawDate) return '';
            const [year, month, day] = rawDate.split('-');
            return `${day}-${month}-${year}`;
        };

        const parseTimeStr = (rawTime) => {
            if (!rawTime) return '';
            let [hours, minutes] = rawTime.split(':');
            hours = parseInt(hours, 10);
            const cycle = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12 || 12;
            return `${hours < 10 ? '0' + hours : hours}:${minutes} ${cycle}`;
        };

        // Execution Logic
        submitBtn.addEventListener('click', async () => {
            // Reset validation states
            titleField.error.style.display = 'none';
            titleField.input.classList.remove('cevent-extra-error-state');
            dateErrorMsg.style.display = 'none';
            singleDateField.input.classList.remove('cevent-extra-error-state');
            startDateField.input.classList.remove('cevent-extra-error-state');
            endDateField.input.classList.remove('cevent-extra-error-state');

            let isValid = true;

            const title = titleField.input.value.trim();
            if (!title) {
                titleField.error.style.display = 'block';
                titleField.input.classList.add('cevent-extra-error-state');
                isValid = false;
            }

            let finalDateStr = '';
            if (dateSelectField.input.value === 'single') {
                if (!singleDateField.input.value) {
                    singleDateField.input.classList.add('cevent-extra-error-state');
                    dateErrorMsg.style.display = 'block';
                    isValid = false;
                } else {
                    finalDateStr = parseDateStr(singleDateField.input.value);
                }
            } else {
                if (!startDateField.input.value || !endDateField.input.value) {
                    if(!startDateField.input.value) startDateField.input.classList.add('cevent-extra-error-state');
                    if(!endDateField.input.value) endDateField.input.classList.add('cevent-extra-error-state');
                    dateErrorMsg.style.display = 'block';
                    isValid = false;
                } else {
                    finalDateStr = `${parseDateStr(startDateField.input.value)} to ${parseDateStr(endDateField.input.value)}`;
                }
            }

            if (!isValid) {
                new Notice('Please resolve the highlighted errors.');
                // Scroll to top to see errors
                parentEl.scrollTop = 0;
                return;
            }

            // Gather Time
            let finalTimeStr = '';
            if (timeSelectField.input.value === 'single') {
                if (singleTimeField.input.value) finalTimeStr = parseTimeStr(singleTimeField.input.value);
            } else {
                const st = parseTimeStr(startTimeField.input.value);
                const et = parseTimeStr(endTimeField.input.value);
                if (st && et) finalTimeStr = `${st} to ${et}`;
                else if (st || et) finalTimeStr = st || et; 
            }

            let finalAlarmStr = alarmField.input.value ? parseTimeStr(alarmField.input.value) : '';
            const icon = iconField.input.value.trim();
            const rawTags = tagField.input.value.trim();
            const tagsString = rawTags ? rawTags.split(/\s+/).join(' ') : '';
            const description = descField.input.value.trim();
            const repeatVal = repeatField.input.value;

            // Construct Markdown (No ID generation anymore)
            let textBlock = `- [ ] ${title}\n`;
            textBlock += `\t- Date ${finalDateStr}\n`;
            if (finalTimeStr) textBlock += `\t- Time ${finalTimeStr}\n`;
            if (finalAlarmStr) textBlock += `\t- Alarm ${finalAlarmStr}\n`;
            if (icon) textBlock += `\t- Icon ${icon}\n`;
            if (tagsString) textBlock += `\t- Tag ${tagsString}\n`;
            if (repeatVal !== 'none') textBlock += `\t- Repeat ${repeatVal}\n`;
            if (description) {
                textBlock += `\t>[!NOTE]\n`;
                description.split('\n').forEach(l => { textBlock += `\t> ${l}\n`; });
            }

            try {
                // Copy to Clipboard (NO FILE SAVE)
                await navigator.clipboard.writeText(textBlock);
                new Notice('✅ Event Log Copied to Clipboard!');
                
                // Close modal immediately after successful copy
                this.close();

            } catch (err) {
                console.error(err);
                new Notice('Error copying to clipboard.');
            }
        });
    }
}

module.exports = CEventPlannerExtraPlugin;
/* nosourcemap */
/* nosourcemap */