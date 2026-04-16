/**
 * Computational Catalysis Toolkit – Frontend type definitions.
 *
 * These types mirror the JSON contracts exposed by the catalyst backend
 * routes at /api/catalyst/*.
 */

import type { MolecularStructure } from './index';

// ─── Shared ──────────────────────────────────────────────────────────────────

/** Render-ready structure payload consumed / produced by the toolkit. */
export interface RenderData {
  atoms: {
    element: string;
    position: { x: number; y: number; z: number };
    selectiveDynamics?: { x: boolean; y: boolean; z: boolean };
  }[];
  latticeVectors: number[][];
}

/** Standard API response envelope. */
export interface CatalystResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// ─── Slab ────────────────────────────────────────────────────────────────────

export interface SlabBuildParams {
  structure: RenderData;
  miller_index: [number, number, number];
  slab_thickness?: number;
  vacuum_thickness?: number;
  supercell?: [number, number, number];
  symmetric?: boolean;
  orthogonal?: boolean;
  lll_reduce?: boolean;
}

export interface SlabTermination {
  termination_index: number;
  n_atoms: number;
  surface_area: number;
  render_data: RenderData;
  poscar: string;
}

export interface SlabBuildResult {
  miller_index: number[];
  n_terminations: number;
  slabs: SlabTermination[];
  default_render_data: RenderData | null;
}

// ─── Molecule from SMILES ────────────────────────────────────────────────────

export interface MoleculeFromSmilesParams {
  smiles: string;
  box_padding?: number;
}

export interface MoleculeFromSmilesResult {
  smiles: string;
  formula: string;
  n_atoms: number;
  box_size: number;
  render_data: RenderData;
  poscar: string;
}

// ─── Adsorption ──────────────────────────────────────────────────────────────

export interface AdsorptionSiteParams {
  structure: RenderData;
  mode?: 'all' | 'ontop' | 'bridge' | 'hollow';
  distance?: number;
}

export interface AdsorptionSite {
  label: string;
  kind: 'ontop' | 'bridge' | 'hollow';
  cart_coords: [number, number, number];
}

export interface AdsorptionSiteResult {
  total_sites: number;
  counts: Record<string, number>;
  sites: AdsorptionSite[];
  default_site: string | null;
}

export interface PlaceAdsorbateParams {
  slab: RenderData;
  adsorbate: RenderData;
  site_cart_coords: [number, number, number];
  distance?: number;
}

export interface PlaceAdsorbateResult {
  n_atoms: number;
  n_slab_atoms: number;
  n_adsorbate_atoms: number;
  adsorbate_indices: number[];
  render_data: RenderData;
  poscar: string;
}

// ─── Supercell ───────────────────────────────────────────────────────────────

export interface SupercellParams {
  structure: RenderData;
  supercell: [number, number, number];
}

export interface SupercellResult {
  scaling: number[];
  n_atoms: number;
  render_data: RenderData;
  poscar: string;
}

// ─── Selective Dynamics ──────────────────────────────────────────────────────

export interface FixByLayersParams {
  structure: RenderData;
  freeze_layers: number;
  layer_tol?: number;
}

export interface FixByHeightParams {
  structure: RenderData;
  z_ranges: { z_min: number; z_max: number }[];
}

export interface FixByIndicesParams {
  structure: RenderData;
  indices: number[];
}

export interface SelectiveDynamicsResult {
  frozen_atoms: number;
  free_atoms: number;
  total_layers?: number;
  frozen_layers?: number;
  render_data: RenderData;
  poscar: string;
}

// ─── Symmetry & Defects ──────────────────────────────────────────────────────

export interface UniqueeSitesParams {
  structure: RenderData;
  symprec?: number;
}

export interface WyckoffGroup {
  group_id: number;
  wyckoff: string;
  element: string;
  representative_index: number;
  equivalent_indices: number[];
  multiplicity: number;
  frac_coords: number[];
}

export interface UniqueSitesResult {
  spacegroup: string;
  spacegroup_number: number;
  n_groups: number;
  groups: WyckoffGroup[];
}

export interface VacancyParams {
  structure: RenderData;
  site_index: number;
}

export interface VacancyResult {
  removed_element: string;
  removed_index: number;
  n_atoms: number;
  render_data: RenderData;
  poscar: string;
}

export interface SubstituteParams {
  structure: RenderData;
  site_index: number;
  new_species: string;
}

export interface SubstituteResult {
  old_species: string;
  new_species: string;
  site_index: number;
  n_atoms: number;
  render_data: RenderData;
  poscar: string;
}

// ─── NEB ─────────────────────────────────────────────────────────────────────

export interface NEBEstimateParams {
  initial: RenderData;
  final: RenderData;
  target_spacing?: number;
}

export interface NEBEstimateResult {
  recommended_images: number;
  max_atom_displacement: number;
  rss_displacement: number;
  per_atom_displacements: number[];
}

export interface NEBInterpolateParams {
  initial: RenderData;
  final: RenderData;
  n_images: number;
}

export interface NEBImage {
  index: number;
  label: string;
  render_data: RenderData;
  poscar: string;
}

export interface NEBInterpolateResult {
  n_images: number;
  total_frames: number;
  images: NEBImage[];
}

// ─── VASP Preparation ────────────────────────────────────────────────────────

export type VaspPreset = 'relax' | 'static' | 'freq' | 'dos';
export type VaspRegime = 'bulk' | 'slab' | 'gas';
export type VaspQuality = 'fast' | 'standard' | 'high';

export interface VaspPrepareParams {
  structure: RenderData;
  preset: VaspPreset;
  regime: VaspRegime;
  quality?: VaspQuality;
  vdw?: boolean;
  u_correction?: boolean;
  spin_mode?: 'auto' | 'none' | 'collinear' | 'polarized';
  relax_cell?: boolean;
  user_incar_patch?: Record<string, unknown>;
}

export interface VaspPrepareResult {
  preset: string;
  regime: string;
  quality: string;
  k_grid: number[];
  files: {
    INCAR: string;
    KPOINTS: string;
    POSCAR: string;
  };
  potcar_spec: { element: string; functional: string }[];
  n_atoms: number;
  formula: string;
}

// ─── K-path ──────────────────────────────────────────────────────────────────

export interface KpathParams {
  structure: RenderData;
  line_density?: number;
}

export interface KpathResult {
  path: string[][];
  labels: string[];
  coords: number[][];
  line_density: number;
  kpoints_file: string;
}

// ─── Generic tool call ──────────────────────────────────────────────────────

export type CatalystToolName =
  | 'build_slab'
  | 'create_molecule_from_smiles'
  | 'enumerate_adsorption_sites'
  | 'place_adsorbate'
  | 'make_supercell'
  | 'fix_atoms_by_layers'
  | 'fix_atoms_by_height'
  | 'fix_atoms_by_indices'
  | 'enumerate_unique_sites'
  | 'create_vacancy'
  | 'substitute_species'
  | 'estimate_neb_images'
  | 'make_neb_images'
  | 'prepare_vasp_inputs'
  | 'generate_kpath';

export interface GenericToolCallParams {
  tool: CatalystToolName;
  params: Record<string, unknown>;
}
