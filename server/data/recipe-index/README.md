# Local Ceder Recipe Index

This folder contains the normalized local synthesis recipe index used by the
Materials Research Stack agent.

## Included Index

- `ceder-recipes.jsonl.gz`
  - 76,975 normalized recipes.
  - Sources:
    - `CederGroupHub/text-mined-synthesis_public`
      - `solid-state_dataset_20200713.json.xz`: 31,782 records.
      - `sol-gel_dataset_20200713.json.xz`: 9,518 records.
    - `CederGroupHub/text-mined-solution-synthesis_public`
      - `solution-synthesis_dataset_2021-8-5.json.zip`: 35,675 records.

## Rebuild

```bash
npm run recipes:build-ceder-index -- \
  --synthesis-dir /path/to/text-mined-synthesis_public \
  --solution-dir /path/to/text-mined-solution-synthesis_public \
  --out server/data/recipe-index/ceder-recipes.jsonl.gz
```

The runtime can also point at a different index with:

```bash
CEDER_RECIPE_INDEX_PATH=/path/to/ceder-recipes.jsonl.gz
```

## Citations

- Kononova et al., Text-mined dataset of inorganic materials synthesis recipes,
  Scientific Data 6, 203 (2019). DOI: `10.1038/s41597-019-0224-1`.
- Wang et al., Dataset of solution-based inorganic materials synthesis procedures
  extracted from the scientific literature, Scientific Data 9, 231 (2022).
  DOI: `10.1038/s41597-022-01317-2`.
