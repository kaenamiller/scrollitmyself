document.addEventListener('DOMContentLoaded', () => {
    const slider = document.getElementById('sensitivity');
    const valueDisplay = document.getElementById('sensitivity-value');
    const newDomainInput = document.getElementById('new-domain');
    const addDomainBtn = document.getElementById('add-domain');
    const blacklistUl = document.getElementById('blacklist');
    const modeRadios = document.getElementsByName('activation-mode');

    // Auto-populate with current tab's domain
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0] && tabs[0].url) {
            try {
                const url = new URL(tabs[0].url);
                if (url.protocol === 'http:' || url.protocol === 'https:') {
                    newDomainInput.value = url.hostname;
                }
            } catch (e) {
                // Ignore invalid URLs
            }
        }
    });

    // 1. Load saved settings
    chrome.storage.sync.get(['sensitivity', 'blacklist', 'middleClickMode'], (result) => {
        // Default to 30 if not set (matches the multiplier 0.15)
        const currentVal = result.sensitivity || 30;
        slider.value = currentVal;
        valueDisplay.textContent = currentVal;

        // Load activation mode (default: 'toggle')
        const currentMode = result.middleClickMode || 'toggle';
        for (const radio of modeRadios) {
            if (radio.value === currentMode) {
                radio.checked = true;
            }
        }

        // Load blacklist
        const blacklist = result.blacklist || [];
        renderBlacklist(blacklist);
    });

    // 2. Save settings when slider changes
    slider.addEventListener('input', () => {
        const val = parseInt(slider.value, 10);
        valueDisplay.textContent = val;

        chrome.storage.sync.set({ sensitivity: val });
    });

    // Save settings when mode changes
    for (const radio of modeRadios) {
        radio.addEventListener('change', (e) => {
            if (e.target.checked) {
                chrome.storage.sync.set({ middleClickMode: e.target.value });
            }
        });
    }

    // 3. Blacklist Logic
    function renderBlacklist(list) {
        blacklistUl.innerHTML = '';
        list.forEach(domain => {
            const li = document.createElement('li');
            li.style.display = 'flex';
            li.style.justifyContent = 'space-between';
            li.style.alignItems = 'center';
            li.style.padding = '5px';
            li.style.borderBottom = '1px solid #eee';

            const span = document.createElement('span');
            span.textContent = domain;
            span.style.overflow = 'hidden';
            span.style.textOverflow = 'ellipsis';
            span.style.whiteSpace = 'nowrap';
            span.style.maxWidth = '130px';
            span.title = domain; // Tooltip for full name

            const btnContainer = document.createElement('div');
            btnContainer.style.display = 'flex';
            btnContainer.style.gap = '5px';

            const editBtn = document.createElement('button');
            editBtn.textContent = '\u270E'; // Pencil icon
            editBtn.style.cursor = 'pointer';
            editBtn.style.padding = '2px 5px';
            editBtn.style.fontSize = '10px';
            editBtn.title = 'Edit';
            editBtn.onclick = () => {
                removeDomain(domain, () => {
                    newDomainInput.value = domain;
                    newDomainInput.focus();
                });
            };

            const delBtn = document.createElement('button');
            delBtn.textContent = '\u00D7'; // Multiplication sign (X)
            delBtn.style.cursor = 'pointer';
            delBtn.style.padding = '2px 5px';
            delBtn.style.color = 'red';
            delBtn.style.fontSize = '12px';
            delBtn.title = 'Remove';
            delBtn.onclick = () => removeDomain(domain);

            btnContainer.appendChild(editBtn);
            btnContainer.appendChild(delBtn);
            li.appendChild(span);
            li.appendChild(btnContainer);
            blacklistUl.appendChild(li);
        });
    }

    function addDomain() {
        const domain = newDomainInput.value.trim();
        if (!domain) return;

        chrome.storage.sync.get(['blacklist'], (result) => {
            const list = result.blacklist || [];
            if (!list.includes(domain)) {
                list.push(domain);
                chrome.storage.sync.set({ blacklist: list }, () => {
                    renderBlacklist(list);
                    newDomainInput.value = '';
                });
            } else {
                newDomainInput.value = ''; // Clear if duplicate
            }
        });
    }

    function removeDomain(domain, callback) {
        chrome.storage.sync.get(['blacklist'], (result) => {
            let list = result.blacklist || [];
            list = list.filter(d => d !== domain);
            chrome.storage.sync.set({ blacklist: list }, () => {
                renderBlacklist(list);
                if (callback) callback();
            });
        });
    }

    addDomainBtn.addEventListener('click', addDomain);
    newDomainInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addDomain();
    });
});
