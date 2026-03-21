
// XDATCAR Parser Worker

self.onmessage = async (e) => {
    const file = e.data;
    try {
        const text = await file.text();
        if (!text || text.trim().length === 0) {
            self.postMessage({ success: false, error: "File is empty" });
            return;
        }
        const result = parseXDATCAR(text);
        self.postMessage({ success: true, data: result });
    } catch (err) {
        self.postMessage({ success: false, error: err?.message || String(err) });
    }
};

function parseXDATCAR(content) {
    const lines = content.trim().split(/\r?\n/);
    if (lines.length < 8) throw new Error("File too short");

    // 1. Header Info
    // Skip potential empty lines at start
    let startLine = 0;
    while (startLine < lines.length && lines[startLine].trim() === '') startLine++;
    
    // Scale
    // Usually line 2 (index 1) if we assume standard format, but let's be safe
    // Standard VASP: 
    // Line 1: Comment
    // Line 2: Scale
    // Line 3-5: Lattice
    // Line 6: Elements (optional in older versions but common in POTCAR compatible ones)
    // Line 7: Counts
    
    // Let's use the provided template logic but robustify
    const scale = parseFloat(lines[startLine + 1]);
    
    const lattice = [
        lines[startLine + 2].trim().split(/\s+/).map(v => parseFloat(v) * scale),
        lines[startLine + 3].trim().split(/\s+/).map(v => parseFloat(v) * scale),
        lines[startLine + 4].trim().split(/\s+/).map(v => parseFloat(v) * scale)
    ];

    let elementSymbols = [];
    let atomCounts = [];
    let currentLine = startLine + 5;
    
    const lineA = lines[currentLine].trim();
    const partsA = lineA.split(/\s+/);
    
    if (isNaN(parseFloat(partsA[0]))) {
        // Line 6 is elements
        elementSymbols = partsA;
        currentLine++;
        const lineB = lines[currentLine].trim();
        atomCounts = lineB.split(/\s+/).map(Number);
        currentLine++;
    } else {
        // Line 6 is counts (Elements implicit or missing)
        atomCounts = partsA.map(Number);
        // Generate dummy elements E1, E2...
        elementSymbols = atomCounts.map((_, i) => `E${i+1}`);
        currentLine++;
    }

    const totalAtoms = atomCounts.reduce((a, b) => a + b, 0);

    // Build Atom Elements List
    const atomElements = [];
    if (elementSymbols.length === atomCounts.length) {
        elementSymbols.forEach((symbol, index) => {
            for (let i = 0; i < atomCounts[index]; i++) {
                atomElements.push(symbol);
            }
        });
    } else {
         // Fallback if mismatch or single element type implicitly
         // But usually VASP has equal length arrays if we parsed correctly.
         // If we generated E1, E2... from counts, then lengths match.
    }

    // 2. Parse Frames
    const frames = [];
    
    // We need to support Direct configuration= check case-insensitively
    // Loop
    const totalLines = lines.length;
    
    while (currentLine < totalLines) {
        const line = lines[currentLine].trim();
        if (!line) {
            currentLine++;
            continue;
        }

        if (!line.toLowerCase().startsWith("direct configuration=")) {
            currentLine++;
            continue;
        }

        currentLine++;
        const frameCoords = new Float32Array(totalAtoms * 3);
        let atomIndex = 0;

        while (atomIndex < totalAtoms && currentLine < totalLines) {
            const atomLine = lines[currentLine].trim();
            if (!atomLine) {
                currentLine++;
                continue;
            }
            if (atomLine.toLowerCase().startsWith("direct configuration=")) break;

            const coords = atomLine.split(/\s+/).map(Number);
            if (coords.length >= 3) {
                const u = coords[0];
                const v = coords[1];
                const w = coords[2];

                const x = u * lattice[0][0] + v * lattice[1][0] + w * lattice[2][0];
                const y = u * lattice[0][1] + v * lattice[1][1] + w * lattice[2][1];
                const z = u * lattice[0][2] + v * lattice[1][2] + w * lattice[2][2];

                frameCoords[atomIndex * 3 + 0] = x;
                frameCoords[atomIndex * 3 + 1] = y;
                frameCoords[atomIndex * 3 + 2] = z;

                atomIndex++;
            }
            currentLine++;
        }

        if (atomIndex === totalAtoms) {
            frames.push(frameCoords);
        }
    }

    if (frames.length === 0) {
        throw new Error("No frames found in XDATCAR");
    }

    return {
        lattice,
        atomElements,
        totalAtoms,
        frames,
        frameCount: frames.length
    };
}
