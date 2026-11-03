/**
 * BASEMENT LIBRARY — a sparse spatial grid for rectangular bounds, in any 2D space.
 * A spatial hash is the Map that addresses occupied grid cells by integer coordinates.
 * Index entries refer to scene objects; they do not copy those objects or decide physics.
 * Large entries use a bounded overflow collection instead of allocating millions of cells.
 */
class SpatialHashIndex {
    /** Create an empty index with separate per-object membership and query-traversal budgets. */
    constructor(cellSize = 64, maximumCells = 256, maximumQueryCells = 65536) {
        // Require usable bounds before any object can be registered.
        if (!Number.isFinite(cellSize) || cellSize <= 0 || !Number.isInteger(maximumCells) || maximumCells < 1 || !Number.isInteger(maximumQueryCells) || maximumQueryCells < 1) {
            // Reject settings that would cause infinite loops or invalid grid coordinates.
            throw new RangeError('Spatial cell size must be positive; maximumCells must be a positive integer.');
        }
        // Every grid square has this width and height in the index's coordinate space.
        this.cellSize = cellSize;
        // Cap both object insertion and query cell traversal.
        this.maximumCells = maximumCells;
        // Viewing many cells is reasonable even when one object should not fill all those cells.
        this.maximumQueryCells = maximumQueryCells;
        // Store only occupied cells, using collision-free string coordinate pairs.
        this.cells = new Map();
        // Address object entries by stable identifiers for update and removal.
        this.entries = new Map();
        // Very large objects remain queryable without unbounded cell allocation.
        this.overflow = new Set();
        // Each query gets an independent stamp so a multi-cell entry is returned once.
        this.querySequence = 0;
        // Report the actual broad-phase work instead of promising constant-time queries.
        this.statistics = {
            // Number of occupied cells visited during the latest query.
            visitedCells: 0,
            // Number of unique entries examined during the latest query.
            examinedEntries: 0,
            // Number of bounds-intersecting entries actually returned.
            returnedEntries: 0,
            // True when an exceptionally large query used a bounded full-index scan.
            usedFullScan: false
        };
    }

    /** Validate and return an inclusive integer cell range for finite min/max bounds. */
    cellRange(bounds) {
        // Read explicit axes; Object.values would allow unrelated configuration properties.
        const coordinates = [bounds.minimumX, bounds.minimumY, bounds.maximumX, bounds.maximumY];
        // Every coordinate must be finite and minima must not exceed maxima.
        if (!coordinates.every(Number.isFinite) || bounds.minimumX > bounds.maximumX || bounds.minimumY > bounds.maximumY) {
            // Fail before touching existing membership so an invalid update is atomic.
            throw new RangeError('Spatial bounds require ordered, finite minimum/maximum coordinates.');
        }
        // Negative positions deliberately use floor, not truncation toward zero.
        const minimumColumn = Math.floor(bounds.minimumX / this.cellSize);
        // Inclusive maxima keep touching bounds discoverable for contact handling.
        const maximumColumn = Math.floor(bounds.maximumX / this.cellSize);
        // Convert the vertical minimum into its integer row address.
        const minimumRow = Math.floor(bounds.minimumY / this.cellSize);
        // Convert the vertical maximum into its integer row address.
        const maximumRow = Math.floor(bounds.maximumY / this.cellSize);
        // Extreme coordinates can exceed JavaScript's exact-integer address range.
        if (![minimumColumn, maximumColumn, minimumRow, maximumRow].every(Number.isSafeInteger)) {
            // Reject them rather than risk increment loops that no longer advance.
            throw new RangeError('Spatial coordinates exceed the safe grid address range.');
        }
        // Return a named range rather than a cryptic four-number array.
        return {
            // First occupied horizontal cell.
            minimumColumn,
            // Last occupied horizontal cell, included in traversal.
            maximumColumn,
            // First occupied vertical cell.
            minimumRow,
            // Last occupied vertical cell, included in traversal.
            maximumRow,
            // Total cell visits needed for this rectangle; overflow is handled below.
            count: (maximumColumn - minimumColumn + 1) * (maximumRow - minimumRow + 1)
        };
    }

    /** Insert or update an ID; return its entry, rebuilding membership only when needed. */
    upsert(identifier, value, bounds) {
        // Validate the new range before removing the previous valid entry.
        const range = this.cellRange(bounds);
        // Preserve existing entry identity so retained membership remains valid.
        let entry = this.entries.get(identifier);
        // Construct metadata when this is the first registration of the identifier.
        if (!entry) {
            // Keep index-specific stamps on the entry, never on the shared world object.
            entry = {
                // Stable address used for removal and inspection.
                identifier,
                // Actual registered object reference.
                value,
                // Owned bounds snapshot, filled immediately below.
                bounds: null,
                // Cell address range, filled when membership is established.
                range: null,
                // Cell keys used to remove this entry without scanning the full index.
                cellKeys: [],
                // Last query that examined this entry.
                querySequence: -1
            };
            // Make this entry addressable before populating its cell memberships.
            this.entries.set(identifier, entry);
        }
        // Always refresh the object reference in case the caller deliberately replaces it.
        entry.value = value;
        // Copy numerical bounds so later caller mutation cannot silently corrupt the index.
        entry.bounds = { ...bounds };
        // Check whether all occupied grid cells stayed unchanged.
        const sameCells = entry.range && entry.range.minimumColumn === range.minimumColumn && entry.range.maximumColumn === range.maximumColumn && entry.range.minimumRow === range.minimumRow && entry.range.maximumRow === range.maximumRow;
        // Staying in the same cells needs only new precise bounds, not remove/reinsert work.
        if (sameCells) {
            // Return the live index entry to its owner.
            return entry;
        }
        // Remove old membership before assigning the new range.
        this.detach(entry);
        // Retain the new integer address range for the next incremental update.
        entry.range = range;
        // Large geometry uses one overflow registration rather than thousands of cells.
        if (range.count > this.maximumCells) {
            // Queries still test this object's actual bounds.
            this.overflow.add(entry);
            // No ordinary cell allocation is needed for this entry.
            return entry;
        }
        // Start at the minimum column, include maximumColumn, and increase by one.
        // This counted loop creates each horizontal grid address covered by the bounds.
        for (let column = range.minimumColumn; column <= range.maximumColumn; column += 1) {
            // For each column, traverse minimumRow through maximumRow one row at a time.
            // These nested loops cover every cell touched by a large or rotated object.
            for (let row = range.minimumRow; row <= range.maximumRow; row += 1) {
                // A comma separates the signed integer coordinates without numeric key collisions.
                const key = `${column},${row}`;
                // Create a cell only when its first object arrives.
                if (!this.cells.has(key)) {
                    // Sets make each entry's membership unique within a cell.
                    this.cells.set(key, new Set());
                }
                // Register the entry in the current occupied cell.
                this.cells.get(key).add(entry);
                // Remember the exact key needed for efficient future removal.
                entry.cellKeys.push(key);
            }
        }
        // Return the registered metadata after all memberships are complete.
        return entry;
    }

    /** Remove only an entry's cell/overflow memberships; retain its ID registration. */
    detach(entry) {
        // Visit stored key values with “of”; finish after all previous memberships.
        for (const key of entry.cellKeys) {
            // Find the cell that currently owns this membership.
            const cell = this.cells.get(key);
            // Remove only this entry, preserving neighboring objects.
            cell.delete(entry);
            // Empty cells must not accumulate as moving objects explore the scene.
            if (cell.size === 0) {
                // Release the unused cell and its Set allocation.
                this.cells.delete(key);
            }
        }
        // Reuse the metadata array while clearing obsolete addresses.
        entry.cellKeys.length = 0;
        // An entry may instead have belonged to the overflow collection.
        this.overflow.delete(entry);
    }

    /** Unregister an ID completely; return false when the ID was already absent. */
    remove(identifier) {
        // Resolve the exact metadata needed to remove all of its memberships.
        const entry = this.entries.get(identifier);
        // An already removed object requires no additional cleanup.
        if (!entry) {
            // Tell the caller that this ID did not exist.
            return false;
        }
        // Release ordinary and overflow memberships first.
        this.detach(entry);
        // Forget the ID and report successful removal.
        return this.entries.delete(identifier);
    }

    /** Return intersecting values once each; an optional output array is cleared/reused. */
    query(bounds, output = []) {
        // Validate query size and coordinates before beginning traversal.
        const range = this.cellRange(bounds);
        // Discard the caller's previous results when reusing an output array.
        output.length = 0;
        // Advance this index's query stamp without modifying scene objects.
        this.querySequence += 1;
        // Start new measurements for this query.
        this.statistics.visitedCells = 0;
        // Count candidates even if exact bounds reject them afterward.
        this.statistics.examinedEntries = 0;
        // Record whether bounded cell traversal will fall back to an entry scan.
        this.statistics.usedFullScan = range.count > this.maximumQueryCells || range.count > this.entries.size;
        /** Examine one entry at most once and append it only if its actual bounds overlap. */
        const collect = (entry) => {
            // Objects spanning several visited cells share one query stamp.
            if (entry.querySequence === this.querySequence) {
                // Skip repeated memberships rather than returning duplicate candidates.
                return;
            }
            // Record that this query has now inspected this entry.
            entry.querySequence = this.querySequence;
            // Increase candidate accounting before the exact rectangular bounds test.
            this.statistics.examinedEntries += 1;
            // Read the stored immutable-for-this-update numerical bounds.
            const candidate = entry.bounds;
            // A separating axis means the two rectangles do not overlap or touch.
            if (candidate.maximumX < bounds.minimumX || candidate.minimumX > bounds.maximumX || candidate.maximumY < bounds.minimumY || candidate.minimumY > bounds.maximumY) {
                // Reject this spatial false positive before returning it to physics/rendering.
                return;
            }
            // Return the original object reference, not its internal index metadata.
            output.push(entry.value);
        };
        // Huge query rectangles must not iterate over millions of empty cells.
        if (this.statistics.usedFullScan) {
            // “of” visits registered metadata values once, finishing after the full collection.
            for (const entry of this.entries.values()) {
                // Exact bounds still determine which values enter the output.
                collect(entry);
            }
        } else {
            // Count columns inclusively, advancing by one until maximumColumn is processed.
            for (let column = range.minimumColumn; column <= range.maximumColumn; column += 1) {
                // Within each column, visit the query's rows in increasing order.
                for (let row = range.minimumRow; row <= range.maximumRow; row += 1) {
                    // Count visited addresses, including currently empty cells.
                    this.statistics.visitedCells += 1;
                    // Resolve only the current address instead of scanning registered objects.
                    const cell = this.cells.get(`${column},${row}`);
                    // Empty addresses contain no possible candidates.
                    if (!cell) {
                        // Advance directly to the next row.
                        continue;
                    }
                    // “of” supplies each entry value from this occupied cell's Set.
                    for (const entry of cell) {
                        // De-duplicate and test exact bounds for this entry.
                        collect(entry);
                    }
                }
            }
            // Overflow objects have no ordinary cell memberships but remain queryable.
            // “of” reads each overflow entry once and ends when that Set is exhausted.
            for (const entry of this.overflow) {
                // Use the same deduplication and precise bounds test as ordinary entries.
                collect(entry);
            }
        }
        // Publish result count separately from broad-phase candidate count.
        this.statistics.returnedEntries = output.length;
        // Let callers iterate results or retain their supplied reusable output array.
        return output;
    }

    /** Empty all entries and cells when a scene is unloaded. */
    clear() {
        // Remove ordinary cell membership in one operation.
        this.cells.clear();
        // Release every registered object reference.
        this.entries.clear();
        // Release oversized-object references too.
        this.overflow.clear();
    }
}

/** DIRECTORY SYSTEM — own independent named indexes using the shared Basement algorithm. */
class SpatialSystem {
    /** Create no indexes until another component declares the collection it needs. */
    constructor() {
        // Different concerns can choose different cell sizes and coordinate spaces.
        this.indexes = new NamedLibrary('spatial indexes');
    }

    /** Create a uniquely named index and return it for registration/query operations. */
    createIndex(identifier, cellSize = 64, maximumCells = 256, maximumQueryCells = 65536) {
        // Keep ownership in one addressable library rather than global grid variables.
        return this.indexes.register(identifier, new SpatialHashIndex(cellSize, maximumCells, maximumQueryCells));
    }

    /** Remove all scene references when Directory services are destroyed. */
    dispose() {
        // “of” visits each index value; traversal ends after every named index is cleared.
        for (const index of this.indexes.entries.values()) {
            // Free memberships before discarding the index itself.
            index.clear();
        }
        // Release the named indexes after their contents have been cleared.
        this.indexes.entries.clear();
    }
}
