# SCI Visualizer - User Manual

## 1. Introduction
SCI Visualizer is a high-performance, web-based visualization tool designed for materials science data. It enables researchers to view, edit, analyze, and export publication-quality images and videos from VASP structure files (`.vasp`, `POSCAR`, `CONTCAR`) and trajectory data (`XDATCAR`), as well as CIF files.

---

## 2. Getting Started

### Supported File Formats
*   **Structural Files**: `.vasp`, `POSCAR`, `CONTCAR`, `.cif`
*   **Trajectory Files**: `XDATCAR`
*   **Volumetric Data**: `CHGDIFF`, `PARCHG`, `LOCPOT`, `ELFCAR` (and generic `.vasp` files containing volumetric data)

### Loading Files
1.  **Drag & Drop**: Simply drag your file(s) into the dashed upload area on the control panel.
2.  **Click to Upload**: Click the upload area or the **"Upload Multiple Files"** button to select files from your computer.
3.  **Trajectory**: To load an animation, first load a structure file, then click the **"Upload XDATCAR (Trajectory)"** button below the file list.
4.  **Auto Demo**: (Note: The specific "Auto Demo" button was not found in the current codebase audit, but the system is designed for intuitive exploration.)

---

## 3. Visualization Controls

### Camera Views
Align your view instantly using the directional grid buttons in the Control Panel:
*   **Front**: Aligns the camera looking down the Z-axis (0, 0, 1). This view is locked to be orthogonal.
*   **Top / Bottom**: View along the Y-axis.
*   **Left / Right**: View along the X-axis.

### Material Styles
Choose from 7 distinct rendering styles to suit your needs:
*   **Preview**: Balanced default style.
*   **Classic (Vesta)**: Mimics the flat, clean look of VESTA software.
*   **Stick**: Ball-and-stick representation. *Parameter: Bond Radius*.
*   **Matte**: Soft, diffuse clay-like material.
*   **Metallic**: Shiny, reflective surface. *Parameters: Metalness, Roughness*.
*   **Glass**: Transparent, refractive material. *Parameters: Transmission, Thickness, IOR*.
*   **Toon**: Cel-shaded style with outlines.

### Global Element Settings (Source of Truth)
Modify element properties once, apply everywhere.
*   **Atom Colors**: Edit the text box (format: `Element/0/0/ColorHex`) to change colors globally.
    *   *Example*: Change Oxygen to blue by setting `O/0/0/#0000FF`.
*   **Atom Radii**: Edit the text box (format: `Element/0/0/Radius`) to adjust sizes globally.
*   **Consistency**: These settings persist across all uploaded files and during batch exports.

---

## 4. Advanced Features

### Supercell Generation
Expand your periodic system for better visualization.
1.  Locate the **Supercell Generation** section.
2.  Set the `x`, `y`, and `z` multipliers (e.g., 2 2 2).
3.  Click **Generate Supercell**.

### Trajectory Analysis (XDATCAR)
When an `XDATCAR` file is loaded:
*   **Playback Controls**: Play, Pause, Step Forward/Backward, Jump +/- 10 frames.
*   **Timeline Slider**: Scrub through the simulation timeline.
*   **Turbo Export**: Export MP4 videos with adjustable speed steps:
    *   **1x**: Full frame rendering.
    *   **2x, 5x, 10x**: Skip frames for faster rendering and shorter videos.
    *   **FPS**: Choose from 10, 24, 30, or 60 FPS.

### Electronic Structure (Volumetric Data)
When volumetric data (like `CHGDIFF`) is detected:
*   **Isovalue Level**: Adjust the slider to define the surface density threshold.
*   **Opacity**: Control the transparency of the isosurface.
*   **Coloring**: distinct colors for **Accumulation (+)** and **Depletion (-)** regions.

---

## 5. Editing & Interaction

### Mouse Controls
*   **Left Click + Drag**: Rotate the view.
*   **Middle Click + Drag**: Pan the view.
*   **Right Click + Drag**: Zoom in/out.
*   **Scroll Wheel**: Zoom in/out.

### Selection & Manipulation
*   **Single Select**: Click on an atom to select it.
*   **Multi-Select (Box)**: Hold **Shift** and drag with the Left Mouse Button to draw a selection box.
*   **Multi-Select (Click)**: Hold **Shift** and click atoms to add/remove from selection.
*   **Move Atom**: Click and drag any atom to move it (updates position in real-time).

### Atom Editing
With atoms selected, look at the "Selected Atoms" panel:
*   **Change Element**: Type a new symbol (e.g., "N") and click **Apply** to change the atom type.
*   **Delete**: Click **Delete Selected** to remove atoms.
*   **Reset**: Click **Reset All** to revert position and element changes.

---

## 6. Exporting

### High-Res Image Export
*   Click **Export High-Res** to generate a 4K (4096px) square PNG.
*   The output includes a transparent background for easy integration into presentations.

### Batch Export
*   Click **Batch Export All** to process all uploaded files.
*   The system renders each file one by one, applying your global color/radius settings and any specific edits.
*   Downloads a single `.zip` file containing all images.

### Video Export
*   Available in Trajectory mode.
*   Renders the animation to an H.264 MP4 file.
*   Uses the current view and style settings.
