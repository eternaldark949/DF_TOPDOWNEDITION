/**
 * AUDIT QUERY — search compressed relationship evidence without installing parsers
 * or loading the original game's executable code. --section selects evidence kind;
 * --file, --owner, and --find narrow results. --callers reports only source-backed
 * candidate targets; use --find with calls to inspect unresolved raw dispatch too.
 * Output is bounded by --limit and always states total matches versus shown records.
 */
const fs = require('node:fs');
// Resolve the checked-in evidence relative to this tool, not the caller's directory.
const path = require('node:path');
// Node's built-in gzip reader keeps this lookup dependency-free.
const zlib = require('node:zlib');

/** Read one named option value, or return its documented fallback. */
function option(name, fallback = '') {
    // Find the exact command-line spelling before reading the following value.
    const index = process.argv.indexOf(name);
    // Missing arguments keep the fallback instead of accidentally consuming another option.
    return index < 0 ? fallback : process.argv[index + 1] ?? fallback;
}

// Allow another explicit audit file without guessing a newer source snapshot.
const filename = path.resolve(option('--data', path.join(__dirname, '../audit/relationships.json.gz')));
// Decompress generated source facts; this does not execute any original game code.
const audit = JSON.parse(zlib.gunzipSync(fs.readFileSync(filename)).toString('utf8'));
// Declaration IDs let raw call/property records recover readable source function names.
const definitions = new Map(audit.definitions.map((definition) => [definition.id, definition]));
// Definitions are the default entry point when no evidence kind is selected.
const section = option('--section', 'definitions');
// File filtering accepts a full path or a distinctive path fragment.
const fileFilter = option('--file');
// Owner filtering can use either an exact definition ID or its semantic function/method name.
const ownerFilter = option('--owner');
// Text search is intentionally broad across the selected fact record's serialized fields.
const textFilter = option('--find').toLowerCase();
// Candidate incoming calls require an explicit original semantic target name.
const callerTarget = option('--callers');
// A bounded default prevents thousands of property facts from flooding a phone or agent context.
const limit = Number(option('--limit', '50'));
// Invalid limits must not silently turn into unbounded output.
if (!Number.isInteger(limit) || limit < 1) {
    // Name the accepted unit clearly for the caller.
    throw new RangeError('--limit must be a positive integer record count.');
}
// Incoming-call queries always inspect call expressions, regardless of the default section.
const selectedSection = callerTarget ? 'calls' : section;
// Only actual array evidence sections support record filtering.
if (!Array.isArray(audit[selectedSection])) {
    // List concrete available sections instead of returning a misleading empty result.
    throw new Error(`Unknown section ${selectedSection}; choose ${Object.keys(audit).filter((key) => Array.isArray(audit[key])).join(', ')}.`);
}
// Collect all declaration versions of the requested target; wrappers can preserve older versions.
const targetIds = new Set(audit.definitions.filter((definition) => definition.name === callerTarget).map((definition) => definition.id));
// filter visits each selected source fact and keeps only records matching every supplied constraint.
const matches = audit[selectedSection].filter(
    /** Decide whether one original fact matches the explicit query, without inventing runtime targets. */
    (record) => {
        // A record's own declaration name or its enclosing executable owner may satisfy --owner.
        const ownerName = record.name ?? definitions.get(record.owner)?.name ?? record.owner ?? '';
        // Path fragments remain literal searches rather than unsafe dynamically constructed regular expressions.
        if (fileFilter && !(record.file ?? record.path ?? '').includes(fileFilter)) return false;
        // Match semantic names or exact IDs so anonymous callback ownership is still queryable.
        if (ownerFilter && !ownerName.includes(ownerFilter) && !(record.owner ?? record.id ?? '').includes(ownerFilter)) return false;
        // --callers includes only recorded source-backed candidates, not every same-spelled dynamic method.
        if (callerTarget && !(record.targets ?? []).some((target) => targetIds.has(target))) return false;
        // Optional text search covers original property paths, literals, and candidate IDs.
        if (textFilter && !JSON.stringify(record).toLowerCase().includes(textFilter)) return false;
        // This fact satisfies every requested query constraint.
        return true;
    }
);
// Show original method names alongside stable IDs without altering stored evidence.
const shown = matches.slice(0, limit).map(
    /** Add readable owner/target labels to one bounded query result. */
    (record) => ({
        // Preserve every original extracted fact unchanged.
        ...record,
        // The original source owner is useful even when the invoked target is dynamic.
        ownerName: definitions.get(record.owner)?.name ?? record.owner,
        // Candidate labels retain ambiguity when several prototype versions or receiver types are possible.
        targetNames: record.targets?.map((target) => definitions.get(target)?.name ?? target)
    })
);
// Report source provenance, total matches, visible count, and uncertainty before the actual records.
console.log(JSON.stringify({sourceCommit: audit.sourceCommit, section: selectedSection, total: matches.length, shown: shown.length, candidateTargetsAreRuntimeProof: false, records: shown}, null, 2));
