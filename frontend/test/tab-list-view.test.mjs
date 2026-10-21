import test from 'node:test';
import assert from 'node:assert/strict';
import { createTabListView } from '../src/tab-list-view.js';

// Deterministic layout/animation doubles let us pause at the exact frame where
// another close, render, scroll or media-query change interrupts the first one.
function harness({ vertical = false, reduced = false, animated = true } = {}) {
    const created = [], played = [];
    const media = { matches: reduced, addEventListener(_, fn) { this.change = fn; }, removeEventListener() {} };
    class Node {
        constructor() {
            this.children = []; this.parentElement = null; this.style = {}; this.dataset = {};
            this.attributes = new Map(); this.width = 120; this.height = 30;
            const classes = new Set();
            this.classList = { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) };
        }
        get firstElementChild() { return this.children[0] || null; }
        get nextElementSibling() { const siblings = this.parentElement?.children || []; return siblings[siblings.indexOf(this) + 1] || null; }
        insertBefore(node, anchor) {
            node.remove();
            const index = anchor ? this.children.indexOf(anchor) : this.children.length;
            this.children.splice(index, 0, node); node.parentElement = this;
        }
        remove() { if (!this.parentElement) return; const siblings = this.parentElement.children; siblings.splice(siblings.indexOf(this), 1); this.parentElement = null; }
        setAttribute(name, value) { this.attributes.set(name, value); }
        removeAttribute(name) { this.attributes.delete(name); if (name === 'data-tab-id') delete this.dataset.tabId; }
        get offsetLeft() {
            if (!this.parentElement || vertical) return 0;
            return this.parentElement.children.filter(n => !n.classList.contains('tab-exit-ghost')).slice(0, this.parentElement.children.filter(n => !n.classList.contains('tab-exit-ghost')).indexOf(this)).reduce((x, node) => x + node.width + 4, 0);
        }
        get offsetTop() { return !this.parentElement || !vertical ? 0 : this.parentElement.children.filter(n => !n.classList.contains('tab-exit-ghost')).indexOf(this) * 34; }
        get offsetWidth() { return this.width; }
        get offsetHeight() { return this.height; }
        getBoundingClientRect() {
            if (this === container) return { left: 100, top: 20, width: 600, height: 300 };
            const ghost = this.classList.contains('tab-exit-ghost');
            const x = ghost ? parseFloat(this.style.left) : this.offsetLeft;
            const y = ghost ? parseFloat(this.style.top) : this.offsetTop;
            const frame = this.animation?.frames[0];
            const translation = frame?.transform.match(/translate\(([-.\d]+)px, ([-.\d]+)px\)/);
            const dy = frame?.transform.match(/translateY\(([-.\d]+)px\)/);
            return { left: 100 + x - container.scrollLeft + (translation ? +translation[1] : 0), top: 20 + y - container.scrollTop + (translation ? +translation[2] : dy ? +dy[1] : 0), width: this.width, height: this.height };
        }
        animate(frames, options) {
            let resolve, reject;
            const animation = { node: this, frames, options, cancelled: false,
                finished: new Promise((yes, no) => { resolve = yes; reject = no; }),
                complete: () => resolve(),
                cancel: () => { animation.cancelled = true; if (this.animation === animation) this.animation = null; reject(new Error('cancelled')); },
            };
            this.animation = animation; played.push(animation); return animation;
        }
    }
    const container = new Node();
    container.scrollLeft = 0; container.scrollTop = 0; container.visible = true;
    container.getClientRects = () => container.visible ? [{}] : [];
    container.ownerDocument = { defaultView: { matchMedia: () => media, getComputedStyle: node => ({ opacity: String(node.animation?.frames[0]?.opacity ?? 1) }) } };
    const view = createTabListView({ container,
        createNode(tab) { const node = new Node(); node.dataset.tabId = tab.id; if (!animated) node.animate = undefined; created.push(node); return node; },
        updateNode(node, tab) { node.title = tab.title; node.width = tab.width || 120; },
    });
    const initial = [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }, { id: 'c', title: 'C' }];
    view.sync(initial);
    return { container, view, created, played, initial, media };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('tab refresh preserves DOM identity, focus targets and the running entry animation', async () => {
    const h = harness();
    const original = h.created[0];
    h.view.sync([...h.initial, { id: 'd', title: 'New' }]);
    const entry = h.played.at(-1);
    assert.equal(entry.options.duration, 150);
    h.view.sync([...h.initial.map(t => ({ ...t, title: `${t.title}!` })), { id: 'd', title: 'Loaded' }]);
    assert.equal(h.created[0], original);
    assert.equal(original.title, 'A!');
    assert.equal(h.created.length, 4);
    assert.equal(entry.cancelled, false);
    assert.equal(h.played.length, 1);
    h.view.dispose(); await settle();
});

test('closing leaves layout immediately, preserves text width and moves peers concurrently', async () => {
    const h = harness();
    const closing = h.created[1], following = h.created[2];
    const pending = h.view.remove('b');
    assert.equal(closing.classList.contains('tab-exit-ghost'), true);
    assert.equal(closing.style.width, '120px');
    assert.equal(closing.attributes.get('aria-hidden'), 'true');
    assert.equal(closing.inert, true);
    assert.equal(following.offsetLeft, 124);
    const exit = h.played.find(a => a.node === closing);
    const move = h.played.find(a => a.node === following);
    assert.equal(exit.options.duration, 110);
    assert.equal(move.options.duration, 180);
    assert.equal(move.frames[0].transform, 'translate(124px, 0px)');
    assert.ok(h.played.every(a => a.frames.every(f => !f.filter && !f.transform.includes('scale'))));
    exit.complete(); await pending;
    h.view.sync([h.initial[0], h.initial[2]]);
    assert.equal(closing.parentElement, null);
    assert.equal(move.cancelled, false, 'the post-close render must not restart the peer movement');
    move.complete(); await settle();
});

test('overlapping closes and a new tab do not resurrect exiting nodes or leak ghosts', async () => {
    const h = harness();
    const first = h.view.remove('a');
    const second = h.view.remove('b');
    h.view.sync([{ id: 'c', title: 'C' }, { id: 'd', title: 'D' }]);
    assert.equal(h.created.length, 4);
    for (const animation of h.played) animation.complete();
    await Promise.all([first, second]); await settle();
    assert.deepEqual(h.container.children.map(node => node.dataset.tabId), ['c', 'd']);
    h.view.dispose();
});

test('reduced motion, hidden lists and unsupported animation remove tabs immediately', async () => {
    for (const opts of [{ reduced: true }, { animated: false }, {}]) {
        const h = harness(opts);
        if (!Object.keys(opts).length) h.container.visible = false;
        await h.view.remove('b');
        h.view.sync([h.initial[0], h.initial[2]]);
        assert.equal(h.played.length, 0);
        assert.equal(h.created[1].parentElement, null);
        h.view.dispose();
    }
});

test('viewport disposal and enabling reduced motion settle pending exits', async () => {
    for (const dispose of [true, false]) {
        const h = harness();
        const pending = h.view.remove('b');
        if (dispose) h.view.dispose();
        else { h.media.matches = true; h.media.change(); }
        await pending; await settle();
        assert.equal(h.created[1].parentElement, null);
        assert.ok(h.played.every(a => a.cancelled));
        h.view.dispose();
    }
});

test('vertical mobile rows use the same FLIP movement and scrolling does not start motion', async () => {
    const h = harness({ vertical: true });
    h.container.scrollTop = 20;
    h.view.sync(h.initial);
    assert.equal(h.played.length, 0);
    const pending = h.view.remove('b');
    assert.equal(h.played.find(a => a.node === h.created[2]).frames[0].transform, 'translate(0px, 34px)');
    for (const a of h.played) a.complete();
    await pending; await settle();
    h.view.dispose();
});
