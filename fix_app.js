const fs = require('fs');
const path = 'assets/app.js';
try {
    const content = fs.readFileSync(path, 'utf8');
    // Handle CRLF or LF
    let lines = content.split(/\r?\n/);

    // We want to remove lines 275 to 428 (1-based).
    // This corresponds to indices 274 to 427 (0-based).
    // Check if line 275 is indeed what we expect (starts with "emptyTitle") to be safe.
    if (lines.length > 274 && lines[274].includes('emptyTitle')) {
        console.log('Found expected garbage start at line 275.');
        // Calculate how many lines to remove
        // Remove from index 274 up to index 427.
        // Count = 427 - 274 + 1 = 154.
        lines.splice(274, 154);

        fs.writeFileSync(path, lines.join('\n'));
        console.log('Successfully removed garbage lines.');
    } else {
        console.log('Line 275 does not match expected content. Aborting.');
        console.log('Line 275 content:', lines[274]);
    }
} catch (e) {
    console.error(e);
}
