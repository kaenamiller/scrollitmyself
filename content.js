(function () {
    let isScrolling = false;
    let originX = 0;
    let originY = 0;
    let scrollSpeedX = 0;
    let scrollSpeedY = 0;
    let animationFrameId = null;
    let originIcon = null;

    // The element currently being scrolled (null means window)
    let activeScrollTarget = null;

    // Configuration
    const SCROLL_DEADZONE = 20;
    const MAX_SPEED = 300;

    let scrollMultiplier = 0.15;
    let blacklist = [];
    let middleClickMode = 'toggle'; // 'toggle' or 'hold'

    // Initialize Settings
    if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.sync.get(['sensitivity', 'blacklist', 'middleClickMode'], (result) => {
            if (result.sensitivity) {
                scrollMultiplier = result.sensitivity / 200;
            }
            if (result.blacklist) {
                blacklist = result.blacklist;
            }
            if (result.middleClickMode) {
                middleClickMode = result.middleClickMode;
            }
        });

        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (changes.sensitivity) {
                scrollMultiplier = changes.sensitivity.newValue / 200;
            }
            if (changes.blacklist) {
                blacklist = changes.blacklist.newValue;
            }
            if (changes.middleClickMode) {
                middleClickMode = changes.middleClickMode.newValue;
            }
        });
    }

    function isBlacklisted() {
        return blacklist.includes(window.location.hostname);
    }

    function createIcon() {
        const icon = document.createElement('div');
        icon.id = 'autoscroll-origin-icon';
        return icon;
    }

    // Helper: Check if an element is actually scrollable
    function isElementScrollable(element) {
        if (!element) return false;
        
        const style = window.getComputedStyle(element);
        const overflowY = style.overflowY;
        const overflowX = style.overflowX;
        
        // For html and body, they're scrollable if they have scrollable content
        // even without explicit overflow styles
        if (element === document.documentElement || element === document.body) {
            return element.scrollHeight > element.clientHeight || 
                   element.scrollWidth > element.clientWidth;
        }
        
        // For other elements, check for explicit scrollable overflow style
        const isScrollableStyle = 
            overflowY === 'auto' || overflowY === 'scroll' ||
            overflowX === 'auto' || overflowX === 'scroll';
        
        if (!isScrollableStyle) return false;
        
        // Check if it actually has scrollable content
        const canScrollY = element.scrollHeight > element.clientHeight;
        const canScrollX = element.scrollWidth > element.clientWidth;
        
        return canScrollY || canScrollX;
    }

    // Helper: Find the nearest scrollable ancestor
    function getScrollParent(node) {
        if (!node) return null;

        // Check if window/html/body is scrollable first
        const windowScrollable = isElementScrollable(document.documentElement) || 
                                 isElementScrollable(document.body);

        // Traverse up the DOM
        while (node && node !== document) {
            // Check if this node is scrollable
            if (isElementScrollable(node)) {
                // For html/body, return null to use window scrolling
                // (window.scrollBy scrolls document.documentElement)
                if (node === document.documentElement || node === document.body) {
                    return null;
                }
                
                // If window is also scrollable, prefer window scrolling for better compatibility
                // This handles cases where a nested container is scrollable but the main
                // scrolling happens on the window (common in modern flex/grid layouts)
                if (windowScrollable) {
                    // Check if this container is very large (likely not the real scroll container)
                    const rect = node.getBoundingClientRect();
                    const viewportHeight = window.innerHeight;
                    const viewportWidth = window.innerWidth;
                    
                    // If container takes up most of viewport, prefer window scrolling
                    if (rect.height >= viewportHeight * 0.9 && rect.width >= viewportWidth * 0.9) {
                        return null; // Use window scrolling instead
                    }
                }
                
                // For other scrollable containers, return the element
                return node;
            }
            node = node.parentElement;
        }
        
        // If no specific container found, return null (use window scrolling)
        return null;
    }

    // The main animation loop
    function scrollLoop() {
        if (!isScrolling) return;

        if (scrollSpeedX !== 0 || scrollSpeedY !== 0) {
            if (activeScrollTarget) {
                // Scroll the specific container
                activeScrollTarget.scrollBy(scrollSpeedX, scrollSpeedY);
            } else {
                // Scroll the main window
                window.scrollBy(scrollSpeedX, scrollSpeedY);
            }
        }

        animationFrameId = requestAnimationFrame(scrollLoop);
    }

    function startAutoscroll(e) {
        isScrolling = true;
        originX = e.clientX;
        originY = e.clientY;

        // DETECT TARGET: Find which element should scroll
        activeScrollTarget = getScrollParent(e.target);

        document.body.classList.add('autoscrolling');

        originIcon = createIcon();
        originIcon.style.left = `${originX}px`;
        originIcon.style.top = `${originY}px`;
        document.body.appendChild(originIcon);

        scrollLoop();
    }

    function stopAutoscroll() {
        isScrolling = false;
        activeScrollTarget = null; // Clear target
        scrollSpeedX = 0;
        scrollSpeedY = 0;

        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
        }

        if (originIcon) {
            originIcon.remove();
            originIcon = null;
        }
        document.body.classList.remove('autoscrolling');
    }

    function isLink(target) {
        return target.tagName === 'A' || target.closest('a') !== null;
    }

    // 1. Handle the Middle Click Trigger
    document.addEventListener('mousedown', (e) => {
        if (isBlacklisted()) return;

        if (e.button !== 1) {
            // If clicking another button while scrolling
            if (isScrolling) {
                // In toggle mode, any click stops it.
                // In hold mode, we might want to ignore other clicks or stop?
                // Let's stick to: any click stops it for safety/consistency,
                // OR just ignore if it's not the middle button release.
                // For now, let's stop it to be safe.
                stopAutoscroll();
                e.preventDefault();
                e.stopPropagation();
            }
            return;
        }

        // Middle button pressed

        if (isScrolling) {
            // If already scrolling...
            if (middleClickMode === 'toggle') {
                // Toggle mode: click to stop
                stopAutoscroll();
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            // Hold mode: already holding, so do nothing (shouldn't really happen unless focus lost/regained)
            return;
        }

        if (isLink(e.target)) {
            return;
        }

        // Start scrolling
        e.preventDefault();
        e.stopPropagation();
        startAutoscroll(e);
    }, { capture: true });

    // 2. Calculate Speed
    document.addEventListener('mousemove', (e) => {
        if (!isScrolling) return;

        const currentX = e.clientX;
        const currentY = e.clientY;

        const deltaX = currentX - originX;
        const deltaY = currentY - originY;

        if (Math.abs(deltaX) < SCROLL_DEADZONE) {
            scrollSpeedX = 0;
        } else {
            const rawSpeed = (deltaX - (Math.sign(deltaX) * SCROLL_DEADZONE)) * scrollMultiplier;
            scrollSpeedX = Math.max(Math.min(rawSpeed, MAX_SPEED), -MAX_SPEED);
        }

        if (Math.abs(deltaY) < SCROLL_DEADZONE) {
            scrollSpeedY = 0;
        } else {
            const rawSpeed = (deltaY - (Math.sign(deltaY) * SCROLL_DEADZONE)) * scrollMultiplier;
            scrollSpeedY = Math.max(Math.min(rawSpeed, MAX_SPEED), -MAX_SPEED);
        }
    });

    // 3. Prevent default Linux middle-click paste
    document.addEventListener('auxclick', (e) => {
        if (isScrolling && e.button === 1) {
            e.preventDefault();
            e.stopPropagation();
        }
    }, { capture: true });

    document.addEventListener('mouseup', (e) => {
        if (e.button === 1) {
            if (isScrolling) {
                if (middleClickMode === 'hold') {
                    stopAutoscroll();
                }
                e.preventDefault();
                e.stopPropagation();
            }
        }
    }, { capture: true });

})();
