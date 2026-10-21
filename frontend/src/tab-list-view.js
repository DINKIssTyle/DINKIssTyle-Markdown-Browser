import { TAB_MOTION } from './config.js';

// Keyed DOM reconciliation keeps focus, event handlers, and in-flight motion
// intact when tab titles, dirty state, or the active document change.
export function createTabListView({ container, createNode, updateNode }) {
    const ownerWindow = container.ownerDocument.defaultView;
    const reducedMotion = ownerWindow.matchMedia?.('(prefers-reduced-motion: reduce)');
    const nodes = new Map();
    const animations = new Map();
    const ghosts = new Set();
    let layout = new Map();
    let initialized = false;
    let disposed = false;

    function stopNode(node) {
        animations.get(node)?.cancel();
        animations.delete(node);
    }

    function finishMotion() {
        for (const animation of animations.values()) animation.cancel();
        animations.clear();
    }

    function play(node, keyframes, duration) {
        stopNode(node);
        if (disposed || reducedMotion?.matches || !node.animate || !container.getClientRects().length) {
            return Promise.resolve();
        }
        const animation = node.animate(keyframes, {
            duration,
            easing: TAB_MOTION.easing,
            fill: 'both',
        });
        animations.set(node, animation);
        return animation.finished.catch(() => {}).then(() => {
            if (animations.get(node) === animation) animations.delete(node);
            animation.cancel();
        });
    }

    function capture() {
        const origin = container.getBoundingClientRect();
        const positions = new Map();
        for (const [id, node] of nodes) {
            const rect = node.getBoundingClientRect();
            positions.set(id, {
                left: rect.left - origin.left + container.scrollLeft,
                top: rect.top - origin.top + container.scrollTop,
                width: rect.width,
                opacity: Number(ownerWindow.getComputedStyle(node).opacity),
            });
        }
        return positions;
    }

    function layoutChanged() {
        const next = new Map();
        let changed = nodes.size !== layout.size;
        for (const node of nodes.values()) {
            // Offsets exclude running transforms and scroll position. A title or
            // active-state refresh must not restart an unchanged entry/FLIP.
            const geometry = [node.offsetLeft, node.offsetTop, node.offsetWidth, node.offsetHeight];
            const previous = layout.get(node);
            if (!previous || geometry.some((value, i) => value !== previous[i])) changed = true;
            next.set(node, geometry);
        }
        layout = next;
        return changed;
    }

    function relocate(before) {
        // Read the visible positions before cancelling, then read natural layout
        // after all transforms are gone. Retargeting starts at the current pixels.
        for (const node of nodes.values()) stopNode(node);
        const after = capture();
        for (const [id, node] of nodes) {
            const start = before.get(id);
            const end = after.get(id);
            if (!start || !end) continue;
            const x = start.left - end.left;
            const y = start.top - end.top;
            if (Math.abs(x) < 0.25 && Math.abs(y) < 0.25 && start.opacity >= 0.99) continue;
            void play(node, [
                { transform: `translate(${x}px, ${y}px)`, opacity: start.opacity },
                { transform: 'translate(0, 0)', opacity: 1 },
            ], TAB_MOTION.moveMs);
        }
    }

    function exit(id, position) {
        const node = nodes.get(id);
        nodes.delete(id);
        stopNode(node);
        if (!position || disposed || reducedMotion?.matches || !node.animate || !container.getClientRects().length) {
            node.remove();
            return Promise.resolve();
        }
        // The outgoing tab leaves layout immediately, without squeezing its text.
        // Its short fade runs independently of the other tabs' FLIP movement.
        node.classList.add('tab-exit-ghost');
        node.removeAttribute('data-tab-id');
        node.setAttribute('aria-hidden', 'true');
        node.inert = true;
        Object.assign(node.style, {
            left: `${position.left}px`,
            top: `${position.top}px`,
            width: `${position.width}px`,
            maxWidth: 'none',
        });
        ghosts.add(node);
        return play(node, [
            { opacity: position.opacity, transform: 'translateY(0)' },
            { opacity: 0, transform: `translateY(${TAB_MOTION.exitOffsetPx}px)` },
        ], TAB_MOTION.exitMs).finally(() => {
            ghosts.delete(node);
            node.remove();
        });
    }

    function sync(tabs) {
        if (disposed) return;
        const before = capture();
        const ids = new Set(tabs.map(tab => tab.id));
        for (const id of nodes.keys()) {
            if (!ids.has(id)) void exit(id, before.get(id));
        }
        const added = [];
        const ordered = tabs.map(tab => {
            let node = nodes.get(tab.id);
            if (!node) {
                node = createNode(tab);
                nodes.set(tab.id, node);
                added.push(node);
            }
            updateNode(node, tab);
            return node;
        });
        const managedNodes = new Set(ordered);
        let anchor = container.firstElementChild;
        for (const node of ordered) {
            while (anchor && !managedNodes.has(anchor)) anchor = anchor.nextElementSibling;
            if (node === anchor) anchor = anchor.nextElementSibling;
            else container.insertBefore(node, anchor);
        }
        const changed = layoutChanged();
        if (initialized) {
            if (changed) relocate(before);
            for (const node of added) {
                void play(node, [
                    { opacity: 0, transform: `translateY(${TAB_MOTION.enterOffsetPx}px)` },
                    { opacity: 1, transform: 'translateY(0)' },
                ], TAB_MOTION.enterMs);
            }
        }
        initialized = true;
    }

    function remove(id) {
        if (!nodes.has(id) || disposed) return Promise.resolve();
        const before = capture();
        const finished = exit(id, before.get(id));
        relocate(before);
        layoutChanged();
        return finished;
    }

    const handleMotionPreference = () => {
        if (reducedMotion.matches) finishMotion();
    };
    reducedMotion?.addEventListener?.('change', handleMotionPreference);

    return {
        sync,
        remove,
        stop(id) {
            const node = nodes.get(id);
            if (node) stopNode(node);
        },
        dispose() {
            disposed = true;
            finishMotion();
            for (const node of ghosts) node.remove();
            ghosts.clear();
            nodes.clear();
            layout.clear();
            reducedMotion?.removeEventListener?.('change', handleMotionPreference);
        },
    };
}
