import { el } from './main-state.js';

export function showTablePicker() {
    return new Promise((resolve) => {
        let rows = 0;
        let cols = 0;
        const maxRows = 10;
        const maxCols = 10;

        el.modalTitle.textContent = "Insert Table";
        el.modalMessage.textContent = "Select table size (Rows x Columns).";
        el.modalInputGroup.classList.add('hidden');
        el.modalOptionGrid.classList.add('hidden');
        el.modalEmojiContainer.classList.add('hidden');
        el.modalTableContainer.classList.remove('hidden');
        el.modalOverlay.classList.remove('hidden');

        const grid = el.modalTableGrid;
        grid.innerHTML = '';
        for (let r = 1; r <= maxRows; r++) {
            for (let c = 1; c <= maxCols; c++) {
                const cell = document.createElement('div');
                cell.className = 'table-grid-cell';
                cell.dataset.row = r;
                cell.dataset.col = c;
                grid.appendChild(cell);
            }
        }

        const updateHighlight = (r, c) => {
            rows = r;
            cols = c;
            const cells = grid.querySelectorAll('.table-grid-cell');
            cells.forEach(cell => {
                const cr = parseInt(cell.dataset.row);
                const cc = parseInt(cell.dataset.col);
                cell.classList.toggle('highlighted', cr <= rows && cc <= cols);
            });
            el.modalTableInfo.textContent = `${rows} x ${cols} Table`;
        };

        const handleMouseOver = (e) => {
            const cell = e.target.closest('.table-grid-cell');
            if (cell) {
                updateHighlight(parseInt(cell.dataset.row), parseInt(cell.dataset.col));
            }
        };

        const handleClick = (e) => {
            if (rows > 0 && cols > 0) {
                cleanup();
                resolve({ rows, cols });
            }
        };

        const handleKeyDown = (e) => {
            if (e.key === 'ArrowRight') {
                updateHighlight(rows, Math.min(cols + 1, maxCols));
                e.preventDefault();
            } else if (e.key === 'ArrowLeft') {
                updateHighlight(rows, Math.max(cols - 1, 1));
                e.preventDefault();
            } else if (e.key === 'ArrowDown') {
                updateHighlight(Math.min(rows + 1, maxRows), cols);
                e.preventDefault();
            } else if (e.key === 'ArrowUp') {
                updateHighlight(Math.max(rows - 1, 1), cols);
                e.preventDefault();
            } else if (e.key === 'Enter' || e.key === ' ') {
                if (rows > 0 && cols > 0) {
                    cleanup();
                    resolve({ rows, cols });
                }
                e.preventDefault();
            } else if (e.key === 'Escape') {
                handleCancelClick();
                e.preventDefault();
            }
        };

        const handleCancelClick = () => {
            cleanup();
            resolve(null);
        };

        const cleanup = () => {
            el.modalOverlay.classList.add('hidden');
            el.modalTableContainer.classList.add('hidden');
            grid.removeEventListener('mouseover', handleMouseOver);
            grid.removeEventListener('click', handleClick);
            el.modalBtnCancel.removeEventListener('click', handleCancelClick);
            document.removeEventListener('keydown', handleKeyDown, true);
        };

        grid.addEventListener('mouseover', handleMouseOver);
        grid.addEventListener('click', handleClick);
        el.modalBtnCancel.addEventListener('click', handleCancelClick);
        document.addEventListener('keydown', handleKeyDown, true);

        updateHighlight(3, 3);
    });
}

export function showOptionGridPrompt(title, message, options, defaultValue = "") {
    return new Promise((resolve) => {
        const normalizedOptions = Array.isArray(options) ? options.filter(Boolean) : [];
        if (normalizedOptions.length === 0) {
            resolve(null);
            return;
        }

        let selectedIndex = Math.max(0, normalizedOptions.findIndex(option => option.value === defaultValue));

        const renderOptionCell = (option, index) => {
            const targetIndex = Math.max(0, Math.min(8, Number(option.previewIndex) || 4));
            const dots = Array.from({ length: 9 }, (_, dotIndex) => `
                <span class="modal-option-dot ${dotIndex === targetIndex ? 'is-target' : ''}"></span>
            `).join('');
            return `
                <button
                    type="button"
                    class="modal-option-cell ${index === selectedIndex ? 'active' : ''}"
                    data-option-index="${index}"
                    aria-label="${option.label}"
                >
                    <span class="modal-option-preview" aria-hidden="true">${dots}</span>
                </button>
            `;
        };

        const syncActiveState = () => {
            el.modalOptionGrid.querySelectorAll('.modal-option-cell').forEach((node, index) => {
                node.classList.toggle('active', index === selectedIndex);
            });
        };

        const moveSelection = (deltaRow, deltaCol) => {
            const row = Math.floor(selectedIndex / 3);
            const col = selectedIndex % 3;
            const nextRow = Math.max(0, Math.min(2, row + deltaRow));
            const nextCol = Math.max(0, Math.min(2, col + deltaCol));
            selectedIndex = nextRow * 3 + nextCol;
            syncActiveState();
        };

        const confirmSelection = () => {
            const selected = normalizedOptions[selectedIndex];
            cleanup();
            resolve(selected?.value ?? null);
        };

        const cancelSelection = () => {
            cleanup();
            resolve(null);
        };

        const handleGridClick = event => {
            const button = event.target.closest('.modal-option-cell');
            if (!button) return;
            selectedIndex = Number(button.dataset.optionIndex) || 0;
            confirmSelection();
        };

        const handleKey = event => {
            if (event.key === 'ArrowUp') {
                event.preventDefault();
                moveSelection(-1, 0);
                return;
            }
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                moveSelection(1, 0);
                return;
            }
            if (event.key === 'ArrowLeft') {
                event.preventDefault();
                moveSelection(0, -1);
                return;
            }
            if (event.key === 'ArrowRight') {
                event.preventDefault();
                moveSelection(0, 1);
                return;
            }
            if (event.key === 'Enter') {
                event.preventDefault();
                confirmSelection();
                return;
            }
            if (event.key === 'Escape') {
                event.preventDefault();
                cancelSelection();
            }
        };

        const cleanup = () => {
            el.modalOverlay.classList.add('hidden');
            el.modalOptionGrid.removeEventListener('click', handleGridClick);
            document.removeEventListener('keydown', handleKey, true);
            el.modalBtnOk.removeEventListener('click', confirmSelection);
            el.modalBtnCancel.removeEventListener('click', cancelSelection);
            el.modalBtnOk.classList.remove('hidden');
        };

        el.modalTitle.textContent = title;
        el.modalMessage.textContent = message;
        el.modalOptionGrid.innerHTML = normalizedOptions.map(renderOptionCell).join('');
        el.modalOverlay.classList.remove('hidden');
        el.modalInputGroup.classList.add('hidden');
        el.modalOptionGrid.classList.remove('hidden');
        el.modalEmojiContainer.classList.add('hidden');
        el.modalBtnOk.classList.remove('hidden');

        syncActiveState();

        el.modalOptionGrid.addEventListener('click', handleGridClick);
        document.addEventListener('keydown', handleKey, true);
        el.modalBtnOk.addEventListener('click', confirmSelection);
        el.modalBtnCancel.addEventListener('click', cancelSelection);
    });
}

const emojiData = [
    {
        name: "GitHub",
        emojis: ["👍", "👎", "😄", "🎉", "😕", "❤️", "🚀", "👀", "✅", "❌", "📝", "💡", "⚠️", "⭐", "✨"]
    },
    {
        name: "Smileys",
        emojis: [
            "😀", "😃", "😄", "😁", "😅", "🤣", "😂", "🙂", "🙃", "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😋", "😛", "😜", "🤪",
            "🤨", "🧐", "🤓", "😎", "🤩", "🥳", "😏", "😒", "😞", "😔", "😟", "😕", "🙁", "☹️", "😣", "😖", "😫", "😩", "🥺",
            "😢", "😭", "😤", "😠", "😡", "🤬", "🤯", "😳", "🥵", "🥶", "😱", "😨", "😰", "😥", "😓", "🤗", "🤔", "🤭", "🤫",
            "🤥", "😶", "😐", "😑", "😬", "🙄", "😯", "😦", "😧", "😮", "😲", "🥱", "😴", "🤤", "😪", "😵", "🤐", "🥴", "🤢",
            "🤮", "🤧", "😷", "🤒", "🤕"
        ]
    },
    {
        name: "People",
        emojis: [
            "👋", "🤚", "🖐️", "✋", "🖖", "👌", "🤌", "🤏", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆", "🖕", "👇", "☝️",
            "👍", "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "👐", "🤲", "🤝", "🙏", "✍️", "💅", "🤳", "💪", "🦾", "🦵", "🦿",
            "🦶", "👣", "👂", "🦻", "👃", "🧠", "🫀", "🫁", "🦷", "🦴", "👀", "👁️", "👅", "👄"
        ]
    },
    {
        name: "Animals",
        emojis: [
            "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐻‍❄️", "🐨", "🐯", "🦁", "🐮", "🐷", "🐽", "🐸", "🐵", "🙈", "🙉",
            "🙊", "🐒", "🐔", "🐧", "🐦", "🐤", "🐣", "🐥", "🦆", "🦅", "🦉", "🦇", "🐺", "🐗", "🐴", "🦄", "🐝", "🪱", "🐛",
            "🦋", "🐌", "🐞", "🐜", "🪰", "🪲", "🪳", "🦟", "🦗", "🕷️", "🕸️", "🦂", "🐢", "🐍", "🦎", "🦖", "🦕", "🐙", "🦑",
            "🦐", "🦞", "🦀", "🐡", "🐠", "🐟", "🐬", "🐳", "🐋", "🦈", "🐊", "🐅", "🐆", "🦓", "🦍", "🦧", "🐘", "🦛", "🦏",
            "🐪", "🐫", "🦒", "🦘", "🦬", "🐃", "🐂", "🐄", "🐎", "🐖", "🐏", "🐑", "🐐", "🦌", "🐕", "🐩", "🦮", "🐕‍🦺", "🐈",
            "🐈‍⬛", "🐓", "🦃", "🦚", "🦜", "🦢", "🦩", "🕊️", "🐇", "🦝", "🦨", "🦡", "🦦", "🦥", "🐁", "🐀", "🐿️", "🦔"
        ]
    },
    {
        name: "Food",
        emojis: [
            "🍏", "🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🫐", "🍈", "🍒", "🍑", "🥭", "🍍", "🥥", "🥝", "🍅", "🍆",
            "🥑", "🥦", "🥬", "🥒", "🌶️", "🫑", "🌽", "🥕", "🫒", "🧄", "🧅", "🥔", "🍠", "🥐", "🥯", "🍞", "🥖", "🥨", "🧀",
            "🥚", "🍳", "🧈", "🥞", "🧇", "🥓", "🥩", "🍗", "🍖", "🦴", "🌭", "🍔", "🍟", "🍕", "🫓", "🥪", "🥙", "🧆", "🌮",
            "🌯", "🫔", "🥗", "🥘", "🫕", "🥣", "🍝", "🍜", "🍲", "🍛", "🍣", "🍱", "🥟", "🦪", "🍤", "🍙", "🍚", "🍘", "🍥",
            "🥠", "🥮", "🍢", "🍡", "🍧", "🍨", "🍦", "🥧", "🧁", "🍰", "🎂", "🍮", "🍭", "🍬", "🍫", "🍿", "🍩", "🍪", "🌰",
            "🥜", "🍯", "🥛", "🍼", "☕", "🍵", "🧃", "🥤", "🧋", "🍶", "🍺", "🍻", "🥂", "🍷", "🥃", "🍸", "🍹", "🧉", "🍾",
            "🧊", "🥄", "🍴", "🍽️", "🥣", "🥡", "🥢", "🧂"
        ]
    },
    {
        name: "Devices",
        emojis: [
            "💻", "🖥️", "⌨️", "🖱️", "🖲️", "🖨️", "📱", "📲", "☎️", "📞", "📟", "📠",
            "🔋", "🪫", "🔌", "💡", "🔦", "🧮", "📷", "📸", "📹", "🎥", "📽️", "📺",
            "📻", "🎙️", "🎚️", "🎛️", "🎧", "🎤", "💾", "💿", "📀", "💽", "📼", "📡",
            "⌚", "⏰", "⏱️", "⏲️", "🧭", "🛰️", "🤖", "🦾", "🦿", "🎮", "🕹️", "👾",
            "⚙️", "🔧", "🔩", "🛠️", "🪛", "🔬", "🔭", "🧲"
        ]
    },
    {
        name: "Symbols",
        emojis: [
            "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟",
            "☮️", "✝️", "☪️", "🕉️", "☸️", "✡️", "🔯", "🕎", "☯️", "☦️", "🛐", "⛎", "♈", "♉", "♊", "♋", "♌", "♍", "♎",
            "♏", "♐", "♑", "♒", "♓", "🆔", "⚛️", "🉑", "☢️", "☣️", "📴", "📳", "🈶", "🈚", "🈸", "🈺", "🈷️", "✴️", "🆚",
            "💮", "🉐", "㊙️", "㊗️", "🈴", "🈵", "🈹", "🈲", "🅰️", "🅱️", "🆑", "🅾️", "🆘", "❌", "⭕", "🛑", "⛔", "📛", "🚫",
            "💯", "💢", "♨️", "🚷", "🚯", "🚳", "🚱", "🔞", "📵", "🚭", "❗", "❕", "❓", "❔", "‼️", "⁉️", "🔅", "🔆", "〽️",
            "⚠️", "🚸", "🔱", "⚜️", "🔰", "♻️", "✅", "🈯", "💹", "❇️", "✳️", "❎", "🌐", "💠", "Ⓜ️", "🌀", "💤", "🏧", "🚾",
            "♿", "🅿️", "🈳", "🈂️", "🛂", "🛃", "🛄", "🛅", "🚹", "🚺", "🚼", "⚧️", "🚻", "🚮", "🎦", "📶", "🈁", "🔣", "ℹ️",
            "🔤", "🔡", "🔠", "🆖", "🆗", "🆙", "🆒", "🆕", "🆓", "0️⃣", "1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣",
            "9️⃣", "🔟", "🔢", "#️⃣", "*️⃣", "⏏️", "▶️", "⏸️", "⏯️", "⏹️", "⏺️", "⏭️", "⏮️", "⏩", "⏪", "⏫", "⏬", "◀️", "🔼",
            "🔽", "➡️", "⬅️", "⬆️", "⬇️", "↗️", "↘️", "↙️", "↖️", "↕️", "↔️", "↪️", "↩️", "⤴️", "⤵️", "🔀", "🔁", "🔂", "🔄",
            "🔃", "🎵", "🎶", "➕", "➖", "➗", "✖️", "♾️", "💲", "💱", "™️", "©️", "®️", "🔚", "🔙", "🔛", "🔝", "🔜", "〰️",
            "➰", "➿", "✔️", "☑️", "🔘", "🔴", "🟠", "🟡", "🟢", "🔵", "🟣", "⚫", "⚪", "🟤", "🔺", "🔻", "🔸", "🔹", "🔶",
            "🔷", "🔳", "🔲", "▪️", "▫️", "◾", "◽", "◼️", "◻️", "🟥", "🟧", "🟨", "🟩", "🟦", "🟪", "⬛", "⬜", "🟫", "🔈",
            "🔇", "🔉", "🔊", "🔔", "🔕", "📣", "📢", "💬", "💭", "🗯️", "♠️", "♣️", "♥️", "♦️", "🃏", "🎴", "🀄"
        ]
    }
];

export function showEmojiPicker() {
    return new Promise((resolve) => {
        let currentCategoryIndex = 0;
        let selectedEmojiIndex = -1;

        el.modalTitle.textContent = "Select Emoji";
        el.modalMessage.textContent = "Browse categories and select an emoji to insert.";
        el.modalInputGroup.classList.add('hidden');
        el.modalOptionGrid.classList.add('hidden');
        el.modalEmojiContainer.classList.remove('hidden');
        el.modalEmojiGrid.classList.remove('hidden');
        el.modalOverlay.classList.remove('hidden');

        const renderCategories = () => {
            el.modalEmojiCategories.innerHTML = emojiData.map((cat, idx) => `
                <button class="emoji-category-btn ${idx === currentCategoryIndex ? 'active' : ''}" 
                        data-index="${idx}" tabindex="0">${cat.name}</button>
            `).join('');
        };

        const renderEmojis = () => {
            const emojis = emojiData[currentCategoryIndex].emojis;
            el.modalEmojiGrid.innerHTML = emojis.map((emoji, idx) => `
                <div class="emoji-item ${idx === selectedEmojiIndex ? 'selected' : ''}" 
                     data-emoji="${emoji}" data-index="${idx}" tabindex="0">${emoji}</div>
            `).join('');
        };

        const updateSelection = () => {
            const items = el.modalEmojiGrid.querySelectorAll('.emoji-item');
            items.forEach((item, idx) => {
                item.classList.toggle('selected', idx === selectedEmojiIndex);
                if (idx === selectedEmojiIndex) {
                    item.focus();
                    item.scrollIntoView({ block: 'nearest' });
                }
            });
        };

        const handleCategoryClick = (e) => {
            const btn = e.target.closest('.emoji-category-btn');
            if (btn) {
                currentCategoryIndex = parseInt(btn.dataset.index);
                selectedEmojiIndex = -1;
                renderCategories();
                renderEmojis();
            }
        };

        const handleEmojiClick = (e) => {
            const item = e.target.closest('.emoji-item');
            if (item) {
                const emoji = item.dataset.emoji;
                cleanup();
                resolve(emoji);
            }
        };

        const handleKeyDown = (e) => {
            const emojis = emojiData[currentCategoryIndex].emojis;
            const cols = 6;

            if (e.key === 'Tab') {
                // Let native tab handle focusing between categories and grid
                return;
            }

            if (document.activeElement.classList.contains('emoji-category-btn')) {
                if (e.key === 'ArrowRight') {
                    currentCategoryIndex = (currentCategoryIndex + 1) % emojiData.length;
                    renderCategories();
                    renderEmojis();
                    el.modalEmojiCategories.querySelectorAll('.emoji-category-btn')[currentCategoryIndex].focus();
                    e.preventDefault();
                } else if (e.key === 'ArrowLeft') {
                    currentCategoryIndex = (currentCategoryIndex - 1 + emojiData.length) % emojiData.length;
                    renderCategories();
                    renderEmojis();
                    el.modalEmojiCategories.querySelectorAll('.emoji-category-btn')[currentCategoryIndex].focus();
                    e.preventDefault();
                } else if (e.key === 'ArrowDown') {
                    selectedEmojiIndex = 0;
                    updateSelection();
                    e.preventDefault();
                }
            } else if (document.activeElement.classList.contains('emoji-item') || selectedEmojiIndex >= 0) {
                if (selectedEmojiIndex === -1) selectedEmojiIndex = 0;

                if (e.key === 'ArrowRight') {
                    selectedEmojiIndex = (selectedEmojiIndex + 1) % emojis.length;
                    updateSelection();
                    e.preventDefault();
                } else if (e.key === 'ArrowLeft') {
                    selectedEmojiIndex = (selectedEmojiIndex - 1 + emojis.length) % emojis.length;
                    updateSelection();
                    e.preventDefault();
                } else if (e.key === 'ArrowDown') {
                    if (selectedEmojiIndex + cols < emojis.length) {
                        selectedEmojiIndex += cols;
                    } else {
                        // Stay on last row? Or wrap?
                    }
                    updateSelection();
                    e.preventDefault();
                } else if (e.key === 'ArrowUp') {
                    if (selectedEmojiIndex - cols >= 0) {
                        selectedEmojiIndex -= cols;
                    } else {
                        // Go back to categories?
                        selectedEmojiIndex = -1;
                        renderEmojis();
                        el.modalEmojiCategories.querySelectorAll('.emoji-category-btn')[currentCategoryIndex].focus();
                    }
                    updateSelection();
                    e.preventDefault();
                } else if (e.key === 'Enter' || e.key === ' ') {
                    const emoji = emojis[selectedEmojiIndex];
                    if (emoji) {
                        cleanup();
                        resolve(emoji);
                    }
                    e.preventDefault();
                }
            }

            if (e.key === 'Escape') {
                handleCancelClick();
                e.preventDefault();
            }
        };

        const handleCancelClick = () => {
            cleanup();
            resolve(null);
        };

        const cleanup = () => {
            el.modalOverlay.classList.add('hidden');
            el.modalEmojiContainer.classList.add('hidden');
            el.modalEmojiCategories.removeEventListener('click', handleCategoryClick);
            el.modalEmojiGrid.removeEventListener('click', handleEmojiClick);
            el.modalBtnCancel.removeEventListener('click', handleCancelClick);
            document.removeEventListener('keydown', handleKeyDown, true);
            el.modalBtnOk.classList.remove('hidden');
        };

        el.modalBtnOk.classList.add('hidden');
        renderCategories();
        renderEmojis();

        el.modalEmojiCategories.addEventListener('click', handleCategoryClick);
        el.modalEmojiGrid.addEventListener('click', handleEmojiClick);
        el.modalBtnCancel.addEventListener('click', handleCancelClick);
        document.addEventListener('keydown', handleKeyDown, true);

        // Initial focus
        setTimeout(() => {
            el.modalEmojiCategories.querySelectorAll('.emoji-category-btn')[currentCategoryIndex].focus();
        }, 10);
    });
}

