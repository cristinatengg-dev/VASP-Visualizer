import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ComplianceFooter from '../components/ComplianceFooter';
import { COMPANY_NAME, SUPPORT_EMAIL, SUPPORT_MAILTO } from '../constants/contact';

const Manual: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white text-[#333] font-serif p-8 md:p-16 print:p-0">
      {/* Navigation - Hidden on Print */}
      <div className="max-w-4xl mx-auto mb-8 print:hidden">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-gray-600 hover:text-black transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to web
        </button>
      </div>

      <div className="max-w-4xl mx-auto space-y-12 print:w-full print:max-w-none">
        {/* Header */}
        <header className="border-b-2 border-gray-800 pb-6 mb-12">
          <h1 className="text-4xl font-bold mb-4">EliangMat AI 1.0 User Manual</h1>
          <p className="text-xl text-gray-600 italic">User Manual</p>
        </header>

        {/* 1. Introduction */}
        <section>
          <h2 className="text-2xl font-bold border-b border-gray-200 pb-2 mb-4">1. Product Introduction</h2>
          <p className="mb-4 leading-relaxed">
            EliangMat AI 1.0 is a high-performance web-based structure visualization platform built for researchers and HPC platforms <strong>Web-based High-Performance Structure Visualization Platform</strong>. Leveraging WebGL and WebCodecs hardware acceleration without requiring any plugins, it achieves second-level rendering and export of structures and trajectories directly in the browser.
          </p>
          <p className="mb-4 leading-relaxed">
            The platform features five intelligent Agents, covering the complete scientific Agent from <strong>Research Idea → Modeling → Compute → Visualization Rendering → Cover Generation</strong> .
          </p>
          <div className="bg-gray-50 p-4 rounded border border-gray-100 mb-4">
            <p className="font-bold mb-2">Supported Formats:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>VASP:</strong> POSCAR, CONTCAR, XDATCAR (Large-system trajectories supported)</li>
              <li><strong>Crystallography:</strong> .cif</li>
            </ul>
          </div>
          <div className="bg-gray-50 p-4 rounded border border-gray-100 mb-4">
            <p className="font-bold mb-2">Platform Agent Overview:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Idea Agent:</strong> Literature search + Structural database query + Intelligent research proposal generation</li>
              <li><strong>Modeling Agent:</strong> Conversational crystal structure modeling (Natural language → 3D structure)</li>
              <li><strong>Compute Agent:</strong> VASP input file compilation + HPC cluster configuration + Job submission</li>
              <li><strong>Rendering Agent:</strong> High-performance cloud structure visualization and trajectory rendering</li>
              <li><strong>Illustration Agent:</strong> Automatic journal cover generation based on paper content</li>
            </ul>
          </div>
        </section>

        {/* 2. Idea Agent */}
        <section>
          <h2 className="text-2xl font-bold border-b border-gray-200 pb-2 mb-4">2. Idea Agent — Intelligent Research Proposal Generation</h2>
          <p className="mb-4 leading-relaxed">
            Idea Agent helps researchers start from a single research requirement to automatically search academic literature, query the Materials Project database, and generate literature-backed computational research proposals.
          </p>

          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">2.1 Interface Layout</h3>
            <p className="mb-2">Idea Agent uses a three-column layout:</p>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li><strong>Left Column — Reasoning Timeline</strong>: Displays the Agent's reasoning process, including intent understanding, query translation, literature search, structure retrieval, and proposal generation stages. The input box is located at the bottom.</li>
              <li><strong>Center Column — Research Ideas</strong>: Displays generated research proposal cards and retrieved literature lists.</li>
              <li><strong>Right Column — Modeling Blueprint</strong>: Displays a detailed modeling blueprint after clicking a research proposal card, including structure source, modeling recipe, literature backing, and recommended path.</li>
            </ul>
          </div>

          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">2.2 Usage Steps</h3>
            <ol className="list-decimal pl-5 space-y-2 mb-4">
              <li><strong>Input Research Requirement</strong>: Describe your research goal using natural language in the input box at the bottom of the left column. Supports Chinese and English (Chinese queries are automatically translated to English for literature search).</li>
              <li><strong>Observe Reasoning Process</strong>: The timeline in the left column displays real-time progress for each stage—intent understanding, query translation, multi-source literature search, Materials Project structure query, and proposal generation.</li>
              <li><strong>Browse Research Proposals</strong>: The center column displays generated Idea cards, each annotated with a difficulty level (Starter / Intermediate / Advanced), model type, and target property. Cards with the "Recommended" badge indicate the system's recommended best option.</li>
              <li><strong>View Modeling Blueprint</strong>: Click an Idea card to view its detailed blueprint in the right column: rationale for selecting this direction, computable properties, structure source (including Materials Project ID), modeling recipe (initial structure, supercell size, defects/doping, etc.), literature backing, and notes.</li>
              <li><strong>Send to Modeling Agent</strong>: Click the "Send to Modeling Agent" button at the bottom of the blueprint to automatically pass modeling parameters to Modeling Agent and initiate modeling.</li>
            </ol>
          </div>

          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">2.3 Literature Search Sources</h3>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li><strong>CrossRef</strong>: Peer-reviewed journal papers</li>
              <li><strong>OpenAlex</strong>: Open academic graph</li>
              <li><strong>arXiv</strong>: Preprint papers</li>
              <li><strong>CORE</strong>: Open-access paper aggregation</li>
              <li><strong>Semantic Scholar</strong>: Academic graph, citation, and cross-disciplinary paper search</li>
              <li><strong>Europe PMC</strong>: Life sciences, medicine, and open full-text paper aggregation</li>
              <li><strong>PubMed</strong>: NCBI biomedical literature index</li>
              <li><strong>KeyanTong</strong>: Serves as an external search entry point for literature cards without automatically scraping or submitting document delivery requests</li>
              <li><strong>Materials Project</strong>: Materials structure database (returns chemical formula, crystal system, space group, energy above hull, etc.)</li>
            </ul>
          </div>
        </section>

        {/* 3. Modeling Agent */}
        <section>
          <h2 className="text-2xl font-bold border-b border-gray-200 pb-2 mb-4">3. Modeling Agent — Conversational Structure Modeling</h2>
          <p className="mb-4 leading-relaxed">
            Modeling Agent allows users to build crystal structure models through natural language conversation. It supports receiving handoff parameters from Idea Agent to automatically start modeling.
          </p>

          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">3.1 Interface Layout</h3>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li><strong>Left Panel — Chat Panel</strong>: Converse with the system to describe the structure you want to build. The system will parse your intent and generate modeling parameters.</li>
              <li><strong>Right Panel — Canvas Panel</strong>: Real-time preview of the generated crystal structure, supporting rotate, zoom, and pan operations.</li>
            </ul>
          </div>

          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">3.2 Usage Steps</h3>
            <ol className="list-decimal pl-5 space-y-2 mb-4">
              <li><strong>Describe Target Structure</strong>: Enter the description of the structure you want to build in the left chat box, e.g., "Build a bulk NaCoO2 crystal using Materials Project entry mp-867515".</li>
              <li><strong>System Parses Intent</strong>: Modeling Agent automatically parses your request, identifying chemical formulas, crystal phases, data sources, and other information.</li>
              <li><strong>Preview Structure</strong>: The generated structure will display in real time on the right 3D canvas.</li>
              <li><strong>Iterative Refinement</strong>: You can continue the conversation to adjust structural parameters, such as modifying supercell size, adding defects, or tuning doping.</li>
            </ol>
          </div>

          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">3.3 Receiving Parameters from Idea Agent</h3>
            <p className="mb-4 leading-relaxed">
              When you click "Send to Modeling Agent" in Idea Agent, Modeling Agent automatically receives the handoff parameters (including chemical formula, Materials Project ID, crystal phase information, and modeling prompt) and pre-fills them into the chat box, eliminating manual input steps.
            </p>
          </div>

          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">3.4 GROMACS Trajectory Viewer</h3>
            <p className="mb-3 leading-relaxed">
              Click "GROMACS Trajectory" at the top of Modeling Agent to enter the dedicated molecular dynamics visualization page.
            </p>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li><strong>File Combination</strong>: Initial structure must be uploaded <code>.gro</code> and trajectory <code>.xtc</code>; can simultaneously include <code>.tpr</code>、<code>.top</code> as task information.</li>
              <li><strong>Frame-by-Frame View</strong>: View or play back the full simulation using timeline, previous/next frame, first/last frame, FPS, and Step controls.</li>
              <li><strong>Display Mode</strong>: Supports NewCartoon, Ball &amp;amp; Stick, Licorice, Spacefill, Lines, as well as atom selections such as protein and ligand.</li>
              <li><strong>Full Trajectory</strong>: Overlay motion paths across the full time range onto a single scene after selecting Protein Cα, Backbone, Ligand, or heavy atoms.</li>
              <li><strong>Periodic Boundary</strong>: Provides quick centering, molecule repair, and backbone alignment on page; uploading trajectories corrected via <code>gmx trjconv</code> is still recommended for formal analysis.</li>
            </ul>
          </div>
        </section>

        {/* 4. Compute Agent */}
        <section>
          <h2 className="text-2xl font-bold border-b border-gray-200 pb-2 mb-4">4. Compute Agent — VASP Calculation Task Compilation &amp; Submission</h2>
          <p className="mb-4 leading-relaxed">
            Compute Agent automatically compiles structures generated by Modeling Agent into a complete suite of VASP input files, supporting HPC cluster parameter configuration and task submission.
          </p>

          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">4.1 5-Step Pipeline</h3>
            <ol className="list-decimal pl-5 space-y-2 mb-4">
              <li><strong>Select Structure</strong>: Confirm the target structure, inspect atom count and system type (Slab/Bulk, etc.), and verify selective dynamics (fixed atom) settings.</li>
              <li><strong>Compute Intent</strong>: Select calculation task type and parameters:
                <ul className="list-circle pl-5 mt-1 space-y-1 text-sm text-gray-700">
                  <li><strong>Task Type</strong>: Relax (structure optimization), Static (static calculation), DOS (density of states), Band (band structure), Adsorption (adsorption energy)</li>
                  <li><strong>Accuracy</strong>：Fast / Standard / High</li>
                  <li><strong>Core Settings</strong>: vDW (D3) dispersion correction toggle, Spin polarization toggle</li>
                </ul>
              </li>
              <li><strong>HPC Profile</strong>: Select and configure HPC cluster — node count, cores per node, maximum runtime (Walltime), executable file (vasp_std / vasp_gpu).</li>
              <li><strong>Review & Compile</strong>: Preview automatically compiled VASP input files (INCAR / KPOINTS / POSCAR / POTCAR) and inspect submission scripts (job.sh). Files are automatically validated (VALIDATED).</li>
              <li><strong>Job Monitor</strong>: After submitting to the cluster, monitor task status in real time, view Live Log output, and let Runtime Guardian (Custodian self-healing system) automatically detect and fix common VASP errors.</li>
            </ol>
          </div>
        </section>

        {/* 5. Rendering Agent */}
        <section>
          <h2 className="text-2xl font-bold border-b border-gray-200 pb-2 mb-4">5. Rendering Agent — Cloud Structure Visualization</h2>
          <p className="mb-4 leading-relaxed">
            Rendering Agent is the platform's core visualization engine, leveraging WebGL hardware acceleration to deliver zero-latency rendering of large systems and trajectory animation playback, supporting multiple publication-grade render styles and high-resolution export.
          </p>

          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">5.1 File Import</h3>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li><strong>Single File Upload</strong>: Click the dashed area or drag and drop files directly.</li>
              <li><strong>Multi-File Management</strong>: Supports uploading multiple structures at once (e.g., POSCAR + XDATCAR).</li>
              <li><strong>Smart Switch</strong>: Click the left file list to switch viewports. The system automatically saves a snapshot of modifications for the current file to prevent losing edits.</li>
            </ul>
          </div>

          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">5.2 Viewport Navigation</h3>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li><strong>Rotate</strong>: Left-click drag</li>
              <li><strong>Pan</strong>: Right-click drag</li>
              <li><strong>Zoom</strong>: Scroll wheel</li>
              <li><strong>Standard Views</strong>: Click Top / Down / Front / Left / Right buttons in the control panel to quickly align crystal planes.</li>
            </ul>
          </div>

          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">5.3 Render Styles</h3>
            <p className="mb-2">Select in the "Material Style" menu on the right:</p>
            <ol className="list-decimal pl-5 space-y-2 mb-4">
              <li><strong>Classic</strong>: Classic Ball-and-Stick model using standard CPK coloring. Switching to this style enables bonds by default (can be toggled off manually in Show Bonds).</li>
              <li><strong>Stick Representation</strong>: Stick-dominated view with reduced atom sphere size for marking element locations, suitable for complex frameworks or porous structures.</li>
              <li><strong>Scientific Matte</strong>: Non-reflective matte material with soft shadows, tailored for publication-grade 2D figures.</li>
              <li><strong>Metallic Glossy</strong>: Metallic texture supporting adjustment of Roughness and Metalness.</li>
              <li><strong>Glass / Transparent</strong>: Glass material. Supports Transmission adjustment for clear perspective into internal structures.</li>
              <li><strong>Toon / Cel Shaded</strong>: Cartoon outline style with distinct color layering, ideal for mechanism schematics.</li>
            </ol>
          </div>

          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">5.4 Structure &amp; Surface Treatment</h3>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li><strong>Show Bonds</strong>: Global toggle. Switching to Classic/Stick style enables bond display by default; for ultra-large systems (&amp;gt;5000 atoms), turning this off is recommended to improve performance.</li>
              <li><strong>Unit Cell</strong>: Show or hide the periodic boundary box.</li>
              <li><strong>Tidy Surface</strong>: Automatically detects molecules truncated by boundaries and generates "Ghost Atoms" outside periodic boundaries to complete bonds, producing a clean, intact surface.</li>
            </ul>
          </div>

          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">5.5 Lighting Configuration</h3>
            <p className="mb-2">Supports fine-grained adjustments to scene lighting:</p>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li><strong>Light Intensity</strong>: Adjust main light source brightness in real time to avoid overexposure.</li>
              <li><strong>Top Right</strong>: Click to adjust light source direction to enhance shadow details.</li>
            </ul>
          </div>

          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">5.6 XDATCAR Trajectory &amp; Animation</h3>
            <p className="mb-2">After uploading a trajectory file, a control bar appears at the bottom:</p>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li><strong>Progress Control</strong>: Drag the slider for quick positioning.</li>
              <li><strong>Step Fine-Tuning</strong>: Supports +1/-1 frame-by-frame inspection or +10/-10 quick jumps.</li>
            </ul>
            <h4 className="text-lg font-bold mb-2 mt-4">Turbo Export Video</h4>
            <p className="mb-2">GPU hardware-accelerated video encoding engine:</p>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li><strong>FPS Settings</strong>：15 / 24 / 60 FPS。</li>
              <li><strong>Sampling Acceleration</strong>：
                <ul className="list-circle pl-5 mt-1 space-y-1 text-sm text-gray-700">
                  <li><strong>1x (Full)</strong>: Exports frame by frame, smoothest.</li>
                  <li><strong>2x (Fast)</strong>: Exports 1 frame every 2 frames, doubling the speed.</li>
                  <li><strong>5x (Extreme)</strong>: Exports 1 frame every 5 frames, ideal for fast previews of long trajectories.</li>
                  <li><strong>10x (LightSpeed)</strong>: Ultra-fast export mode.</li>
                </ul>
              </li>
            </ul>
          </div>

          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">5.7 Atom Editing</h3>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li><strong>Select</strong>: Click to select atoms (supports Shift multi-select). Hold Shift and left-click drag in empty space for box selection; box selection is 3D pass-through (ignores occlusion, background atoms are also selected). Hold Ctrl/⌘ during box selection to append to the current selection.</li>
              <li><strong>Move</strong>: Drag selected atoms to modify coordinates (affects display only, without altering original data).</li>
              <li><strong>Change Element</strong>: Modify the element symbol in the panel input field (e.g., C -&amp;gt; N).</li>
              <li><strong>Delete</strong>: Click "Delete" to remove redundant atoms.</li>
              <li><strong>Mixed Rendering</strong>: In the Set Style for Selected dropdown menu, you can check additional display style modes. This feature is commonly used to highlight active sites or adsorbed molecules of catalysts.</li>
            </ul>
          </div>

          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">5.8 Supercell Generation</h3>
            <p className="mb-4">Enter supercell expansion factors (e.g., 2x2x1) and click generate. The system automatically handles periodic atom replication.</p>
          </div>

          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">5.9 Export</h3>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li><strong>Export High-Res Image</strong>: Export <strong>4K (4096px)</strong> resolution transparent-background PNG. The system automatically adjusts camera FOV to fit square canvases, ensuring saved images are distortion-free.</li>
              <li><strong>Batch Export All</strong>: Export all open files in the list as images with one click, automatically packed into a <code>.zip</code> download.</li>
            </ul>
          </div>

          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">5.10 Manual Config</h3>
            <p className="mb-2">At the bottom of the panel, you can manually enter text to override default settings:</p>
            <ul className="list-disc pl-5 space-y-2 mb-4 font-mono text-sm">
              <li><strong>Atom Colors</strong>: Fe/0/0/#FFA500 (format: element/placeholder/placeholder/HEX color)</li>
              <li><strong>Atom Radii</strong>: Fe/0/0/1.5</li>
              <li><strong>Bond Rules</strong>: Fe/O/2.5 (defines maximum bonding distance between Fe and O as 2.5 Å)</li>
            </ul>
          </div>
        </section>

        {/* 6. Illustration Agent */}
        <section>
          <h2 className="text-2xl font-bold border-b border-gray-200 pb-2 mb-4">6. Illustration Agent — Journal Cover Generation</h2>
          <p className="mb-4 leading-relaxed">
            Illustration Agent automatically generates high-quality journal cover images based on your scientific paper content.
          </p>

          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">6.1 6-Step Pipeline</h3>
            <ol className="list-decimal pl-5 space-y-2 mb-4">
              <li><strong>Input</strong>: Paste paper abstract/key paragraphs or upload PDF. Supports five input areas: core text, supplementary notes, style preferences, reference images, and advanced toggles.</li>
              <li><strong>Parsing (Scientific Entity Extraction)</strong>: The system automatically parses text to extract scientific entities (chemical formulas, reactants, products, intermediates, active sites, reaction mechanisms, etc.), generating structured JSON representations.</li>
              <li><strong>Plan Selection</strong>: The system generates three visual plan cards in different styles for selection. Each plan includes distinct composition concepts and visual focuses.</li>
              <li><strong>Prompt Review</strong>: Review the compiled full image generation prompt, which can be manually fine-tuned before confirmation.</li>
              <li><strong>Base Generation</strong>: The image model generates high-definition cover images, offering multiple candidates for selection.</li>
              <li><strong>Export</strong>: Download the final high-resolution cover image.</li>
            </ol>
          </div>

          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">6.2 Style Adjustment</h3>
            <p className="mb-2">Supports 6D style sliders to adjust cover style in real time:</p>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li><strong>Cinematic</strong>: Cinematic lighting effects</li>
              <li><strong>Macro</strong>: Microscopic zoomed-in view</li>
              <li><strong>Abstract</strong>: Abstract artistic degree</li>
              <li><strong>Realistic</strong>: Realistic render texture</li>
              <li><strong>Glass</strong>: Glass/transparent material</li>
              <li><strong>Metallic</strong>: Metallic texture</li>
            </ul>
          </div>

          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">6.3 Advanced Toggles</h3>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li><strong>Strict Chemical Structure</strong>: Enforce strict chemical structural correctness (CPK atom colors, accurate bonding)</li>
              <li><strong>Prioritize Accuracy</strong>: Prioritize scientific accuracy over artistic effects</li>
              <li><strong>Prioritize Art</strong>: Prioritize visual aesthetics and creative expression</li>
              <li><strong>Use Reference Constraint</strong>: Reference uploaded images to constrain generated style</li>
              <li><strong>Publish Export Mode</strong>: Enable publication-grade export quality</li>
            </ul>
          </div>
        </section>

        {/* 7. User Profile */}
        <section>
          <h2 className="text-2xl font-bold border-b border-gray-200 pb-2 mb-4">7. User Profile</h2>

          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">11.1 Access Method</h3>
            <p className="mb-4">Click the avatar icon at the top right of the page to enter User Profile. On this page, you can manage account information and view your current tier benefits.</p>
          </div>

          <div className="mb-6">
            <h3 className="text-xl font-bold mb-2">11.2 Overview of Features</h3>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li><strong>Quota Check</strong>: Displays remaining free image exports and video exports in real time.</li>
              <li><strong>Identity Badge</strong>: Displays current account tier.</li>
              <li><strong>Activate Benefits</strong>: Select account type here to upgrade your account.</li>
            </ul>
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-12 pt-6 border-t border-gray-200 text-center text-gray-500 text-sm">
          <p>&copy; 2026 EliangMat AI. All rights reserved.</p>
          <p className="mt-1">
            Support: <a href={SUPPORT_MAILTO} className="hover:text-gray-700 underline underline-offset-2">{SUPPORT_EMAIL}</a>
          </p>
          <p className="mt-1">{COMPANY_NAME}</p>
          <ComplianceFooter
            className="mt-1"
            linkClassName="hover:text-gray-700 underline underline-offset-2"
          />
        </footer>
      </div>
    </div>
  );
};

export default Manual;
