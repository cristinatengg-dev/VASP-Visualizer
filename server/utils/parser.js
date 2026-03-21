const fs = require('fs');
const readline = require('readline');

/**
 * Node.js Stream Parser for XDATCAR
 * @param {string} filePath 
 */
async function parseXDATCARStream(filePath) {
    const fileStream = fs.createReadStream(filePath);
    
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let lineCount = 0;
    let scale = 1.0;
    let lattice = [];
    let atomCounts = [];
    let elementSymbols = []; // If present
    let totalAtoms = 0;
    
    let frames = [];
    let currentFrameCoords = null; // Float32Array
    let atomIndexInFrame = 0;
    
    // State machine
    let parsingFrames = false;
    let headerParsed = false;
    let currentLine = 0; // Relative to start of file

    for await (const line of rl) {
        // Skip empty lines at the very beginning if any? VASP files usually start immediately.
        // But trim() handles whitespace.
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;
        
        currentLine++;

        // Header Parsing (Lines 1-7 typically)
        // 1: Comment
        // 2: Scale
        // 3-5: Lattice
        // 6: Elements (optional)
        // 7: Counts
        
        if (!headerParsed) {
            // We need to handle the variable header size (Elements line optional)
            // Heuristic: Check if line 6 is numeric or string
            
            if (currentLine === 2) {
                scale = parseFloat(trimmedLine);
            } else if (currentLine >= 3 && currentLine <= 5) {
                lattice.push(trimmedLine.split(/\s+/).map(v => parseFloat(v) * scale));
            } else if (currentLine === 6) {
                // Check if this line is elements or counts
                const parts = trimmedLine.split(/\s+/);
                const firstPart = parts[0];
                if (isNaN(parseFloat(firstPart))) {
                    // It's elements
                    elementSymbols = parts;
                } else {
                    // It's counts (Elements missing)
                    atomCounts = parts.map(Number);
                    // Generate dummy elements
                    elementSymbols = atomCounts.map((_, i) => `E${i+1}`);
                    // Header done?
                    headerParsed = true;
                    totalAtoms = atomCounts.reduce((a, b) => a + b, 0);
                }
            } else if (currentLine === 7) {
                if (atomCounts.length === 0) {
                     atomCounts = trimmedLine.split(/\s+/).map(Number);
                     totalAtoms = atomCounts.reduce((a, b) => a + b, 0);
                     headerParsed = true;
                }
            }
            
            // If we are past line 7 and still not parsed header? 
            // VASP files are strict.
            continue;
        }

        // Frame Parsing
        // Check for "Direct configuration="
        if (trimmedLine.toLowerCase().startsWith("direct configuration=")) {
            // If we were parsing a frame, push it
            if (currentFrameCoords) {
                // Check if full?
                if (atomIndexInFrame < totalAtoms) {
                    console.warn(`Frame incomplete. Expected ${totalAtoms}, got ${atomIndexInFrame}`);
                }
                frames.push(Array.from(currentFrameCoords)); // Convert Float32Array to plain array for JSON serialization
                // Or keep as Buffer if we send binary. But JSON is requested: "return JSON object"
            }
            
            // Start new frame
            currentFrameCoords = new Float32Array(totalAtoms * 3);
            atomIndexInFrame = 0;
            parsingFrames = true;
            continue;
        }

        if (parsingFrames && currentFrameCoords) {
            if (atomIndexInFrame < totalAtoms) {
                const coords = trimmedLine.split(/\s+/).map(Number);
                if (coords.length >= 3) {
                     // Convert Fractional to Cartesian
                     // x = u*v1x + v*v2x + w*v3x
                     const u = coords[0];
                     const v = coords[1];
                     const w = coords[2];
                     
                     const x = u * lattice[0][0] + v * lattice[1][0] + w * lattice[2][0];
                     const y = u * lattice[0][1] + v * lattice[1][1] + w * lattice[2][1];
                     const z = u * lattice[0][2] + v * lattice[1][2] + w * lattice[2][2];
                     
                     currentFrameCoords[atomIndexInFrame * 3 + 0] = x;
                     currentFrameCoords[atomIndexInFrame * 3 + 1] = y;
                     currentFrameCoords[atomIndexInFrame * 3 + 2] = z;
                     
                     atomIndexInFrame++;
                }
            }
        }
    }

    // Push last frame
    if (currentFrameCoords) {
        frames.push(Array.from(currentFrameCoords));
    }
    
    // Construct Atom List
    const atomElements = [];
    if (elementSymbols.length === atomCounts.length) {
        elementSymbols.forEach((symbol, index) => {
            for (let i = 0; i < atomCounts[index]; i++) {
                atomElements.push(symbol);
            }
        });
    }

    return {
        lattice,
        atomElements,
        totalAtoms,
        frames,
        frameCount: frames.length
    };
}

module.exports = { parseXDATCARStream };
