import GLib from 'gi://GLib';
import Meta from 'gi://Meta';

class PointerWatch {
    constructor(watcher, interval, callback) {
        this.watcher = watcher;
        this.interval = interval;
        this.callback = callback;
    }

    remove() {
        this.watcher._removeWatch(this);
    }
}

export class PointerWatcher {
    constructor() {
        this._watches = [];
        const g = typeof global !== 'undefined' ? global : null;
        this._tracker = g?.backend?.get_cursor_tracker?.() ??
                        (g?.display ? Meta.CursorTracker.get_for_display?.(g.display) : null);
        this._signalId = 0;
        this._timeoutId = 0;
        this._x = -1;
        this._y = -1;
    }

    addWatch(interval, callback) {
        let watch = new PointerWatch(this, interval, callback);
        this._watches.push(watch);
        this._updateWatchState();
        return watch;
    }

    _removeWatch(watch) {
        let index = this._watches.indexOf(watch);
        if (index !== -1)
            this._watches.splice(index, 1);
        this._updateWatchState();
    }

    _getPointerPosition() {
        if (this._tracker?.get_pointer) {
            try {
                const res = this._tracker.get_pointer();
                if (Array.isArray(res) && res.length > 0) {
                    const first = res[0];
                    if (first && typeof first === 'object' && 'x' in first && 'y' in first) {
                        return [first.x, first.y];
                    } else if (typeof first === 'number') {
                        return [res[0], res[1]];
                    }
                }
            } catch (e) {
                // fallback to global.get_pointer
            }
        }
        if (typeof global !== 'undefined' && global.get_pointer) {
            const [x, y] = global.get_pointer();
            return [x, y];
        }
        return [-1, -1];
    }

    _updateWatchState() {
        if (this._watches.length > 0) {
            this._x = -1;
            this._y = -1;
            if (!this._signalId && this._tracker) {
                this._signalId = this._tracker.connect('position-invalidated', () => {
                    this._onPointerMoved();
                });
            }
            if (!this._timeoutId) {
                this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
                    this._onPointerMoved();
                    return GLib.SOURCE_CONTINUE;
                });
            }
        } else {
            if (this._signalId && this._tracker) {
                this._tracker.disconnect(this._signalId);
                this._signalId = 0;
            }
            if (this._timeoutId) {
                GLib.source_remove(this._timeoutId);
                this._timeoutId = 0;
            }
        }
    }

    _onPointerMoved() {
        const [x, y] = this._getPointerPosition();
        if (x < 0 || y < 0) return;
        if (this._x === x && this._y === y)
            return;
        this._x = x;
        this._y = y;
        for (let watch of this._watches.slice()) {
            try {
                watch.callback(x, y);
            } catch (e) {
                console.error(`[Hide Top Bar] Error in pointer watch callback: ${e}`);
            }
        }
    }
}

let _pointerWatcher = null;

export function getPointerWatcher() {
    if (!_pointerWatcher)
        _pointerWatcher = new PointerWatcher();
    return _pointerWatcher;
}
